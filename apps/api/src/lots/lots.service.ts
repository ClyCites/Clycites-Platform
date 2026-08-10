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
  CreateCooperativeLotInput,
  CreateCustodyTransferInput,
  CreateQualityInspectionInput,
  PublishTraceabilityInput,
} from '@clycites/contracts';
import { PHASE_THREE_ERROR_CODES, publicLotTraceabilitySchema } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { BatchesService } from '../batches/batches.service.js';
import { formatQuantity, toQuantityUnits } from '../batches/quantity.js';
import { DatabaseService } from '../database/database.service.js';

const lotInclude = {
  organization: true,
  commodity: true,
  commodityForm: true,
  storageLocation: true,
  contributions: { include: { batch: true }, orderBy: { createdAt: 'asc' as const } },
  inspections: {
    include: { inspector: true, measurements: { include: { qualityAttributeDefinition: true } } },
    orderBy: { inspectedAt: 'desc' as const },
  },
  custodyTransfers: {
    include: { fromOrganization: true, toOrganization: true },
    orderBy: { createdAt: 'asc' as const },
  },
  publication: true,
} satisfies Prisma.CooperativeLotInclude;

@Injectable()
export class LotsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BatchesService) private readonly batches: BatchesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async create(
    organizationId: string,
    input: CreateCooperativeLotInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const lotId = randomUUID();
    await this.database.client.$transaction(
      async (transaction) => {
        const batchIds = [...new Set(input.contributions.map((item) => item.batchId))].sort();
        if (batchIds.length !== input.contributions.length)
          throw new UnprocessableEntityException('Lot contributions must use unique batches');
        for (const batchId of batchIds)
          await transaction.$queryRaw`SELECT id FROM "ProduceBatch" WHERE id = ${batchId}::uuid FOR UPDATE`;
        const batches = await transaction.produceBatch.findMany({
          where: {
            id: { in: batchIds },
            organizationId,
            status: 'SEALED',
            commodityId: input.commodityId,
            commodityFormId: input.commodityFormId,
          },
        });
        if (batches.length !== batchIds.length)
          this.conflict(
            PHASE_THREE_ERROR_CODES.COMMODITY_MISMATCH,
            'Every contribution must be a compatible sealed batch',
          );
        let total = 0n;
        for (const contribution of input.contributions) {
          const availability = await this.batches.batchAvailability(
            contribution.batchId,
            transaction,
          );
          const requested = toQuantityUnits(contribution.quantity);
          if (requested > availability.available)
            this.conflict(
              PHASE_THREE_ERROR_CODES.INSUFFICIENT_AVAILABLE_QUANTITY,
              'Lot contribution exceeds batch availability',
            );
          total += requested;
        }
        if (input.storageLocationId) {
          const location = await transaction.storageLocation.findFirst({
            where: { id: input.storageLocationId, organizationId, status: 'ACTIVE' },
          });
          if (!location)
            throw new UnprocessableEntityException(
              'Active organization storage location not found',
            );
        }
        await transaction.cooperativeLot.create({
          data: {
            id: lotId,
            publicId: `lot1_${randomUUID().replaceAll('-', '')}`,
            lotNumber: input.lotNumber,
            organizationId,
            commodityId: input.commodityId,
            commodityFormId: input.commodityFormId,
            ...(input.storageLocationId ? { storageLocationId: input.storageLocationId } : {}),
            status: 'READY',
            quantity: formatQuantity(total),
            createdByUserId: principal.subjectId,
          },
        });
        for (const item of input.contributions) {
          const relation = await transaction.cooperativeLotContribution.create({
            data: { lotId, batchId: item.batchId, quantity: item.quantity },
          });
          await transaction.inventoryLedgerEntry.create({
            data: {
              organizationId,
              commodityId: input.commodityId,
              commodityFormId: input.commodityFormId,
              entryType: 'LOT_ALLOCATION',
              sourceType: 'BATCH',
              sourceId: item.batchId,
              destinationType: 'LOT',
              destinationId: lotId,
              quantity: item.quantity,
              referenceType: 'CooperativeLotContribution',
              referenceId: relation.id,
            },
          });
          if ((await this.batches.batchAvailability(item.batchId, transaction)).available === 0n)
            await transaction.produceBatch.update({
              where: { id: item.batchId },
              data: { status: 'CONSUMED' },
            });
        }
        await this.record(
          transaction,
          organizationId,
          lotId,
          principal.subjectId,
          'COOPERATIVE_LOT_CREATED',
          requestId,
          { batchIds },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(organizationId, lotId);
  }

  async list(organizationId: string) {
    const lots = await this.database.client.cooperativeLot.findMany({
      where: { organizationId },
      include: lotInclude,
      orderBy: { createdAt: 'desc' },
    });
    return lots.map((lot) => this.serializeLot(lot));
  }

  async get(organizationId: string, lotId: string) {
    const lot = await this.database.client.cooperativeLot.findFirst({
      where: { id: lotId, organizationId },
      include: lotInclude,
    });
    if (!lot) throw new NotFoundException('Cooperative lot not found');
    return this.serializeLot(lot);
  }

  async inspect(
    organizationId: string,
    lotId: string,
    input: CreateQualityInspectionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const lot = await transaction.cooperativeLot.findFirst({
        where: { id: lotId, organizationId, status: { in: ['READY', 'APPROVED'] } },
      });
      if (!lot)
        this.conflict(
          PHASE_THREE_ERROR_CODES.INVALID_LOT_STATE,
          'Only a ready or approved lot can be inspected',
        );
      const definitions = await transaction.qualityAttributeDefinition.findMany({
        where: {
          id: { in: input.measurements.map((item) => item.qualityAttributeDefinitionId) },
          commodityFormId: lot.commodityFormId,
          status: 'ACTIVE',
          OR: [{ organizationId }, { organizationId: null }],
        },
      });
      if (definitions.length !== input.measurements.length)
        throw new UnprocessableEntityException(
          'Inspection contains an invalid or duplicate quality attribute',
        );
      const inspection = await transaction.qualityInspection.create({
        data: {
          organizationId,
          lotId,
          status: input.status,
          inspectorUserId: principal.subjectId,
          inspectedAt: new Date(input.inspectedAt),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      for (const measurement of input.measurements) {
        const definition = definitions.find(
          (candidate) => candidate.id === measurement.qualityAttributeDefinitionId,
        )!;
        if (definition.dataType !== measurement.dataType)
          throw new UnprocessableEntityException(
            'Inspection value type does not match its definition',
          );
        await transaction.qualityInspectionMeasurement.create({
          data: {
            inspectionId: inspection.id,
            qualityAttributeDefinitionId: definition.id,
            ...this.inspectionValue(measurement),
          },
        });
      }
      await this.record(
        transaction,
        organizationId,
        lotId,
        principal.subjectId,
        'LOT_QUALITY_INSPECTED',
        requestId,
        { inspectionId: inspection.id, status: input.status },
      );
    });
    return this.get(organizationId, lotId);
  }

  async approve(
    organizationId: string,
    lotId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const lot = await transaction.cooperativeLot.findFirst({
        where: { id: lotId, organizationId, status: 'READY' },
        include: { inspections: { orderBy: { inspectedAt: 'desc' }, take: 1 } },
      });
      if (!lot)
        this.conflict(
          PHASE_THREE_ERROR_CODES.INVALID_LOT_STATE,
          'Only a ready lot can be approved',
        );
      if (lot.inspections[0]?.status !== 'PASSED')
        this.conflict(
          PHASE_THREE_ERROR_CODES.QUALITY_INSPECTION_REQUIRED,
          'A passed quality inspection is required',
        );
      await transaction.cooperativeLot.update({
        where: { id: lotId },
        data: { status: 'APPROVED' },
      });
      await this.record(
        transaction,
        organizationId,
        lotId,
        principal.subjectId,
        'COOPERATIVE_LOT_APPROVED',
        requestId,
      );
    });
    return this.get(organizationId, lotId);
  }

  async createTransfer(
    organizationId: string,
    lotId: string,
    input: CreateCustodyTransferInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const transfer = await this.database.client.$transaction(async (transaction) => {
      const lot = await transaction.cooperativeLot.findFirst({
        where: { id: lotId, organizationId, status: 'APPROVED' },
      });
      if (!lot)
        this.conflict(
          PHASE_THREE_ERROR_CODES.INVALID_LOT_STATE,
          'Only an approved lot can transfer custody',
        );
      if (toQuantityUnits(input.quantity) > toQuantityUnits(lot.quantity.toString()))
        throw new UnprocessableEntityException('Transfer quantity exceeds lot quantity');
      const recipient = await transaction.organization.findFirst({
        where: { id: input.toOrganizationId, status: 'ACTIVE', deletedAt: null },
      });
      if (!recipient || recipient.id === organizationId)
        throw new UnprocessableEntityException('Active distinct recipient organization not found');
      const locationIds = [input.originLocationId, input.destinationLocationId].filter(
        (locationId): locationId is string => Boolean(locationId),
      );
      if (locationIds.length > 0) {
        const locations = await transaction.storageLocation.findMany({
          where: { id: { in: locationIds }, status: 'ACTIVE' },
          select: { id: true, organizationId: true },
        });
        const origin = locations.find((location) => location.id === input.originLocationId);
        const destination = locations.find(
          (location) => location.id === input.destinationLocationId,
        );
        if (input.originLocationId && origin?.organizationId !== organizationId)
          throw new UnprocessableEntityException(
            'Origin location must belong to the sending organization',
          );
        if (input.destinationLocationId && destination?.organizationId !== recipient.id)
          throw new UnprocessableEntityException(
            'Destination location must belong to the recipient organization',
          );
      }
      const active = await transaction.custodyTransfer.findFirst({
        where: { lotId, status: { in: ['DRAFT', 'DISPATCHED'] } },
      });
      if (active)
        this.conflict(
          PHASE_THREE_ERROR_CODES.CUSTODY_TRANSFER_CONFLICT,
          'The lot already has an active custody transfer',
        );
      const created = await transaction.custodyTransfer.create({
        data: {
          transferNumber: input.transferNumber,
          lotId,
          fromOrganizationId: organizationId,
          toOrganizationId: input.toOrganizationId,
          ...(input.originLocationId ? { originLocationId: input.originLocationId } : {}),
          ...(input.destinationLocationId
            ? { destinationLocationId: input.destinationLocationId }
            : {}),
          quantity: input.quantity,
          quantityUnit: input.unit,
          initiatedByUserId: principal.subjectId,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      await this.record(
        transaction,
        organizationId,
        lotId,
        principal.subjectId,
        'CUSTODY_TRANSFER_CREATED',
        requestId,
        { transferId: created.id, toOrganizationId: input.toOrganizationId },
      );
      return created;
    });
    return transfer;
  }

  async dispatchTransfer(
    organizationId: string,
    transferId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const transfer = await transaction.custodyTransfer.findFirst({
        where: { id: transferId, fromOrganizationId: organizationId, status: 'DRAFT' },
      });
      if (!transfer)
        this.conflict(
          PHASE_THREE_ERROR_CODES.CUSTODY_TRANSFER_CONFLICT,
          'Draft custody transfer not found',
        );
      const updated = await transaction.custodyTransfer.update({
        where: { id: transferId },
        data: { status: 'DISPATCHED', dispatchedAt: new Date() },
      });
      await this.record(
        transaction,
        organizationId,
        transfer.lotId,
        principal.subjectId,
        'CUSTODY_TRANSFER_DISPATCHED',
        requestId,
        { transferId },
      );
      return updated;
    });
  }

  async receiveTransfer(
    organizationId: string,
    transferId: string,
    accepted: boolean,
    notes: string | undefined,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      const transfer = await transaction.custodyTransfer.findFirst({
        where: { id: transferId, toOrganizationId: organizationId, status: 'DISPATCHED' },
      });
      if (!transfer)
        this.conflict(
          PHASE_THREE_ERROR_CODES.CUSTODY_TRANSFER_CONFLICT,
          'Dispatched custody transfer not found',
        );
      const updated = await transaction.custodyTransfer.update({
        where: { id: transferId },
        data: {
          status: accepted ? 'RECEIVED' : 'REJECTED',
          receivedByUserId: principal.subjectId,
          receivedAt: new Date(),
          ...(notes ? { notes } : {}),
        },
      });
      await this.record(
        transaction,
        transfer.fromOrganizationId,
        transfer.lotId,
        principal.subjectId,
        accepted ? 'CUSTODY_TRANSFER_RECEIVED' : 'CUSTODY_TRANSFER_REJECTED',
        requestId,
        { transferId, recipientOrganizationId: organizationId },
      );
      return updated;
    });
  }

  listTransfers(organizationId: string) {
    return this.database.client.custodyTransfer.findMany({
      where: { OR: [{ fromOrganizationId: organizationId }, { toOrganizationId: organizationId }] },
      include: { lot: true, fromOrganization: true, toOrganization: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async lineage(organizationId: string, lotId: string) {
    const lot = await this.database.client.cooperativeLot.findFirst({
      where: { id: lotId, organizationId },
      include: {
        contributions: {
          include: {
            batch: {
              include: {
                farmerContributions: {
                  include: {
                    delivery: {
                      include: {
                        farmer: {
                          select: {
                            id: true,
                            farmerNumber: true,
                            firstName: true,
                            lastName: true,
                            district: true,
                          },
                        },
                        farm: { select: { id: true, name: true, district: true } },
                      },
                    },
                  },
                },
                transformationOutputs: {
                  include: {
                    transformation: { include: { inputs: { include: { batch: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!lot) throw new NotFoundException('Cooperative lot not found');
    return lot;
  }

  async publish(
    organizationId: string,
    lotId: string,
    input: PublishTraceabilityInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const lot = await transaction.cooperativeLot.findFirst({
        where: { id: lotId, organizationId, status: 'APPROVED' },
        include: { inspections: { where: { status: 'PASSED' }, take: 1 } },
      });
      if (!lot || lot.inspections.length === 0)
        this.conflict(
          PHASE_THREE_ERROR_CODES.INVALID_LOT_STATE,
          'Only an inspected approved lot can be published',
        );
      const publicId = `tr1_${randomUUID().replaceAll('-', '')}`;
      await transaction.traceabilityPublication.upsert({
        where: { lotId },
        create: {
          organizationId,
          lotId,
          publicId,
          status: 'PUBLISHED',
          publishedClaims: input,
          publishedAt: new Date(),
          actorUserId: principal.subjectId,
        },
        update: {
          status: 'PUBLISHED',
          publishedClaims: input,
          publishedAt: new Date(),
          revokedAt: null,
          actorUserId: principal.subjectId,
        },
      });
      await this.record(
        transaction,
        organizationId,
        lotId,
        principal.subjectId,
        'LOT_TRACEABILITY_PUBLISHED',
        requestId,
      );
    });
    return this.get(organizationId, lotId);
  }

  async publicTrace(publicId: string) {
    const publication = await this.database.client.traceabilityPublication.findFirst({
      where: { publicId, status: 'PUBLISHED' },
      include: { lot: { include: lotInclude } },
    });
    if (!publication || publication.lot.status !== 'APPROVED' || !publication.publishedAt)
      throw new NotFoundException({
        code: PHASE_THREE_ERROR_CODES.TRACEABILITY_NOT_PUBLISHED,
        message: 'Published traceability record not found',
      });
    const lot = publication.lot;
    const claims = publication.publishedClaims as Prisma.JsonObject;
    const inspection = lot.inspections.find((item) => item.status === 'PASSED');
    return publicLotTraceabilitySchema.parse({
      publicId,
      lotNumber: lot.lotNumber,
      organizationName: lot.organization.name,
      commodity: lot.commodity.name,
      commodityForm: lot.commodityForm.name,
      quantity: lot.quantity.toString(),
      unit: lot.quantityUnit,
      status: 'APPROVED',
      originDistrict: claims.originDistrict,
      harvestSeason: claims.harvestSeason,
      processingSummary: claims.processingSummary,
      quality:
        inspection?.measurements.map((measurement) => ({
          name: measurement.qualityAttributeDefinition.name,
          value: this.measurementValue(measurement),
          unit: measurement.qualityAttributeDefinition.unit,
        })) ?? [],
      custody: lot.custodyTransfers
        .filter((transfer) => ['DISPATCHED', 'RECEIVED'].includes(transfer.status))
        .map((transfer) => ({
          fromOrganization: transfer.fromOrganization.name,
          toOrganization: transfer.toOrganization.name,
          dispatchedAt: transfer.dispatchedAt!.toISOString(),
          receivedAt: transfer.receivedAt?.toISOString() ?? null,
          status: transfer.status,
        })),
      publishedAt: publication.publishedAt.toISOString(),
    });
  }

  private serializeLot(lot: Prisma.CooperativeLotGetPayload<{ include: typeof lotInclude }>) {
    return {
      id: lot.id,
      publicId: lot.publicId,
      lotNumber: lot.lotNumber,
      status: lot.status,
      quantity: lot.quantity.toString(),
      unit: lot.quantityUnit,
      commodity: lot.commodity.name,
      commodityForm: lot.commodityForm.name,
      storageLocation: lot.storageLocation?.name ?? null,
      contributions: lot.contributions.map((item) => ({
        batchId: item.batchId,
        batchNumber: item.batch.batchNumber,
        quantity: item.quantity.toString(),
      })),
      inspections: lot.inspections.map((inspection) => ({
        id: inspection.id,
        status: inspection.status,
        inspectedAt: inspection.inspectedAt.toISOString(),
        inspectorName: `${inspection.inspector.firstName} ${inspection.inspector.lastName}`,
        measurements: inspection.measurements.map((measurement) => ({
          name: measurement.qualityAttributeDefinition.name,
          value: this.measurementValue(measurement),
          unit: measurement.qualityAttributeDefinition.unit,
        })),
      })),
      custodyTransfers: lot.custodyTransfers.map((transfer) => ({
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        status: transfer.status,
        fromOrganization: transfer.fromOrganization.name,
        toOrganization: transfer.toOrganization.name,
        quantity: transfer.quantity.toString(),
        dispatchedAt: transfer.dispatchedAt?.toISOString() ?? null,
        receivedAt: transfer.receivedAt?.toISOString() ?? null,
      })),
      publication: lot.publication
        ? {
            publicId: lot.publication.publicId,
            status: lot.publication.status,
            publishedAt: lot.publication.publishedAt?.toISOString() ?? null,
          }
        : null,
      createdAt: lot.createdAt.toISOString(),
    };
  }

  private inspectionValue(measurement: CreateQualityInspectionInput['measurements'][number]) {
    if (measurement.dataType === 'DECIMAL') return { decimalValue: measurement.value };
    if (measurement.dataType === 'INTEGER') return { integerValue: measurement.value };
    if (measurement.dataType === 'TEXT') return { textValue: measurement.value };
    if (measurement.dataType === 'ENUM') return { enumValue: measurement.value };
    return { booleanValue: measurement.value };
  }

  private measurementValue(measurement: {
    decimalValue: Prisma.Decimal | null;
    integerValue: number | null;
    textValue: string | null;
    booleanValue: boolean | null;
    enumValue: string | null;
  }) {
    return (
      measurement.decimalValue?.toString() ??
      measurement.integerValue?.toString() ??
      measurement.textValue ??
      measurement.booleanValue?.toString() ??
      measurement.enumValue ??
      ''
    );
  }

  private async record(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    lotId: string,
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
        entityType: 'CooperativeLot',
        entityId: lotId,
        requestId,
        metadata,
      },
      transaction,
    );
    await this.events.create(
      {
        aggregateType: 'CooperativeLot',
        aggregateId: lotId,
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
