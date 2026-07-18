import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { CreateBatchTransformationInput } from '@clycites/contracts';
import { PHASE_THREE_ERROR_CODES } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { DatabaseService } from '../database/database.service.js';
import { BatchesService } from './batches.service.js';
import { toQuantityUnits } from './quantity.js';

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
      include: { inputs: { include: { batch: true } }, outputs: { include: { batch: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(organizationId: string, transformationId: string) {
    const transformation = await this.database.client.batchTransformation.findFirst({
      where: { id: transformationId, organizationId },
      include: { inputs: { include: { batch: true } }, outputs: { include: { batch: true } } },
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
        const formIds = new Set(sourceBatches.map((batch) => batch.commodityFormId));
        if (commodityIds.size !== 1 || (input.type !== 'TRANSFORMATION' && formIds.size !== 1)) {
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
            code: 'TRANSFORMATION_MASS_GAIN_FORBIDDEN',
            message: 'Output quantity cannot exceed input quantity',
          });
        const sourceCommodityId = sourceBatches[0]?.commodityId;
        const sourceFormId = sourceBatches[0]?.commodityFormId;
        if (
          !sourceCommodityId ||
          input.outputs.some((output) => output.commodityId !== sourceCommodityId)
        ) {
          this.conflict(
            PHASE_THREE_ERROR_CODES.COMMODITY_MISMATCH,
            'Outputs must retain the input commodity',
          );
        }
        if (
          input.type !== 'TRANSFORMATION' &&
          input.outputs.some((output) => output.commodityFormId !== sourceFormId)
        ) {
          this.conflict(
            PHASE_THREE_ERROR_CODES.COMMODITY_MISMATCH,
            'Split and merge outputs must retain the input commodity form',
          );
        }
        const outputForms = await transaction.commodityForm.findMany({
          where: {
            id: { in: input.outputs.map((output) => output.commodityFormId) },
            commodityId: sourceCommodityId,
            status: 'ACTIVE',
          },
        });
        if (
          new Set(outputForms.map((form) => form.id)).size !==
          new Set(input.outputs.map((output) => output.commodityFormId)).size
        )
          throw new UnprocessableEntityException('Active output commodity form not found');
        const completedAt = new Date();
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
          },
        });
        for (const item of input.inputs) {
          const relation = await transaction.batchTransformationInput.create({
            data: {
              transformationId,
              batchId: item.batchId,
              quantity: item.quantity,
              unit: item.unit,
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
          const relation = await transaction.batchTransformationOutput.create({
            data: { transformationId, batchId, quantity: output.quantity, unit: output.unit },
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(organizationId, transformationId);
  }

  private conflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }
}
