import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { QualityDefinitionInput, UpdateQualityConfiguration } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class CoffeeConfigurationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async listCommodities() {
    const commodities = await this.database.client.commodity.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      include: {
        forms: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } },
      },
    });
    return commodities.map((commodity) => ({
      id: commodity.id,
      code: commodity.code,
      name: commodity.name,
      description: commodity.description,
      status: commodity.status,
      forms: commodity.forms.map((form) => ({
        id: form.id,
        commodityId: form.commodityId,
        code: form.code,
        name: form.name,
        description: form.description,
        defaultUnit: form.defaultUnit,
        status: form.status,
      })),
    }));
  }

  async listEffectiveQualityDefinitions(organizationId: string, commodityFormId: string) {
    await this.assertActiveForm(commodityFormId);
    const definitions = await this.database.client.qualityAttributeDefinition.findMany({
      where: {
        commodityFormId,
        status: 'ACTIVE',
        OR: [{ organizationId: null }, { organizationId }],
      },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    });
    const effective = new Map<string, (typeof definitions)[number]>();
    for (const definition of definitions) {
      const existing = effective.get(definition.code);
      if (!existing || definition.organizationId === organizationId) {
        effective.set(definition.code, definition);
      }
    }
    return [...effective.values()]
      .sort(
        (left, right) =>
          left.displayOrder - right.displayOrder || left.code.localeCompare(right.code),
      )
      .map((definition) => this.serializeDefinition(definition));
  }

  async replaceOrganizationQualityDefinitions(
    organizationId: string,
    commodityFormId: string,
    input: UpdateQualityConfiguration,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const duplicateCodes = input.definitions.filter(
      (definition, index) =>
        input.definitions.findIndex((candidate) => candidate.code === definition.code) !== index,
    );
    if (duplicateCodes.length > 0) {
      throw new ConflictException('Quality definition codes must be unique');
    }

    await this.database.client.$transaction(async (transaction) => {
      const form = await transaction.commodityForm.findFirst({
        where: { id: commodityFormId, status: 'ACTIVE', commodity: { status: 'ACTIVE' } },
      });
      if (!form) throw new NotFoundException('Active commodity form not found');

      const existing = await transaction.qualityAttributeDefinition.findMany({
        where: { organizationId, commodityFormId },
      });
      const inputCodes = new Set(input.definitions.map((definition) => definition.code));
      await transaction.qualityAttributeDefinition.updateMany({
        where: { organizationId, commodityFormId, code: { notIn: [...inputCodes] } },
        data: { status: 'INACTIVE' },
      });
      for (const definition of input.definitions) {
        const current = existing.find((candidate) => candidate.code === definition.code);
        const data = this.definitionData(definition);
        if (current) {
          await transaction.qualityAttributeDefinition.update({ where: { id: current.id }, data });
        } else {
          await transaction.qualityAttributeDefinition.create({
            data: { ...data, organizationId, commodityFormId },
          });
        }
      }
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'QUALITY_CONFIGURATION_REPLACED',
          entityType: 'CommodityForm',
          entityId: commodityFormId,
          requestId,
          metadata: { definitionCodes: [...inputCodes] },
        },
        transaction,
      );
      await this.events.create(
        {
          aggregateType: 'CommodityForm',
          aggregateId: commodityFormId,
          eventType: 'QUALITY_CONFIGURATION_REPLACED',
          payload: { organizationId, commodityFormId, definitionCodes: [...inputCodes] },
        },
        transaction,
      );
    });
    return this.listEffectiveQualityDefinitions(organizationId, commodityFormId);
  }

  private async assertActiveForm(commodityFormId: string) {
    const form = await this.database.client.commodityForm.findFirst({
      where: { id: commodityFormId, status: 'ACTIVE', commodity: { status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!form) throw new NotFoundException('Active commodity form not found');
  }

  private definitionData(definition: QualityDefinitionInput) {
    return {
      code: definition.code,
      name: definition.name,
      description: definition.description,
      dataType: definition.dataType,
      unit: definition.unit,
      required: definition.required,
      minimumValue: definition.minimumValue,
      maximumValue: definition.maximumValue,
      allowedValues: definition.allowedValues ?? Prisma.JsonNull,
      displayOrder: definition.displayOrder,
      status: definition.status,
    };
  }

  private serializeDefinition(
    definition: Awaited<
      ReturnType<typeof this.database.client.qualityAttributeDefinition.findFirstOrThrow>
    >,
  ) {
    return {
      id: definition.id,
      commodityFormId: definition.commodityFormId,
      organizationId: definition.organizationId,
      code: definition.code,
      name: definition.name,
      description: definition.description,
      dataType: definition.dataType,
      unit: definition.unit,
      required: definition.required,
      minimumValue: definition.minimumValue?.toString() ?? null,
      maximumValue: definition.maximumValue?.toString() ?? null,
      allowedValues: Array.isArray(definition.allowedValues) ? definition.allowedValues : null,
      displayOrder: definition.displayOrder,
      status: definition.status,
    };
  }
}
