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
  CreateBatchTransformationInput,
  SupersedeBatchTransformationInput,
} from '@clycites/contracts';
import { PHASE_THREE_ERROR_CODES } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';
import { assessWeighingInstrument } from '../deliveries/delivery-instrument.js';
import {
  allocateAttribution,
  mergeAttributionWeights,
  type AttributionSource,
} from './attribution.js';
import { BatchesService } from './batches.service.js';
import { formatQuantity, toQuantityUnits } from './quantity.js';
import { assessYield, lossRequiresReason, toRatioUnits } from './transformation-yield.js';

const transformationInclude = {
  inputs: { include: { batch: true } },
  outputs: { include: { batch: true } },
} satisfies Prisma.BatchTransformationInclude;

@Injectable()
export class TransformationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BatchesService) private readonly batches: BatchesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  list(organizationId: string) {
    return this.database.client.batchTransformation.findMany({
      where: { organizationId },
      include: transformationInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, transformationId: string) {
    const transformation = await this.database.client.batchTransformation.findFirst({
      where: { id: transformationId, organizationId },
      include: transformationInclude,
    });
    if (!transformation) throw new NotFoundException('Batch transformation not found');
    return transformation;
  }

  async create(
    organizationId: string,
    input: CreateBatchTransformationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const transformationId = randomUUID();
    await this.database.client.$transaction(
      async (transaction) => {
        await this.record(transaction, {
          transformationId,
          organizationId,
          input,
          principal,
          requestId,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(organizationId, transformationId);
  }

  // A completed transformation is never edited or deleted. It is reversed by mirrored
  // ledger entries and replaced by a new version that points back at it, so the record
  // of what was originally claimed survives the correction.
  async supersede(
    organizationId: string,
    transformationId: string,
    input: SupersedeBatchTransformationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const replacementId = randomUUID();
    await this.database.client.$transaction(
      async (transaction) => {
        const original = await transaction.batchTransformation.findFirst({
          where: { id: transformationId, organizationId },
          include: { inputs: { include: { batch: true } }, outputs: { include: { batch: true } } },
        });
        if (!original) throw new NotFoundException('Batch transformation not found');
        if (original.status !== 'COMPLETED')
          this.conflict(
            PHASE_THREE_ERROR_CODES.INVALID_BATCH_STATE,
            'Only a completed transformation can be superseded',
          );
        if (original.supersededAt)
          this.conflict(
            PHASE_THREE_ERROR_CODES.TRANSFORMATION_ALREADY_SUPERSEDED,
            'This transformation has already been superseded',
          );

        const lockIds = [
          ...new Set([
            ...original.inputs.map((item) => item.batchId),
            ...original.outputs.map((item) => item.batchId),
          ]),
        ].sort();
        for (const batchId of lockIds) {
          await transaction.$queryRaw`SELECT id FROM "ProduceBatch" WHERE id = ${batchId}::uuid FOR UPDATE`;
        }

        const reversedAt = new Date();
        for (const output of original.outputs) {
          // Once an output has been drawn down, the quantity is downstream and cannot be
          // pulled back, so the correction is refused rather than half-applied.
          const availability = await this.batches.batchAvailability(output.batchId, transaction);
          if (availability.allocated !== 0n || output.batch.status !== 'SEALED')
            this.conflict(
              PHASE_THREE_ERROR_CODES.TRANSFORMATION_OUTPUT_NOT_REVERSIBLE,
              `Batch ${output.batch.batchNumber} has already moved on and cannot be reversed`,
            );
          await transaction.inventoryLedgerEntry.create({
            data: {
              organizationId,
              commodityId: output.batch.commodityId,
              commodityFormId: output.batch.commodityFormId,
              entryType: 'TRANSFORMATION_OUTPUT_REVERSAL',
              destinationType: 'BATCH',
              destinationId: output.batchId,
              quantity: output.quantity,
              unit: output.unit,
              referenceType: 'BatchTransformationOutput',
              referenceId: output.id,
              occurredAt: reversedAt,
            },
          });
          await transaction.produceBatch.update({
            where: { id: output.batchId },
            data: { status: 'CANCELLED' },
          });
          await transaction.farmerBatchContribution.updateMany({
            where: { batchId: output.batchId, transformationId: original.id, reversedAt: null },
            data: {
              reversedAt,
              reversalReason: input.reason,
              reversedByUserId: principal.subjectId,
            },
          });
        }

        for (const item of original.inputs) {
          await transaction.inventoryLedgerEntry.create({
            data: {
              organizationId,
              commodityId: item.batch.commodityId,
              commodityFormId: item.batch.commodityFormId,
              entryType: 'TRANSFORMATION_INPUT_REVERSAL',
              sourceType: 'BATCH',
              sourceId: item.batchId,
              quantity: item.quantity,
              unit: item.unit,
              referenceType: 'BatchTransformationInput',
              referenceId: item.id,
              occurredAt: reversedAt,
            },
          });
          if (item.batch.status === 'CONSUMED')
            await transaction.produceBatch.update({
              where: { id: item.batchId },
              data: { status: 'SEALED' },
            });
        }

        await transaction.batchTransformation.update({
          where: { id: original.id },
          data: {
            supersededAt: reversedAt,
            supersededByUserId: principal.subjectId,
            supersessionReason: input.reason,
          },
        });

        await this.record(transaction, {
          transformationId: replacementId,
          organizationId,
          input: input.replacement,
          principal,
          requestId,
          supersedes: { id: original.id, version: original.version },
        });

        await this.audit.create(
          {
            organizationId,
            actorUserId: principal.subjectId,
            action: 'BATCH_TRANSFORMATION_SUPERSEDED',
            entityType: 'BatchTransformation',
            entityId: original.id,
            requestId,
            metadata: { reason: input.reason, replacedByTransformationId: replacementId },
          },
          transaction,
        );
        await this.events.create(
          {
            aggregateType: 'BatchTransformation',
            aggregateId: original.id,
            eventType: 'BATCH_TRANSFORMATION_SUPERSEDED',
            payload: {
              organizationId,
              replacedByTransformationId: replacementId,
              reason: input.reason,
            },
          },
          transaction,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(organizationId, replacementId);
  }

  private async record(
    transaction: Prisma.TransactionClient,
    context: {
      transformationId: string;
      organizationId: string;
      input: CreateBatchTransformationInput;
      principal: AuthenticatedPrincipal;
      requestId: string;
      supersedes?: { id: string; version: number };
    },
  ) {
    const { transformationId, organizationId, input, principal, requestId } = context;
    const inputIds = [...new Set(input.inputs.map((item) => item.batchId))].sort();
    if (inputIds.length !== input.inputs.length)
      throw new UnprocessableEntityException('Transformation inputs must be unique');
    for (const inputId of inputIds) {
      await transaction.$queryRaw`SELECT id FROM "ProduceBatch" WHERE id = ${inputId}::uuid FOR UPDATE`;
    }
    const sourceBatches = await transaction.produceBatch.findMany({
      where: { id: { in: inputIds }, organizationId, status: 'SEALED' },
    });
    if (sourceBatches.length !== inputIds.length)
      this.conflict(
        PHASE_THREE_ERROR_CODES.INVALID_BATCH_STATE,
        'Every input must be a sealed organization batch',
      );
    const commodityIds = new Set(sourceBatches.map((batch) => batch.commodityId));
    const inputFormIds = new Set(sourceBatches.map((batch) => batch.commodityFormId));
    if (commodityIds.size !== 1 || (input.type !== 'TRANSFORMATION' && inputFormIds.size !== 1)) {
      this.conflict(
        PHASE_THREE_ERROR_CODES.COMMODITY_MISMATCH,
        'Transformation inputs are incompatible',
      );
    }
    const requestedByBatch = new Map(
      input.inputs.map((item) => [item.batchId, toQuantityUnits(item.quantity)]),
    );
    let totalInput = 0n;
    for (const batch of sourceBatches) {
      const availability = await this.batches.batchAvailability(batch.id, transaction);
      const requested = requestedByBatch.get(batch.id) ?? 0n;
      if (requested > availability.available)
        this.conflict(
          PHASE_THREE_ERROR_CODES.INSUFFICIENT_AVAILABLE_QUANTITY,
          `Batch ${batch.batchNumber} has insufficient quantity`,
        );
      totalInput += requested;
    }
    const totalOutput = input.outputs.reduce(
      (sum, output) => sum + toQuantityUnits(output.quantity),
      0n,
    );
    if (totalOutput > totalInput)
      throw new UnprocessableEntityException({
        code: PHASE_THREE_ERROR_CODES.TRANSFORMATION_MASS_GAIN_FORBIDDEN,
        message: 'Output quantity cannot exceed input quantity',
      });

    // Mass that goes in and does not come out must be accounted for by name. Without
    // this an operator can quietly write off any fraction of a farmer's delivery.
    const lossUnits = totalInput - totalOutput;

    const sourceCommodityId = sourceBatches[0]?.commodityId;
    if (
      !sourceCommodityId ||
      input.outputs.some((output) => output.commodityId !== sourceCommodityId)
    ) {
      this.conflict(
        PHASE_THREE_ERROR_CODES.COMMODITY_MISMATCH,
        'Outputs must retain the input commodity',
      );
    }
    const sourceFormId = sourceBatches[0]?.commodityFormId;
    if (
      input.type !== 'TRANSFORMATION' &&
      input.outputs.some((output) => output.commodityFormId !== sourceFormId)
    ) {
      this.conflict(
        PHASE_THREE_ERROR_CODES.COMMODITY_MISMATCH,
        'Split and merge outputs must retain the input commodity form',
      );
    }
    const outputFormIds = new Set(input.outputs.map((output) => output.commodityFormId));
    const outputForms = await transaction.commodityForm.findMany({
      where: { id: { in: [...outputFormIds] }, commodityId: sourceCommodityId, status: 'ACTIVE' },
    });
    if (outputForms.length !== outputFormIds.size)
      throw new UnprocessableEntityException('Active output commodity form not found');

    if (!input.lossReason && lossRequiresReason(totalInput, totalOutput))
      throw new UnprocessableEntityException({
        code: PHASE_THREE_ERROR_CODES.TRANSFORMATION_LOSS_REASON_REQUIRED,
        message: `Losing ${formatQuantity(lossUnits)} of ${formatQuantity(totalInput)} requires a loss reason`,
      });
    if (input.lossQuantity !== undefined && toQuantityUnits(input.lossQuantity) !== lossUnits)
      throw new UnprocessableEntityException({
        code: PHASE_THREE_ERROR_CODES.TRANSFORMATION_LOSS_QUANTITY_MISMATCH,
        message: `Declared loss does not match the ${formatQuantity(lossUnits)} implied by the quantities`,
      });

    const yieldAssessment = await this.assessTransformationYield(transaction, {
      organizationId,
      commodityId: sourceCommodityId,
      inputFormIds,
      outputFormIds,
      totalInput,
      totalOutput,
    });

    // Attribution is captured before the inputs are consumed, from the live
    // contributions only: a reversed contribution must not travel downstream.
    const liveContributions = await transaction.farmerBatchContribution.findMany({
      where: { batchId: { in: inputIds }, reversedAt: null },
      select: { batchId: true, deliveryId: true, quantity: true },
      orderBy: [{ batchId: 'asc' }, { deliveryId: 'asc' }],
    });
    const attributionSources: AttributionSource[] = inputIds.map((batchId) => ({
      batchId,
      requestedUnits: requestedByBatch.get(batchId) ?? 0n,
      contributions: liveContributions
        .filter((contribution) => contribution.batchId === batchId)
        .map((contribution) => ({
          deliveryId: contribution.deliveryId,
          quantityUnits: toQuantityUnits(contribution.quantity.toFixed(4)),
        })),
    }));
    const attribution = mergeAttributionWeights(attributionSources);

    const completedAt = new Date();
    const instrumentById = await this.loadInstruments(transaction, organizationId, [
      ...input.inputs,
      ...input.outputs,
    ]);

    await transaction.batchTransformation.create({
      data: {
        id: transformationId,
        organizationId,
        transformationNumber: input.transformationNumber,
        type: input.type,
        status: 'COMPLETED',
        ...(input.description ? { description: input.description } : {}),
        completedByUserId: principal.subjectId,
        completedAt,
        yieldRatio: yieldAssessment.yieldRatio,
        yieldFlagged: yieldAssessment.yieldFlagged,
        yieldFlagReason: yieldAssessment.yieldFlagReason,
        ...(yieldAssessment.conversionId ? { conversionId: yieldAssessment.conversionId } : {}),
        lossQuantity: formatQuantity(lossUnits),
        ...(input.lossReason ? { lossReason: input.lossReason } : {}),
        ...(input.lossNote ? { lossNote: input.lossNote } : {}),
        ...(context.supersedes
          ? {
              version: context.supersedes.version + 1,
              supersedesTransformationId: context.supersedes.id,
            }
          : {}),
      },
    });
    for (const item of input.inputs) {
      const assessment = assessWeighingInstrument(
        item.instrumentId,
        instrumentById.get(item.instrumentId ?? '') ?? null,
        completedAt,
      );
      const relation = await transaction.batchTransformationInput.create({
        data: {
          transformationId,
          batchId: item.batchId,
          quantity: item.quantity,
          unit: item.unit,
          captureMethod: item.captureMethod ?? 'MANUAL',
          recordedByUserId: principal.subjectId,
          ...assessment,
        },
      });
      const batch = sourceBatches.find((candidate) => candidate.id === item.batchId)!;
      await transaction.inventoryLedgerEntry.create({
        data: {
          organizationId,
          commodityId: batch.commodityId,
          commodityFormId: batch.commodityFormId,
          entryType: 'TRANSFORMATION_INPUT',
          sourceType: 'BATCH',
          sourceId: batch.id,
          quantity: item.quantity,
          unit: item.unit,
          referenceType: 'BatchTransformationInput',
          referenceId: relation.id,
          occurredAt: completedAt,
        },
      });
      const remaining = (await this.batches.batchAvailability(batch.id, transaction)).available;
      if (remaining === 0n)
        await transaction.produceBatch.update({
          where: { id: batch.id },
          data: { status: 'CONSUMED' },
        });
    }
    for (const output of input.outputs) {
      const batchId = randomUUID();
      await transaction.produceBatch.create({
        data: {
          id: batchId,
          publicId: `pb1_${randomUUID().replaceAll('-', '')}`,
          batchNumber: output.batchNumber,
          organizationId,
          commodityId: output.commodityId,
          commodityFormId: output.commodityFormId,
          ...(output.storageLocationId ? { storageLocationId: output.storageLocationId } : {}),
          operationType: input.type,
          status: 'SEALED',
          initialQuantity: output.quantity,
          quantityUnit: output.unit,
          sealedAt: completedAt,
          createdByUserId: principal.subjectId,
        },
      });
      const assessment = assessWeighingInstrument(
        output.instrumentId,
        instrumentById.get(output.instrumentId ?? '') ?? null,
        completedAt,
      );
      const relation = await transaction.batchTransformationOutput.create({
        data: {
          transformationId,
          batchId,
          quantity: output.quantity,
          unit: output.unit,
          captureMethod: output.captureMethod ?? 'MANUAL',
          recordedByUserId: principal.subjectId,
          ...assessment,
        },
      });
      await transaction.inventoryLedgerEntry.create({
        data: {
          organizationId,
          commodityId: output.commodityId,
          commodityFormId: output.commodityFormId,
          entryType: 'TRANSFORMATION_OUTPUT',
          destinationType: 'BATCH',
          destinationId: batchId,
          quantity: output.quantity,
          unit: output.unit,
          referenceType: 'BatchTransformationOutput',
          referenceId: relation.id,
          occurredAt: completedAt,
        },
      });

      // Carry farmer attribution onto the output batch. These rows are DERIVED:
      // they move no quantity, so they intentionally write no ledger entry and do
      // not increment initialQuantity, which the output already carries in full.
      const shares = allocateAttribution(attribution, toQuantityUnits(output.quantity));
      for (const share of shares) {
        await transaction.farmerBatchContribution.create({
          data: {
            batchId,
            deliveryId: share.deliveryId,
            quantity: formatQuantity(share.quantityUnits),
            unit: output.unit,
            origin: 'DERIVED',
            transformationId,
          },
        });
      }
    }
    await this.audit.create(
      {
        organizationId,
        actorUserId: principal.subjectId,
        action: 'BATCH_TRANSFORMATION_COMPLETED',
        entityType: 'BatchTransformation',
        entityId: transformationId,
        requestId,
        metadata: {
          type: input.type,
          totalInputQuantity: input.inputs.map((item) => item.quantity).join('+'),
          totalOutputQuantity: input.outputs.map((item) => item.quantity).join('+'),
          yieldRatio: yieldAssessment.yieldRatio,
          lossQuantity: formatQuantity(lossUnits),
          ...(input.lossReason ? { lossReason: input.lossReason } : {}),
        },
      },
      transaction,
    );
    if (yieldAssessment.yieldFlagged)
      await this.audit.create(
        {
          organizationId,
          actorUserId: principal.subjectId,
          action: 'BATCH_TRANSFORMATION_YIELD_FLAGGED',
          entityType: 'BatchTransformation',
          entityId: transformationId,
          requestId,
          metadata: {
            yieldRatio: yieldAssessment.yieldRatio,
            yieldFlagReason: yieldAssessment.yieldFlagReason,
            conversionId: yieldAssessment.conversionId,
          },
        },
        transaction,
      );
    await this.events.create(
      {
        aggregateType: 'BatchTransformation',
        aggregateId: transformationId,
        eventType: 'BATCH_TRANSFORMATION_COMPLETED',
        payload: { organizationId, type: input.type, inputBatchIds: inputIds },
      },
      transaction,
    );
  }

  private async assessTransformationYield(
    transaction: Prisma.TransactionClient,
    context: {
      organizationId: string;
      commodityId: string;
      inputFormIds: Set<string>;
      outputFormIds: Set<string>;
      totalInput: bigint;
      totalOutput: bigint;
    },
  ) {
    const [fromFormId] = [...context.inputFormIds];
    const [toFormId] = [...context.outputFormIds];
    const singlePair = context.inputFormIds.size === 1 && context.outputFormIds.size === 1;
    const formChanged = !singlePair || fromFormId !== toFormId;
    const conversion =
      singlePair && fromFormId && toFormId && fromFormId !== toFormId
        ? await transaction.commodityFormConversion.findFirst({
            where: {
              commodityId: context.commodityId,
              fromFormId,
              toFormId,
              OR: [{ organizationId: context.organizationId }, { organizationId: null }],
            },
            // An organization's own measured range outranks the platform default.
            orderBy: { organizationId: { sort: 'asc', nulls: 'last' } },
          })
        : null;
    return assessYield({
      inputUnits: context.totalInput,
      outputUnits: context.totalOutput,
      formChanged,
      conversion: conversion
        ? {
            id: conversion.id,
            minRatioUnits: toRatioUnits(conversion.minRatio.toFixed(6)),
            maxRatioUnits: toRatioUnits(conversion.maxRatio.toFixed(6)),
          }
        : null,
    });
  }

  private async loadInstruments(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    items: { instrumentId?: string | undefined }[],
  ) {
    const ids = items
      .map((item) => item.instrumentId)
      .filter((id): id is string => Boolean(id))
      .filter((id, index, all) => all.indexOf(id) === index);
    const instruments = ids.length
      ? await transaction.weighingInstrument.findMany({
          where: { id: { in: ids }, organizationId },
        })
      : [];
    return new Map(instruments.map((instrument) => [instrument.id, instrument]));
  }

  private conflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }
}
