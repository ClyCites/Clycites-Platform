import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSION_CODES,
  resolveEffectivePermissions,
  ROLES,
  type AuthenticatedPrincipal,
  type Permission,
  type Role,
} from '@clycites/auth';
import { PHASE_NINE_ERROR_CODES, type TenantContext } from '@clycites/contracts';

import { DatabaseService } from '../database/database.service.js';

export interface ResolvedTenant {
  organizationId: string;
  membershipId: string | null;
  baseRole: Role | null;
  customRoleIds: string[];
  permissions: Permission[];
  isPlatformAdmin: boolean;
}

@Injectable()
export class TenantContextService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /**
   * Resolves the effective tenant context for a principal within an organization,
   * enforcing tenant isolation. Platform admins bypass membership checks; every
   * other principal must have an ACTIVE membership in the target organization.
   */
  async resolve(
    principal: AuthenticatedPrincipal,
    organizationId: string,
  ): Promise<ResolvedTenant> {
    const isPlatformAdmin = principal.roles.includes(ROLES.PLATFORM_ADMIN);

    const organization = await this.database.client.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!organization) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.TENANT_NOT_FOUND,
        message: 'Organization not found',
      });
    }

    if (isPlatformAdmin) {
      return {
        organizationId,
        membershipId: null,
        baseRole: null,
        customRoleIds: [],
        permissions: [...PERMISSION_CODES],
        isPlatformAdmin: true,
      };
    }

    const membership = await this.database.client.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: principal.subjectId } },
      include: {
        customRoleAssignments: {
          include: {
            customRole: { include: { permissions: true } },
          },
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: PHASE_NINE_ERROR_CODES.TENANT_ACCESS_DENIED,
        message: 'You do not have access to this organization',
      });
    }
    if (membership.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: PHASE_NINE_ERROR_CODES.TENANT_MEMBERSHIP_INACTIVE,
        message: 'Your membership in this organization is not active',
      });
    }

    const baseRole = membership.role as Role;
    const activeCustomRoleAssignments = membership.customRoleAssignments.filter(
      (assignment) => assignment.customRole.status === 'ACTIVE',
    );
    const customPermissionCodes = activeCustomRoleAssignments.flatMap((assignment) =>
      assignment.customRole.permissions.map((permission) => permission.permissionCode),
    );

    return {
      organizationId,
      membershipId: membership.id,
      baseRole,
      customRoleIds: activeCustomRoleAssignments.map((assignment) => assignment.customRoleId),
      permissions: resolveEffectivePermissions([baseRole], customPermissionCodes),
      isPlatformAdmin: false,
    };
  }

  assertPermissions(tenant: ResolvedTenant, required: readonly Permission[]): void {
    if (tenant.isPlatformAdmin) return;
    const missing = required.filter((permission) => !tenant.permissions.includes(permission));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: PHASE_NINE_ERROR_CODES.TENANT_ACCESS_DENIED,
        message: 'Permission denied for this tenant',
      });
    }
  }

  async context(principal: AuthenticatedPrincipal): Promise<TenantContext> {
    const user = await this.database.client.user.findUnique({
      where: { id: principal.subjectId },
      include: {
        memberships: {
          where: { status: { in: ['INVITED', 'ACTIVE', 'SUSPENDED'] } },
          include: {
            organization: true,
            customRoleAssignments: {
              include: { customRole: { include: { permissions: true } } },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.TENANT_NOT_FOUND,
        message: 'User not found',
      });
    }

    const memberships = user.memberships.filter(
      (membership) => !membership.organization.deletedAt,
    );
    const activeMembership =
      memberships.find((membership) => membership.status === 'ACTIVE') ?? null;

    const effectivePermissions = activeMembership
      ? resolveEffectivePermissions(
          [activeMembership.role],
          activeMembership.customRoleAssignments
            .filter((assignment) => assignment.customRole.status === 'ACTIVE')
            .flatMap((assignment) =>
              assignment.customRole.permissions.map((permission) => permission.permissionCode),
            ),
        )
      : [];

    return {
      user: {
        id: user.id,
        email: user.email ?? '',
        displayName: `${user.firstName} ${user.lastName}`.trim(),
        platformRole: user.platformRole,
      },
      activeOrganizationId: activeMembership?.organizationId ?? null,
      memberships: memberships.map((membership) => ({
        organizationId: membership.organizationId,
        slug: membership.organization.slug,
        displayName: membership.organization.name,
        role: membership.role,
        status: membership.status,
      })),
      effectivePermissions: user.platformRole === 'PLATFORM_ADMIN'
        ? [...PERMISSION_CODES]
        : effectivePermissions,
    };
  }
}
