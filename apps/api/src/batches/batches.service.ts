import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type {
  AddBatchContributionInput,
  CreateBatchInput,
  CreateStorageLocationInput,
} from '@clycites/contracts';
import { PHASE_THREE_ERROR_CODES } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';
import { formatQuantity, toQuantityUnits } from './quantity.js';

const batchInclude = {
  commodity: true,
  commodityForm: true,
  storageLocation: true,
  farmerContributions: {
    where: { reversedAt: null },
    include: { delivery: { include: { farmer: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ProduceBatchInclude;

@Injectable()
export class BatchesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async createStorageLocation(
    organizationId: string,
    input: CreateStorageLocationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const location = await transaction.storageLocation.create({
        data: {
          organizationId,
          code: input.code.toUpperCase(),
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
        },
      });
      await this.recordMutation(
        transaction,
        organizationId,
        location.id,
        principal.subjectId,
        'STORAGE_LOCATION_CREATED',
        requestId,
      );
      return location;
    });
  }

  listStorageLocations(organizationId: string) {
    return this.database.client.storageLocation.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    organizationId: string,
    input: CreateBatchInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const batchId = input.clientBatchId ?? randomUUID();
    await this.database.client.$transaction(
      async (transaction) => {
        await this.validateConfiguration(
          transaction,
          organizationId,
          input.commodityId,
          input.commodityFormId,
          input.storageLocationId,
        );
        await transaction.produceBatch.create({
          data: {
            id: batchId,
            publicId: `pb1_${randomUUID().replaceAll('-', '')}`,
            batchNumber: input.batchNumber,
            organizationId,
            commodityId: input.commodityId,
            commodityFormId: input.commodityFormId,
            ...(input.storageLocationId ? { storageLocationId: input.storageLocationId } : {}),
            status: 'OPEN',
            initialQuantity: '0',
            createdByUserId: principal.subjectId,
          },
        });
        await this.recordMutation(
          transaction,
          organizationId,
          batchId,
          principal.subjectId,
          'PRODUCE_BATCH_CREATED',
          requestId,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(organizationId, batchId);
  }

  async list(organizationId: string) {
    const batches = await this.database.client.produceBatch.findMany({
      where: { organizationId },
      include: batchInclude,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(batches.map((batch) => this.serializeBatch(batch)));
  }

  async get(organizationId: string, batchId: string) {
    const batch = await this.database.client.produceBatch.findFirst({
      where: { id: batchId, organizationId },
      include: batchInclude,
    });
    if (!batch) throw new NotFoundException('Produce batch not found');
    return this.serializeBatch(batch);
  }

  async availableDeliveries(organizationId: string) {
    const deliveries = await this.database.client.delivery.findMany({
      where: { organizationId, status: 'ACCEPTED', supersededBy: null },
      include: {
        farmer: true,
        commodity: true,
        commodityForm: true,
        measurements: { where: { measurementType: 'WEIGHT' } },
      },
      orderBy: { acceptedAt: 'asc' },
    });
    return Promise.all(
      deliveries.map(async (delivery) => {
        const total = delivery.measurements[0]?.netQuantity.toString() ?? '0';
        const allocated = await this.allocatedQuantity('DELIVERY', delivery.id);
        const available = toQuantityUnits(total) - allocated;
        return {
          id: delivery.id,
          deliveryNumber: delivery.deliveryNumber,
          farmerName: `${delivery.farmer.firstName} ${delivery.farmer.lastName}`,
          commodity: delivery.commodity.name,
          commodityForm: delivery.commodityForm.name,
          commodityId: delivery.commodityId,
          commodityFormId: delivery.commodityFormId,
          totalQuantity: total,
          allocatedQuantity: formatQuantity(allocated),
          availableQuantity: formatQuantity(available),
          unit: 'KG' as const,
        };
      }),
    );
  }

  async contribute(
    organizationId: string,
    batchId: string,
    input: AddBatchContributionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "Delivery" WHERE id = ${input.deliveryId}::uuid FOR UPDATE`;
        await transaction.$queryRaw`SELECT id FROM "ProduceBatch" WHERE id = ${batchId}::uuid FOR UPDATE`;
        const [delivery, batch] = await Promise.all([
          transaction.delivery.findFirst({
            where: { id: input.deliveryId, organizationId, status: 'ACCEPTED', supersededBy: null },
            include: { measurements: { where: { measurementType: 'WEIGHT' } } },
          }),
          transaction.produceBatch.findFirst({
            where: { id: batchId, organizationId, status: 'OPEN' },
          }),
        ]);
        if (!delivery)
          this.conflict(
            PHASE_THREE_ERROR_CODES.SOURCE_NOT_ACCEPTED,
            'Only a current accepted delivery can contribute',
          );
        if (!batch)
          this.conflict(
            PHASE_THREE_ERROR_CODES.INVALID_BATCH_STATE,
            'Contributions require an open batch',
          );
        if (
          delivery.commodityId !== batch.commodityId ||
          delivery.commodityFormId !== batch.commodityFormId
        ) {
          this.conflict(
            PHASE_THREE_ERROR_CODES.COMMODITY_MISMATCH,
            'Delivery and batch commodity forms must match',
          );
        }
        const total = delivery.measurements[0]?.netQuantity.toString();
        if (!total) throw new UnprocessableEntityException('Accepted delivery has no weight');
        const allocated = await this.allocatedQuantity('DELIVERY', delivery.id, transaction);
        const requested = toQuantityUnits(input.quantity);
        if (requested > toQuantityUnits(total) - allocated) {
          this.conflict(
            PHASE_THREE_ERROR_CODES.INSUFFICIENT_AVAILABLE_QUANTITY,
            'Contribution exceeds delivery availability',
          );
        }
        const contribution = await transaction.farmerBatchContribution.create({
          data: { batchId, deliveryId: delivery.id, quantity: input.quantity, unit: input.unit },
        });
        await transaction.inventoryLedgerEntry.create({
          data: {
            organizationId,
            commodityId: delivery.commodityId,
            commodityFormId: delivery.commodityFormId,
            entryType: 'DELIVERY_CONTRIBUTION',
            sourceType: 'DELIVERY',
            sourceId: delivery.id,
            destinationType: 'BATCH',
            destinationId: batchId,
            quantity: input.quantity,
            unit: input.unit,
            referenceType: 'FarmerBatchContribution',
            referenceId: contribution.id,
          },
        });
        await transaction.produceBatch.update({
          where: { id: batchId },
          data: { initialQuantity: { increment: input.quantity } },
        });
        await this.recordMutation(
          transaction,
          organizationId,
          batchId,
          principal.subjectId,
          'FARMER_BATCH_CONTRIBUTION_ADDED',
          requestId,
          { deliveryId: delivery.id, contributionId: contribution.id, quantity: input.quantity },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(organizationId, batchId);
  }

  async seal(
    organizationId: string,
    batchId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const batch = await transaction.produceBatch.findFirst({
        where: { id: batchId, organizationId, status: 'OPEN' },
      });
      if (!batch || batch.initialQuantity.lessThanOrEqualTo(0)) {
        this.conflict(
          PHASE_THREE_ERROR_CODES.INVALID_BATCH_STATE,
          'Only a non-empty open batch can be sealed',
        );
      }
      await transaction.produceBatch.update({
        where: { id: batchId },
        data: { status: 'SEALED', sealedAt: new Date() },
      });
      await this.recordMutation(
        transaction,
        organizationId,
        batchId,
        principal.subjectId,
        'PRODUCE_BATCH_SEALED',
        requestId,
      );
    });
    return this.get(organizationId, batchId);
  }

  async batchAvailability(batchId: string, transaction?: Prisma.TransactionClient) {
    const client = transaction ?? this.database.client;
    const batch = await client.produceBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('Produce batch not found');
    const allocated = await this.allocatedQuantity('BATCH', batchId, transaction);
    const total = toQuantityUnits(batch.initialQuantity.toString());
    return { total, allocated, available: total - allocated };
  }

  private async allocatedQuantity(
    sourceType: 'DELIVERY' | 'BATCH',
    sourceId: string,
    transaction?: Prisma.TransactionClient,
  ) {
    const client = transaction ?? this.database.client;
    const grouped = await client.inventoryLedgerEntry.groupBy({
      by: ['entryType'],
      where: { sourceType, sourceId },
      _sum: { quantity: true },
    });
    // The ledger is append-only and its quantities must stay positive, so a superseded
    // transformation shows up as a mirrored reversal that gives the quantity back.
    return grouped.reduce((total, row) => {
      const amount = toQuantityUnits(row._sum.quantity?.toString() ?? '0');
      return row.entryType === 'TRANSFORMATION_INPUT_REVERSAL' ? total - amount : total + amount;
    }, 0n);
  }

  private async serializeBatch(
    batch: Prisma.ProduceBatchGetPayload<{ include: typeof batchInclude }>,
  ) {
    const availability = await this.batchAvailability(batch.id);
    return {
      id: batch.id,
      publicId: batch.publicId,
      batchNumber: batch.batchNumber,
      status: batch.status,
      operationType: batch.operationType,
      commodity: batch.commodity.name,
      commodityForm: batch.commodityForm.name,
      commodityId: batch.commodityId,
      commodityFormId: batch.commodityFormId,
      storageLocation: batch.storageLocation?.name ?? null,
      totalQuantity: formatQuantity(availability.total),
      allocatedQuantity: formatQuantity(availability.allocated),
      availableQuantity: formatQuantity(availability.available),
      unit: batch.quantityUnit,
      sealedAt: batch.sealedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
      contributions: batch.farmerContributions.map((contribution) => ({
        id: contribution.id,
        deliveryId: contribution.deliveryId,
        deliveryNumber: contribution.delivery.deliveryNumber,
        farmerName: `${contribution.delivery.farmer.firstName} ${contribution.delivery.farmer.lastName}`,
        quantity: contribution.quantity.toString(),
        unit: contribution.unit,
        origin: contribution.origin,
        transformationId: contribution.transformationId,
      })),
    };
  }

  private async validateConfiguration(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    commodityId: string,
    commodityFormId: string,
    storageLocationId?: string,
  ) {
    const form = await transaction.commodityForm.findFirst({
      where: {
        id: commodityFormId,
        commodityId,
        status: 'ACTIVE',
        commodity: { status: 'ACTIVE' },
      },
    });
    if (!form) throw new UnprocessableEntityException('Active commodity form not found');
    if (storageLocationId) {
      const location = await transaction.storageLocation.findFirst({
        where: { id: storageLocationId, organizationId, status: 'ACTIVE' },
      });
      if (!location)
        throw new UnprocessableEntityException('Active organization storage location not found');
    }
  }

  private async recordMutation(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    entityId: string,
    actorUserId: string,
    action: string,
    requestId: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await this.audit.create(
      {
        organizationId,
        actorUserId,
        action,
        entityType: 'ProduceBatch',
        entityId,
        requestId,
        metadata,
      },
      transaction,
    );
    await this.events.create(
      {
        aggregateType: 'ProduceBatch',
        aggregateId: entityId,
        eventType: action,
        payload: { organizationId, ...metadata },
      },
      transaction,
    );
  }

  private conflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }
}
