import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPermissionCode, resolveEffectivePermissions } from '@clycites/auth';
import {
  PHASE_NINE_ERROR_CODES,
  type AuditEvent,
  type AuditFilter,
  type BrandingResponse,
  type CreateCustomRoleInput,
  type CustomRole,
  type EffectivePermissions,
  type FeatureDefinition,
  type OperationsSummary,
  type OrganizationFeature,
  type PublicBranding,
  type SavedView,
  type SetOrganizationFeatureInput,
  type UpdateCustomRoleInput,
  type UpsertBrandingInput,
  type UpsertSavedViewInput,
} from '@clycites/contracts';
import type { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AdministrationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // -- Branding -------------------------------------------------------------

  async getBranding(organizationId: string): Promise<BrandingResponse> {
    const branding = await this.database.client.organizationBranding.findUnique({
      where: { organizationId },
    });
    if (!branding) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.BRANDING_NOT_FOUND,
        message: 'Branding has not been configured for this organization',
      });
    }
    return this.mapBranding(branding);
  }

  async upsertBranding(
    organizationId: string,
    input: UpsertBrandingInput,
    actorUserId: string,
    requestId: string,
  ): Promise<BrandingResponse> {
    const existing = await this.database.client.organizationBranding.findUnique({
      where: { organizationId },
    });
    if (existing && input.version !== undefined && input.version !== existing.version) {
      throw new ConflictException({
        code: PHASE_NINE_ERROR_CODES.BRANDING_VERSION_CONFLICT,
        message: 'Branding was modified by another request',
      });
    }

    const data = {
      displayName: input.displayName,
      shortName: input.shortName ?? null,
      logoObjectKey: input.logoObjectKey ?? null,
      iconObjectKey: input.iconObjectKey ?? null,
      primaryColor: input.primaryColor ?? null,
      secondaryColor: input.secondaryColor ?? null,
      accentColor: input.accentColor ?? null,
      supportEmail: input.supportEmail ?? null,
      supportPhone: input.supportPhone ?? null,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
    };

    const branding = await this.database.client.$transaction(async (transaction) => {
      const saved = existing
        ? await transaction.organizationBranding.update({
            where: { organizationId },
            data: { ...data, version: { increment: 1 }, updatedByUserId: actorUserId },
          })
        : await transaction.organizationBranding.create({
            data: { ...data, organizationId, createdByUserId: actorUserId },
          });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: existing ? 'branding.updated' : 'branding.created',
          entityType: 'OrganizationBranding',
          entityId: saved.id,
          requestId,
        },
        transaction,
      );
      return saved;
    });
    return this.mapBranding(branding);
  }

  async publicBranding(slug: string): Promise<PublicBranding> {
    const organization = await this.database.client.organization.findFirst({
      where: { slug, deletedAt: null },
      include: { branding: true },
    });
    if (!organization?.branding) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.BRANDING_NOT_FOUND,
        message: 'Branding not found',
      });
    }
    const branding = organization.branding;
    return {
      displayName: branding.displayName,
      shortName: branding.shortName,
      logoUrl: branding.logoObjectKey,
      iconUrl: branding.iconObjectKey,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      locale: branding.locale,
    };
  }

  // -- Features -------------------------------------------------------------

  async listFeatureDefinitions(): Promise<FeatureDefinition[]> {
    const definitions = await this.database.client.featureDefinition.findMany({
      where: { status: { not: 'DISABLED' } },
      orderBy: { code: 'asc' },
    });
    return definitions.map((definition) => ({
      id: definition.id,
      code: definition.code,
      name: definition.name,
      description: definition.description,
      riskLevel: definition.riskLevel,
      defaultEnabled: definition.defaultEnabled,
      status: definition.status,
    }));
  }

  async listOrganizationFeatures(organizationId: string): Promise<OrganizationFeature[]> {
    const [definitions, overrides] = await Promise.all([
      this.database.client.featureDefinition.findMany({
        where: { status: { not: 'DISABLED' } },
        orderBy: { code: 'asc' },
      }),
      this.database.client.organizationFeature.findMany({ where: { organizationId } }),
    ]);
    const overrideByDefinition = new Map(
      overrides.map((override) => [override.featureDefinitionId, override]),
    );
    return definitions.map((definition) => {
      const override = overrideByDefinition.get(definition.id);
      return {
        featureDefinitionId: definition.id,
        code: definition.code,
        name: definition.name,
        riskLevel: definition.riskLevel,
        enabled: override?.enabled ?? definition.defaultEnabled,
        configuration: (override?.configuration as Record<string, unknown> | null) ?? null,
        version: override?.version ?? 0,
        updatedAt: (override?.updatedAt ?? definition.updatedAt).toISOString(),
      };
    });
  }

  async setOrganizationFeature(
    organizationId: string,
    input: SetOrganizationFeatureInput,
    actorUserId: string,
    requestId: string,
  ): Promise<OrganizationFeature> {
    const definition = await this.database.client.featureDefinition.findUnique({
      where: { id: input.featureDefinitionId },
    });
    if (!definition || definition.status === 'DISABLED') {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.FEATURE_DEFINITION_NOT_FOUND,
        message: 'Feature definition not found',
      });
    }
    const highRisk = definition.riskLevel === 'HIGH' || definition.riskLevel === 'CRITICAL';
    if (input.enabled && highRisk && !input.reason) {
      throw new ForbiddenException({
        code: PHASE_NINE_ERROR_CODES.FEATURE_HIGH_RISK_APPROVAL_REQUIRED,
        message: 'A reason is required to enable a high-risk feature',
      });
    }

    const existing = await this.database.client.organizationFeature.findUnique({
      where: {
        organizationId_featureDefinitionId: {
          organizationId,
          featureDefinitionId: input.featureDefinitionId,
        },
      },
    });
    if (existing && input.version !== undefined && input.version !== existing.version) {
      throw new ConflictException({
        code: PHASE_NINE_ERROR_CODES.FEATURE_VERSION_CONFLICT,
        message: 'Feature value was modified by another request',
      });
    }

    const configuration = (input.configuration ?? undefined) as
      | Prisma.InputJsonValue
      | undefined;

    const saved = await this.database.client.$transaction(async (transaction) => {
      const feature = existing
        ? await transaction.organizationFeature.update({
            where: {
              organizationId_featureDefinitionId: {
                organizationId,
                featureDefinitionId: input.featureDefinitionId,
              },
            },
            data: {
              enabled: input.enabled,
              ...(configuration === undefined ? {} : { configuration }),
              version: { increment: 1 },
              updatedByUserId: actorUserId,
            },
          })
        : await transaction.organizationFeature.create({
            data: {
              organizationId,
              featureDefinitionId: input.featureDefinitionId,
              enabled: input.enabled,
              ...(configuration === undefined ? {} : { configuration }),
              updatedByUserId: actorUserId,
            },
          });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: input.enabled ? 'feature.enabled' : 'feature.disabled',
          entityType: 'OrganizationFeature',
          entityId: feature.id,
          requestId,
          metadata: {
            code: definition.code,
            riskLevel: definition.riskLevel,
            reason: input.reason ?? null,
          },
        },
        transaction,
      );
      return feature;
    });

    return {
      featureDefinitionId: definition.id,
      code: definition.code,
      name: definition.name,
      riskLevel: definition.riskLevel,
      enabled: saved.enabled,
      configuration: (saved.configuration as Record<string, unknown> | null) ?? null,
      version: saved.version,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  // -- Custom roles ---------------------------------------------------------

  async listCustomRoles(organizationId: string): Promise<CustomRole[]> {
    const roles = await this.database.client.customRole.findMany({
      where: { organizationId },
      include: { permissions: true },
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => this.mapCustomRole(role));
  }

  async createCustomRole(
    organizationId: string,
    input: CreateCustomRoleInput,
    actorUserId: string,
    requestId: string,
  ): Promise<CustomRole> {
    this.assertPermissionCodes(input.permissions);
    const conflict = await this.database.client.customRole.findUnique({
      where: { organizationId_name: { organizationId, name: input.name } },
    });
    if (conflict) {
      throw new ConflictException({
        code: PHASE_NINE_ERROR_CODES.ROLE_NAME_CONFLICT,
        message: 'A role with this name already exists',
      });
    }
    const role = await this.database.client.$transaction(async (transaction) => {
      const created = await transaction.customRole.create({
        data: {
          organizationId,
          name: input.name,
          description: input.description ?? null,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          permissions: {
            create: [...new Set(input.permissions)].map((permissionCode) => ({ permissionCode })),
          },
        },
        include: { permissions: true },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: 'role.created',
          entityType: 'CustomRole',
          entityId: created.id,
          requestId,
          metadata: { name: created.name },
        },
        transaction,
      );
      return created;
    });
    return this.mapCustomRole(role);
  }

  async updateCustomRole(
    organizationId: string,
    roleId: string,
    input: UpdateCustomRoleInput,
    actorUserId: string,
    requestId: string,
  ): Promise<CustomRole> {
    if (input.permissions) this.assertPermissionCodes(input.permissions);
    const existing = await this.database.client.customRole.findFirst({
      where: { id: roleId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.ROLE_NOT_FOUND,
        message: 'Custom role not found',
      });
    }
    if (input.version !== existing.version) {
      throw new ConflictException({
        code: PHASE_NINE_ERROR_CODES.ROLE_VERSION_CONFLICT,
        message: 'Role was modified by another request',
      });
    }
    if (input.name && input.name !== existing.name) {
      const conflict = await this.database.client.customRole.findUnique({
        where: { organizationId_name: { organizationId, name: input.name } },
      });
      if (conflict) {
        throw new ConflictException({
          code: PHASE_NINE_ERROR_CODES.ROLE_NAME_CONFLICT,
          message: 'A role with this name already exists',
        });
      }
    }

    const role = await this.database.client.$transaction(async (transaction) => {
      if (input.permissions) {
        await transaction.customRolePermission.deleteMany({ where: { customRoleId: roleId } });
        await transaction.customRolePermission.createMany({
          data: [...new Set(input.permissions)].map((permissionCode) => ({
            customRoleId: roleId,
            permissionCode,
          })),
        });
      }
      const updated = await transaction.customRole.update({
        where: { id: roleId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.status ? { status: input.status } : {}),
          version: { increment: 1 },
          updatedByUserId: actorUserId,
        },
        include: { permissions: true },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: 'role.updated',
          entityType: 'CustomRole',
          entityId: roleId,
          requestId,
        },
        transaction,
      );
      return updated;
    });
    return this.mapCustomRole(role);
  }

  async assignCustomRole(
    organizationId: string,
    membershipId: string,
    customRoleId: string,
    actorUserId: string,
    requestId: string,
  ): Promise<EffectivePermissions> {
    const [membership, role] = await Promise.all([
      this.database.client.organizationMembership.findFirst({
        where: { id: membershipId, organizationId },
      }),
      this.database.client.customRole.findFirst({
        where: { id: customRoleId, organizationId },
      }),
    ]);
    if (!membership) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.TENANT_NOT_FOUND,
        message: 'Membership not found in this organization',
      });
    }
    if (!role) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.ROLE_NOT_FOUND,
        message: 'Custom role not found',
      });
    }
    const existing = await this.database.client.membershipCustomRole.findUnique({
      where: { membershipId_customRoleId: { membershipId, customRoleId } },
    });
    if (existing) {
      throw new ConflictException({
        code: PHASE_NINE_ERROR_CODES.ROLE_ASSIGNMENT_CONFLICT,
        message: 'Role is already assigned to this membership',
      });
    }
    await this.database.client.$transaction(async (transaction) => {
      await transaction.membershipCustomRole.create({
        data: { membershipId, customRoleId, assignedByUserId: actorUserId },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: 'role.assigned',
          entityType: 'MembershipCustomRole',
          entityId: membershipId,
          requestId,
          metadata: { customRoleId, role: role.name },
        },
        transaction,
      );
    });
    return this.effectivePermissions(organizationId, membershipId);
  }

  async unassignCustomRole(
    organizationId: string,
    membershipId: string,
    customRoleId: string,
    actorUserId: string,
    requestId: string,
  ): Promise<EffectivePermissions> {
    const assignment = await this.database.client.membershipCustomRole.findUnique({
      where: { membershipId_customRoleId: { membershipId, customRoleId } },
      include: { membership: true },
    });
    if (!assignment || assignment.membership.organizationId !== organizationId) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.ROLE_ASSIGNMENT_CONFLICT,
        message: 'Role assignment not found',
      });
    }
    await this.database.client.$transaction(async (transaction) => {
      await transaction.membershipCustomRole.delete({
        where: { membershipId_customRoleId: { membershipId, customRoleId } },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: 'role.unassigned',
          entityType: 'MembershipCustomRole',
          entityId: membershipId,
          requestId,
          metadata: { customRoleId },
        },
        transaction,
      );
    });
    return this.effectivePermissions(organizationId, membershipId);
  }

  async effectivePermissions(
    organizationId: string,
    membershipId: string,
  ): Promise<EffectivePermissions> {
    const membership = await this.database.client.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: {
        customRoleAssignments: {
          include: { customRole: { include: { permissions: true } } },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.TENANT_NOT_FOUND,
        message: 'Membership not found in this organization',
      });
    }
    const activeAssignments = membership.customRoleAssignments.filter(
      (assignment) => assignment.customRole.status === 'ACTIVE',
    );
    const permissions = resolveEffectivePermissions(
      [membership.role],
      activeAssignments.flatMap((assignment) =>
        assignment.customRole.permissions.map((permission) => permission.permissionCode),
      ),
    );
    return {
      membershipId: membership.id,
      userId: membership.userId,
      organizationId,
      baseRole: membership.role,
      customRoleIds: activeAssignments.map((assignment) => assignment.customRoleId),
      permissions,
    };
  }

  // -- Saved views ----------------------------------------------------------

  async listSavedViews(organizationId: string, userId: string): Promise<SavedView[]> {
    const views = await this.database.client.savedDashboardView.findMany({
      where: {
        organizationId,
        OR: [{ scope: 'ORGANIZATION' }, { userId }],
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return views.map((view) => this.mapSavedView(view));
  }

  async upsertSavedView(
    organizationId: string,
    userId: string,
    input: UpsertSavedViewInput,
  ): Promise<SavedView> {
    const existing = await this.database.client.savedDashboardView.findUnique({
      where: { organizationId_userId_name: { organizationId, userId, name: input.name } },
    });
    const configuration = input.configuration as Prisma.InputJsonValue;
    const view = await this.database.client.$transaction(async (transaction) => {
      if (input.isDefault) {
        await transaction.savedDashboardView.updateMany({
          where: { organizationId, userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return existing
        ? transaction.savedDashboardView.update({
            where: { id: existing.id },
            data: { scope: input.scope, configuration, isDefault: input.isDefault },
          })
        : transaction.savedDashboardView.create({
            data: {
              organizationId,
              userId,
              name: input.name,
              scope: input.scope,
              configuration,
              isDefault: input.isDefault,
            },
          });
    });
    return this.mapSavedView(view);
  }

  async deleteSavedView(organizationId: string, userId: string, viewId: string): Promise<void> {
    const view = await this.database.client.savedDashboardView.findFirst({
      where: { id: viewId, organizationId },
    });
    if (!view || view.userId !== userId) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.SAVED_VIEW_NOT_FOUND,
        message: 'Saved view not found',
      });
    }
    await this.database.client.savedDashboardView.delete({ where: { id: viewId } });
  }

  // -- Audit + operations ---------------------------------------------------

  async listAudit(
    organizationId: string,
    filter: AuditFilter,
  ): Promise<{ items: AuditEvent[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } }> {
    const where: Prisma.AuditEventWhereInput = {
      organizationId,
      ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
      ...(filter.action ? { action: { contains: filter.action, mode: 'insensitive' } } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.dateRange
        ? {
            createdAt: {
              gte: new Date(`${filter.dateRange.from}T00:00:00.000Z`),
              lt: this.nextDay(filter.dateRange.to),
            },
          }
        : {}),
    };
    const [totalItems, rows] = await Promise.all([
      this.database.client.auditEvent.count({ where }),
      this.database.client.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        actorUserId: row.actorUserId,
        actorType: row.actorType,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        requestId: row.requestId,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: {
        page: filter.page,
        pageSize: filter.pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / filter.pageSize)),
      },
    };
  }

  async operationsSummary(organizationId: string): Promise<OperationsSummary> {
    const dayAgo = new Date(Date.now() - 86_400_000);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [
      pendingReportExports,
      failedReportExports24h,
      auditEvents24h,
      featureFlagChanges7d,
      activeUsers24h,
    ] = await Promise.all([
      this.database.client.reportExport.count({
        where: { organizationId, status: { in: ['PENDING', 'PROCESSING'] } },
      }),
      this.database.client.reportExport.count({
        where: { organizationId, status: 'FAILED', createdAt: { gte: dayAgo } },
      }),
      this.database.client.auditEvent.count({
        where: { organizationId, createdAt: { gte: dayAgo } },
      }),
      this.database.client.auditEvent.count({
        where: {
          organizationId,
          createdAt: { gte: weekAgo },
          action: { in: ['feature.enabled', 'feature.disabled'] },
        },
      }),
      this.database.client.auditEvent
        .findMany({
          where: { organizationId, createdAt: { gte: dayAgo }, actorUserId: { not: null } },
          select: { actorUserId: true },
          distinct: ['actorUserId'],
        })
        .then((rows) => rows.length),
    ]);
    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      activeUsers24h,
      pendingReportExports,
      failedReportExports24h,
      auditEvents24h,
      featureFlagChanges7d,
    };
  }

  // -- Mappers / helpers ----------------------------------------------------

  private mapBranding(branding: {
    organizationId: string;
    displayName: string;
    shortName: string | null;
    logoObjectKey: string | null;
    iconObjectKey: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
    locale: string;
    timezone: string;
    currency: string;
    version: number;
    updatedAt: Date;
  }): BrandingResponse {
    return {
      organizationId: branding.organizationId,
      displayName: branding.displayName,
      shortName: branding.shortName,
      logoObjectKey: branding.logoObjectKey,
      iconObjectKey: branding.iconObjectKey,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      accentColor: branding.accentColor,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
      locale: branding.locale,
      timezone: branding.timezone,
      currency: branding.currency,
      version: branding.version,
      updatedAt: branding.updatedAt.toISOString(),
    };
  }

  private mapCustomRole(role: {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    permissions: { permissionCode: string }[];
  }): CustomRole {
    return {
      id: role.id,
      organizationId: role.organizationId,
      name: role.name,
      description: role.description,
      status: role.status as CustomRole['status'],
      permissions: role.permissions.map((permission) => permission.permissionCode),
      version: role.version,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  private mapSavedView(view: {
    id: string;
    organizationId: string;
    userId: string;
    name: string;
    scope: string;
    configuration: unknown;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SavedView {
    return {
      id: view.id,
      organizationId: view.organizationId,
      userId: view.userId,
      name: view.name,
      scope: view.scope as SavedView['scope'],
      configuration: (view.configuration as Record<string, unknown>) ?? {},
      isDefault: view.isDefault,
      createdAt: view.createdAt.toISOString(),
      updatedAt: view.updatedAt.toISOString(),
    };
  }

  private assertPermissionCodes(codes: readonly string[]): void {
    const invalid = codes.filter((code) => !isPermissionCode(code));
    if (invalid.length > 0) {
      throw new ConflictException({
        code: PHASE_NINE_ERROR_CODES.ROLE_PERMISSION_INVALID,
        message: `Unknown permission codes: ${invalid.join(', ')}`,
      });
    }
  }

  private nextDay(date: string): Date {
    const next = new Date(`${date}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
}
