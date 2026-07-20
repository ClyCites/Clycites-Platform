import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import {
  PHASE_SIX_ERROR_CODES,
  type CreateFarmerPaymentMethodInput,
  type CreateDeductionPolicyInput,
  type CreatePaymentInstructionInput,
  type CreateManualReconciliationInput,
  type CreateSettlementRunInput,
  type RecordSaleProceedsInput,
  type ReverseSaleProceedsInput,
  type VerifySaleProceedsInput,
  type SettlementVersionActionInput,
  type PaymentInstructionVersionActionInput,
  type ReviewReconciliationInput,
} from '@clycites/contracts';
import { Prisma } from '@clycites/database';
import { type Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { formatQuantity, toQuantityUnits } from '../batches/quantity.js';
import { DatabaseService } from '../database/database.service.js';
import { PAYMENT_SUBMISSION_QUEUE, PAYMENT_SUBMIT_JOB } from '../queue/queue.constants.js';
import { allocateSaleProceeds, type BatchLineageInput } from './allocation-engine.js';
import { PaymentEncryptionService } from './payment-encryption.service.js';

@Injectable()
export class SettlementsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
    @Inject(PaymentEncryptionService) private readonly encryption: PaymentEncryptionService,
    @Inject(PAYMENT_SUBMISSION_QUEUE) private readonly paymentSubmissionQueue: Queue,
  ) {}

  async listSaleProceeds(organizationId: string) {
    const records = await this.database.client.saleProceedsRecord.findMany({
      where: { organizationId },
      include: { order: { select: { orderNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => this.serializeProceeds(record));
  }

  async recordSaleProceeds(
    organizationId: string,
    input: RecordSaleProceedsInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${input.orderId}::uuid FOR UPDATE`;
      const order = await transaction.salesOrder.findFirst({
        where: { id: input.orderId, sellerOrganizationId: organizationId },
        include: {
          buyerAcceptances: {
            where: { supersededByAcceptance: null },
            orderBy: { decidedAt: 'desc' },
            take: 1,
          },
        },
      });
      const acceptance = order?.buyerAcceptances[0];
      if (
        !order ||
        order.status !== 'COMPLETED' ||
        !acceptance ||
        acceptance.decision === 'REJECTED' ||
        acceptance.acceptedQuantity.lte(0)
      ) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SALE_PROCEEDS_NOT_ELIGIBLE,
          'A completed order with accepted quantity is required',
        );
      }
      if (
        input.currency !== order.currency ||
        BigInt(input.expectedAmountMinor) !== order.totalAmountMinor
      ) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SALE_PROCEEDS_NOT_ELIGIBLE,
          'Proceeds currency and expected amount must match the order',
        );
      }
      const record = await transaction.saleProceedsRecord.create({
        data: {
          publicId: `prc1_${randomUUID().replaceAll('-', '')}`,
          proceedsNumber: input.proceedsNumber,
          organizationId,
          orderId: order.id,
          contractId: order.contractId,
          buyerOrganizationId: order.buyerOrganizationId,
          status: 'RECORDED',
          currency: input.currency,
          expectedAmountMinor: BigInt(input.expectedAmountMinor),
          recordedAmountMinor: BigInt(input.recordedAmountMinor),
          source: input.source,
          ...(input.externalReference ? { externalReference: input.externalReference } : {}),
          ...(input.valueDate ? { valueDate: new Date(`${input.valueDate}T00:00:00.000Z`) } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          recordedByUserId: principal.subjectId,
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'SALE_PROCEEDS_RECORDED',
        'SaleProceedsRecord',
        record.id,
        {
          orderId: order.id,
          currency: record.currency,
          recordedAmountMinor: record.recordedAmountMinor.toString(),
        },
      );
      return this.serializeProceeds(record);
    });
  }

  async verifySaleProceeds(
    organizationId: string,
    recordId: string,
    input: VerifySaleProceedsInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SaleProceedsRecord" WHERE id = ${recordId}::uuid FOR UPDATE`;
      const record = await transaction.saleProceedsRecord.findFirst({
        where: { id: recordId, organizationId },
      });
      if (!record) throw new NotFoundException('Sale proceeds record not found');
      if (record.version !== input.version) this.versionConflict();
      if (record.recordedByUserId === principal.subjectId) this.selfApproval();
      if (record.status !== 'RECORDED') {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          'Only recorded proceeds can be verified',
        );
      }
      const verified = await transaction.saleProceedsRecord.update({
        where: { id: record.id },
        data: {
          status:
            record.recordedAmountMinor < record.expectedAmountMinor
              ? 'PARTIALLY_RECEIVED'
              : 'VERIFIED',
          verifiedByUserId: principal.subjectId,
          verifiedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'SALE_PROCEEDS_VERIFIED',
        'SaleProceedsRecord',
        record.id,
        {
          orderId: record.orderId,
          status: verified.status,
          recordedAmountMinor: record.recordedAmountMinor.toString(),
        },
      );
      return this.serializeProceeds(verified);
    });
  }

  async reverseSaleProceeds(
    organizationId: string,
    recordId: string,
    input: ReverseSaleProceedsInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SaleProceedsRecord" WHERE id = ${recordId}::uuid FOR UPDATE`;
      const record = await transaction.saleProceedsRecord.findFirst({
        where: { id: recordId, organizationId },
        include: { settlementRunOrders: { take: 1 } },
      });
      if (!record) throw new NotFoundException('Sale proceeds record not found');
      if (record.version !== input.version) this.versionConflict();
      if (!['RECORDED', 'VERIFIED', 'PARTIALLY_RECEIVED'].includes(record.status)) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          'Sale proceeds cannot be reversed from their current status',
        );
      }
      if (record.settlementRunOrders.length > 0) {
        this.conflict(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          'Proceeds included in a settlement run cannot be reversed',
        );
      }
      const reversed = await transaction.saleProceedsRecord.update({
        where: { id: record.id },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversalReason: input.reason,
          version: { increment: 1 },
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'SALE_PROCEEDS_REVERSED',
        'SaleProceedsRecord',
        record.id,
        {
          orderId: record.orderId,
          reason: input.reason,
        },
      );
      return this.serializeProceeds(reversed);
    });
  }

  async listSettlementRuns(organizationId: string) {
    const runs = await this.database.client.settlementRun.findMany({
      where: { organizationId },
      include: { _count: { select: { orders: true, farmerSettlements: true, exceptions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return this.serializeFinancial(runs);
  }

  async listDeductionPolicies(organizationId: string) {
    const policies = await this.database.client.deductionPolicy.findMany({
      where: { organizationId },
      orderBy: [{ code: 'asc' }, { policyVersion: 'desc' }],
    });
    return this.serializeFinancial(policies);
  }

  async createDeductionPolicy(
    organizationId: string,
    input: CreateDeductionPolicyInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${input.code}`}, 0)) IS NULL AS "locked"`;
      const latest = await transaction.deductionPolicy.findFirst({
        where: { organizationId, code: input.code },
        orderBy: { policyVersion: 'desc' },
        select: { policyVersion: true },
      });
      const policy = await transaction.deductionPolicy.create({
        data: {
          organizationId,
          code: input.code,
          name: input.name,
          description: input.description,
          type: input.type,
          basis: input.basis,
          value: input.value,
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.maximumAmountMinor
            ? { maximumAmountMinor: BigInt(input.maximumAmountMinor) }
            : {}),
          priority: input.priority,
          effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
          ...(input.effectiveTo
            ? { effectiveTo: new Date(`${input.effectiveTo}T00:00:00.000Z`) }
            : {}),
          policyVersion: (latest?.policyVersion ?? 0) + 1,
          requiresFarmerConsent: input.requiresFarmerConsent,
          createdByUserId: principal.subjectId,
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'DEDUCTION_POLICY_CREATED',
        'DeductionPolicy',
        policy.id,
        {
          code: policy.code,
          policyVersion: policy.policyVersion,
        },
      );
      return this.serializeFinancial(policy);
    });
  }

  async approveDeductionPolicy(
    organizationId: string,
    policyId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "DeductionPolicy" WHERE id = ${policyId}::uuid FOR UPDATE`;
      const policy = await transaction.deductionPolicy.findFirst({
        where: { id: policyId, organizationId },
      });
      if (!policy) throw new NotFoundException('Deduction policy not found');
      if (policy.createdByUserId === principal.subjectId) this.selfApproval();
      if (policy.status !== 'DRAFT') {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          'Only draft deduction policies can be approved',
        );
      }
      await transaction.deductionPolicy.updateMany({
        where: { organizationId, code: policy.code, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED' },
      });
      const approved = await transaction.deductionPolicy.update({
        where: { id: policy.id },
        data: {
          status: 'ACTIVE',
          approvedByUserId: principal.subjectId,
          approvedAt: new Date(),
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'DEDUCTION_POLICY_APPROVED',
        'DeductionPolicy',
        policy.id,
        {
          code: policy.code,
          policyVersion: policy.policyVersion,
        },
      );
      return this.serializeFinancial(approved);
    });
  }

  async getSettlementRun(organizationId: string, settlementRunId: string) {
    const run = await this.database.client.settlementRun.findFirst({
      where: { id: settlementRunId, organizationId },
      include: {
        orders: { include: { order: true, saleProceedsRecord: true } },
        farmerSettlements: {
          include: { farmer: true, deductions: true, statements: true, paymentInstructions: true },
          orderBy: { farmerSettlementNumber: 'asc' },
        },
        exceptions: { orderBy: { createdAt: 'asc' } },
        statusEvents: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Settlement run not found');
    return this.serializeFinancial(run);
  }

  async createSettlementRun(
    organizationId: string,
    input: CreateSettlementRunInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      const uniqueRecordIds = [...new Set(input.saleProceedsRecordIds)];
      if (uniqueRecordIds.length !== input.saleProceedsRecordIds.length) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SALE_PROCEEDS_NOT_VERIFIED,
          'Sale proceeds records must be unique',
        );
      }
      for (const recordId of uniqueRecordIds) {
        await transaction.$queryRaw`SELECT id FROM "SaleProceedsRecord" WHERE id = ${recordId}::uuid FOR UPDATE`;
      }
      const proceeds = await transaction.saleProceedsRecord.findMany({
        where: { id: { in: uniqueRecordIds }, organizationId },
        include: {
          settlementRunOrders: { select: { id: true }, take: 1 },
          order: {
            include: {
              buyerAcceptances: {
                where: { supersededByAcceptance: null },
                orderBy: { decidedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });
      if (
        proceeds.length !== uniqueRecordIds.length ||
        proceeds.some(
          (record) =>
            !['VERIFIED', 'PARTIALLY_RECEIVED'].includes(record.status) ||
            record.currency !== input.currency ||
            record.settlementRunOrders.length > 0 ||
            !record.order.buyerAcceptances[0],
        )
      ) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SALE_PROCEEDS_NOT_VERIFIED,
          'Each proceeds record must be verified, unused, and match the settlement currency',
        );
      }
      const sourceTotalMinor = proceeds.reduce(
        (total, record) => total + record.recordedAmountMinor,
        0n,
      );
      const run = await transaction.settlementRun.create({
        data: {
          publicId: `stl1_${randomUUID().replaceAll('-', '')}`,
          settlementNumber: input.settlementNumber,
          organizationId,
          currency: input.currency,
          calculationVersion: 'lineage-proportional-v1',
          roundingPolicyVersion: 'largest-remainder-v1',
          sourceTotalMinor,
        },
      });
      await transaction.settlementRunOrder.createMany({
        data: proceeds.map((record) => {
          const acceptance = record.order.buyerAcceptances[0];
          if (!acceptance) throw new Error('Validated buyer acceptance is missing');
          return {
            settlementRunId: run.id,
            orderId: record.orderId,
            buyerAcceptanceId: acceptance.id,
            saleProceedsRecordId: record.id,
            acceptedQuantity: acceptance.acceptedQuantity,
            quantityUnit: acceptance.unit,
            allocatableAmountMinor: record.recordedAmountMinor,
            currency: record.currency,
            sourceVersion: record.version,
            acceptanceSourceVersion: acceptance.version,
          };
        }),
      });
      await this.statusEvent(
        transaction,
        run.id,
        null,
        'DRAFT',
        organizationId,
        principal.subjectId,
      );
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'SETTLEMENT_RUN_CREATED',
        'SettlementRun',
        run.id,
        {
          settlementNumber: run.settlementNumber,
          sourceTotalMinor: sourceTotalMinor.toString(),
          orderCount: proceeds.length,
        },
      );
      return this.serializeFinancial(run);
    });
  }

  async calculateSettlementRun(
    organizationId: string,
    settlementRunId: string,
    input: SettlementVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SettlementRun" WHERE id = ${settlementRunId}::uuid FOR UPDATE`;
      const run = await transaction.settlementRun.findFirst({
        where: { id: settlementRunId, organizationId },
        include: {
          orders: {
            include: {
              order: { include: { lot: { include: { contributions: true } } } },
              saleProceedsRecord: true,
              buyerAcceptance: true,
            },
            orderBy: { orderId: 'asc' },
          },
        },
      });
      if (!run) throw new NotFoundException('Settlement run not found');
      if (run.version !== input.version) this.versionConflict();
      if (run.status !== 'DRAFT') {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          'Only draft settlements can be calculated',
        );
      }
      const batches = await transaction.produceBatch.findMany({
        where: { organizationId },
        include: {
          farmerContributions: {
            where: { reversedAt: null },
            include: { delivery: { select: { farmerId: true } } },
            orderBy: { deliveryId: 'asc' },
          },
          transformationOutputs: {
            include: { transformation: { include: { inputs: { orderBy: { batchId: 'asc' } } } } },
          },
        },
        orderBy: { id: 'asc' },
      });
      const lineage: BatchLineageInput[] = batches.map((batch) => {
        const output = batch.transformationOutputs[0];
        return {
          batchId: batch.id,
          quantityUnits: toQuantityUnits(batch.initialQuantity.toFixed(4)),
          ...(batch.farmerContributions.length > 0
            ? {
                deliveryContributions: batch.farmerContributions.map((contribution) => ({
                  deliveryId: contribution.deliveryId,
                  farmerId: contribution.delivery.farmerId,
                  quantityUnits: toQuantityUnits(contribution.quantity.toFixed(4)),
                })),
              }
            : {}),
          ...(output
            ? {
                transformationInputs: output.transformation.inputs.map((transformationInput) => ({
                  batchId: transformationInput.batchId,
                  quantityUnits: toQuantityUnits(transformationInput.quantity.toFixed(4)),
                })),
              }
            : {}),
        };
      });
      const lineageSnapshot = {
        calculationVersion: run.calculationVersion,
        batches: lineage.map((batch) => ({
          ...batch,
          quantityUnits: batch.quantityUnits.toString(),
          deliveryContributions: batch.deliveryContributions?.map((item) => ({
            ...item,
            quantityUnits: item.quantityUnits.toString(),
          })),
          transformationInputs: batch.transformationInputs?.map((item) => ({
            ...item,
            quantityUnits: item.quantityUnits.toString(),
          })),
        })),
      };
      const lineageSnapshotHash = createHash('sha256')
        .update(JSON.stringify(lineageSnapshot))
        .digest('hex');
      const farmerGross = new Map<string, bigint>();
      const farmerQuantity = new Map<string, bigint>();
      const allocationRows: Prisma.SettlementAllocationCreateManyInput[] = [];
      for (const runOrder of run.orders) {
        const result = allocateSaleProceeds({
          acceptedQuantityUnits: toQuantityUnits(runOrder.acceptedQuantity.toFixed(4)),
          proceedsMinor: runOrder.allocatableAmountMinor,
          batches: lineage,
          lotContributions: runOrder.order.lot.contributions.map((contribution) => ({
            batchId: contribution.batchId,
            quantityUnits: toQuantityUnits(contribution.quantity.toFixed(4)),
          })),
        });
        for (const farmer of result.farmers) {
          farmerGross.set(
            farmer.farmerId,
            (farmerGross.get(farmer.farmerId) ?? 0n) + farmer.allocatedGrossMinor,
          );
          farmerQuantity.set(
            farmer.farmerId,
            (farmerQuantity.get(farmer.farmerId) ?? 0n) + farmer.attributableQuantityUnits,
          );
          for (const delivery of farmer.deliveries) {
            allocationRows.push({
              settlementRunId: run.id,
              settlementRunOrderId: runOrder.id,
              farmerId: farmer.farmerId,
              deliveryId: delivery.deliveryId,
              lotId: runOrder.order.lotId,
              attributableQuantity: formatQuantity(delivery.attributableQuantityUnits),
              quantityUnit: runOrder.quantityUnit,
              allocationRatioNumerator: delivery.ratioNumerator,
              allocationRatioDenominator: delivery.ratioDenominator,
              exactAmountRepresentation: `${delivery.ratioNumerator}/${delivery.ratioDenominator}`,
              allocatedGrossAmountMinor: delivery.allocatedGrossMinor,
              roundingAdjustmentMinor: delivery.roundingAdjustmentMinor,
              calculationMetadata: { algorithm: run.calculationVersion },
            });
          }
        }
      }
      const grossAllocatedMinor = [...farmerGross.values()].reduce(
        (total, amount) => total + amount,
        0n,
      );
      if (grossAllocatedMinor !== run.sourceTotalMinor) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TOTAL_MISMATCH,
          'Allocated proceeds do not reconcile to the source total',
        );
      }
      await transaction.settlementAllocation.createMany({ data: allocationRows });
      const sortedFarmers = [...farmerGross.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      );
      const calculationDate = new Date();
      const policies = await transaction.deductionPolicy.findMany({
        where: {
          organizationId,
          status: 'ACTIVE',
          effectiveFrom: { lte: calculationDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: calculationDate } }],
          AND: [{ OR: [{ currency: null }, { currency: run.currency }] }],
        },
        orderBy: [{ priority: 'asc' }, { code: 'asc' }, { policyVersion: 'asc' }],
      });
      let deductionsTotalMinor = 0n;
      let blockingExceptionCount = 0;
      for (const [index, [farmerId, grossEntitlementMinor]] of sortedFarmers.entries()) {
        const quantityUnits = farmerQuantity.get(farmerId) ?? 0n;
        const settlement = await transaction.farmerSettlement.create({
          data: {
            publicId: `fst1_${randomUUID().replaceAll('-', '')}`,
            farmerSettlementNumber: `${run.settlementNumber}-${String(index + 1).padStart(4, '0')}`,
            settlementRunId: run.id,
            organizationId,
            farmerId,
            status: 'CALCULATED',
            currency: run.currency,
            grossEntitlementMinor,
            netEntitlementMinor: grossEntitlementMinor,
          },
        });
        let farmerDeductions = 0n;
        for (const policy of policies) {
          if (policy.requiresFarmerConsent) {
            await transaction.settlementException.create({
              data: {
                settlementRunId: run.id,
                farmerSettlementId: settlement.id,
                code: PHASE_SIX_ERROR_CODES.DEDUCTION_CONSENT_REQUIRED,
                severity: 'BLOCKING',
                waivable: true,
                message: `Farmer consent is required for deduction policy ${policy.code}`,
                details: {
                  deductionPolicyId: policy.id,
                  policyCode: policy.code,
                  policyVersion: policy.policyVersion,
                },
              },
            });
            blockingExceptionCount += 1;
            continue;
          }
          const remainingEntitlement = grossEntitlementMinor - farmerDeductions;
          const calculatedAmount = this.calculateDeduction(
            policy.type,
            policy.value.toFixed(8),
            grossEntitlementMinor,
            quantityUnits,
          );
          const cappedAmount = policy.maximumAmountMinor
            ? this.minimum(calculatedAmount, policy.maximumAmountMinor)
            : calculatedAmount;
          const amountMinor = this.minimum(cappedAmount, remainingEntitlement);
          if (amountMinor <= 0n) continue;
          await transaction.settlementDeduction.create({
            data: {
              farmerSettlementId: settlement.id,
              deductionPolicyId: policy.id,
              code: policy.code,
              description: policy.description,
              ...(policy.basis === 'GROSS_ENTITLEMENT'
                ? { basisAmountMinor: grossEntitlementMinor }
                : { basisQuantity: formatQuantity(quantityUnits) }),
              rate: policy.value,
              amountMinor,
              source: 'POLICY',
            },
          });
          farmerDeductions += amountMinor;
        }
        if (farmerDeductions > 0n) {
          await transaction.farmerSettlement.update({
            where: { id: settlement.id },
            data: {
              deductionsTotalMinor: farmerDeductions,
              netEntitlementMinor: grossEntitlementMinor - farmerDeductions,
            },
          });
          deductionsTotalMinor += farmerDeductions;
        }
      }
      const calculatedStatus = blockingExceptionCount > 0 ? 'EXCEPTIONS_PENDING' : 'CALCULATED';
      const calculated = await transaction.settlementRun.update({
        where: { id: run.id },
        data: {
          status: calculatedStatus,
          grossAllocatedMinor,
          deductionsTotalMinor,
          netSettlementTotalMinor: grossAllocatedMinor - deductionsTotalMinor,
          lineageSnapshotHash,
          calculationSnapshot: lineageSnapshot,
          calculatedAt: new Date(),
          calculatedByUserId: principal.subjectId,
          version: { increment: 1 },
        },
      });
      await this.statusEvent(
        transaction,
        run.id,
        'DRAFT',
        calculatedStatus,
        organizationId,
        principal.subjectId,
      );
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'SETTLEMENT_CALCULATED',
        'SettlementRun',
        run.id,
        {
          lineageSnapshotHash,
          grossAllocatedMinor: grossAllocatedMinor.toString(),
          deductionsTotalMinor: deductionsTotalMinor.toString(),
          netSettlementTotalMinor: (grossAllocatedMinor - deductionsTotalMinor).toString(),
          farmerCount: sortedFarmers.length,
          blockingExceptionCount,
        },
      );
      return this.serializeFinancial(calculated);
    });
  }

  async submitSettlementRun(
    organizationId: string,
    settlementRunId: string,
    input: SettlementVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionSettlement(
      organizationId,
      settlementRunId,
      input,
      principal,
      requestId,
      'CALCULATED',
      'PENDING_APPROVAL',
      'SETTLEMENT_SUBMITTED_FOR_APPROVAL',
      {
        submittedForApprovalAt: new Date(),
        submittedBy: { connect: { id: principal.subjectId } },
      },
    );
  }

  async approveSettlementRun(
    organizationId: string,
    settlementRunId: string,
    input: SettlementVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SettlementRun" WHERE id = ${settlementRunId}::uuid FOR UPDATE`;
      const run = await transaction.settlementRun.findFirst({
        where: { id: settlementRunId, organizationId },
        include: { exceptions: { where: { status: 'OPEN', severity: 'BLOCKING' }, take: 1 } },
      });
      if (!run) throw new NotFoundException('Settlement run not found');
      if (run.version !== input.version) this.versionConflict();
      if (run.status !== 'PENDING_APPROVAL') {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          'Only submitted settlements can be approved',
        );
      }
      if (run.submittedByUserId === principal.subjectId) this.selfApproval();
      if (run.exceptions.length > 0) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_HAS_BLOCKING_EXCEPTIONS,
          'Blocking settlement exceptions must be resolved',
        );
      }
      const approvedAt = new Date();
      const approved = await transaction.settlementRun.update({
        where: { id: run.id },
        data: {
          status: 'APPROVED',
          approvedAt,
          approvedByUserId: principal.subjectId,
          version: { increment: 1 },
        },
      });
      await transaction.farmerSettlement.updateMany({
        where: { settlementRunId: run.id, status: 'CALCULATED' },
        data: { status: 'APPROVED', approvedAt },
      });
      await this.statusEvent(
        transaction,
        run.id,
        'PENDING_APPROVAL',
        'APPROVED',
        organizationId,
        principal.subjectId,
      );
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'SETTLEMENT_APPROVED',
        'SettlementRun',
        run.id,
        {
          lineageSnapshotHash: run.lineageSnapshotHash,
          sourceTotalMinor: run.sourceTotalMinor.toString(),
          netSettlementTotalMinor: run.netSettlementTotalMinor.toString(),
        },
      );
      return this.serializeFinancial(approved);
    });
  }

  async listPaymentMethods(organizationId: string, farmerId: string) {
    await this.requireFarmerMembership(this.database.client, organizationId, farmerId);
    const methods = await this.database.client.farmerPaymentMethod.findMany({
      where: { organizationId, farmerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return methods.map((method) => this.maskPaymentMethod(method));
  }

  async issueStatement(
    organizationId: string,
    farmerSettlementId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "FarmerSettlement" WHERE id = ${farmerSettlementId}::uuid FOR UPDATE`;
      const settlement = await transaction.farmerSettlement.findFirst({
        where: { id: farmerSettlementId, organizationId, status: 'APPROVED' },
        include: {
          farmer: { select: { farmerNumber: true } },
          deductions: { orderBy: { createdAt: 'asc' } },
          statements: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1 },
        },
      });
      if (!settlement) throw new NotFoundException('Approved farmer settlement not found');
      const previous = settlement.statements[0];
      const version = settlement.statementVersion + 1;
      const statementPayload = {
        farmerSettlementId: settlement.id,
        farmerNumber: settlement.farmer.farmerNumber,
        currency: settlement.currency,
        grossEntitlementMinor: settlement.grossEntitlementMinor.toString(),
        deductionsTotalMinor: settlement.deductionsTotalMinor.toString(),
        adjustmentsTotalMinor: settlement.adjustmentsTotalMinor.toString(),
        netEntitlementMinor: settlement.netEntitlementMinor.toString(),
        deductions: settlement.deductions.map((deduction) => ({
          code: deduction.code,
          amountMinor: deduction.amountMinor.toString(),
        })),
        version,
      };
      const checksum = `sha256:${createHash('sha256')
        .update(JSON.stringify(statementPayload))
        .digest('hex')}`;
      const statement = await transaction.farmerStatement.create({
        data: {
          publicId: `stm1_${randomUUID().replaceAll('-', '')}`,
          statementNumber: `${settlement.farmerSettlementNumber}-S${version}`,
          farmerSettlementId: settlement.id,
          version,
          issuedAt: new Date(),
          issuedByUserId: principal.subjectId,
          checksum,
        },
      });
      if (previous) {
        await transaction.farmerStatement.update({
          where: { id: previous.id },
          data: { status: 'SUPERSEDED', supersededById: statement.id },
        });
      }
      await transaction.farmerSettlement.update({
        where: { id: settlement.id },
        data: { statementVersion: version },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'FARMER_STATEMENT_ISSUED',
        'FarmerStatement',
        statement.id,
        {
          farmerSettlementId: settlement.id,
          farmerId: settlement.farmerId,
          statementVersion: version,
          checksum,
        },
      );
      return statement;
    });
  }

  async listPaymentInstructions(organizationId: string) {
    const instructions = await this.database.client.paymentInstruction.findMany({
      where: { organizationId },
      include: {
        farmer: { select: { farmerNumber: true, firstName: true, lastName: true } },
        paymentMethod: {
          select: {
            type: true,
            provider: true,
            accountHolderName: true,
            accountIdentifierLast4: true,
          },
        },
        attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.serializeFinancial(instructions);
  }

  async createPaymentInstruction(
    organizationId: string,
    input: CreatePaymentInstructionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      const settlement = await transaction.farmerSettlement.findFirst({
        where: { id: input.farmerSettlementId, organizationId, status: 'APPROVED' },
      });
      if (!settlement) throw new NotFoundException('Approved farmer settlement not found');
      if (settlement.paymentStatus !== 'NOT_INSTRUCTED') {
        this.conflict(
          PHASE_SIX_ERROR_CODES.PAYMENT_TRANSITION_INVALID,
          'A payment instruction already exists for this settlement',
        );
      }
      const paymentMethod = await transaction.farmerPaymentMethod.findFirst({
        where: {
          id: input.paymentMethodId,
          organizationId,
          farmerId: settlement.farmerId,
          status: 'VERIFIED',
        },
      });
      if (!paymentMethod) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.PAYMENT_METHOD_NOT_VERIFIED,
          'A verified payment method for this farmer is required',
        );
      }
      const instruction = await transaction.paymentInstruction.create({
        data: {
          publicId: `pay1_${randomUUID().replaceAll('-', '')}`,
          instructionNumber: input.instructionNumber,
          organizationId,
          farmerSettlementId: settlement.id,
          farmerId: settlement.farmerId,
          paymentMethodId: paymentMethod.id,
          currency: settlement.currency,
          amountMinor: settlement.netEntitlementMinor,
          provider: input.provider,
          idempotencyKey: input.idempotencyKey,
          ...(input.scheduledFor ? { scheduledFor: new Date(input.scheduledFor) } : {}),
          createdByUserId: principal.subjectId,
        },
      });
      await transaction.farmerSettlement.update({
        where: { id: settlement.id },
        data: { paymentStatus: 'INSTRUCTION_PENDING' },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'PAYMENT_INSTRUCTION_CREATED',
        'PaymentInstruction',
        instruction.id,
        {
          farmerSettlementId: settlement.id,
          farmerId: settlement.farmerId,
          amountMinor: settlement.netEntitlementMinor.toString(),
          currency: settlement.currency,
          provider: instruction.provider,
        },
      );
      return this.serializeFinancial(instruction);
    });
  }

  async requestPaymentInstructionApproval(
    organizationId: string,
    paymentInstructionId: string,
    input: PaymentInstructionVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionPaymentInstruction(
      organizationId,
      paymentInstructionId,
      input,
      principal,
      requestId,
      'DRAFT',
      'PENDING_APPROVAL',
      'PAYMENT_INSTRUCTION_APPROVAL_REQUESTED',
    );
  }

  async approvePaymentInstruction(
    organizationId: string,
    paymentInstructionId: string,
    input: PaymentInstructionVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "PaymentInstruction" WHERE id = ${paymentInstructionId}::uuid FOR UPDATE`;
      const instruction = await transaction.paymentInstruction.findFirst({
        where: { id: paymentInstructionId, organizationId },
      });
      if (!instruction) throw new NotFoundException('Payment instruction not found');
      if (instruction.version !== input.version) this.versionConflict();
      if (instruction.createdByUserId === principal.subjectId) this.selfApproval();
      if (instruction.status !== 'PENDING_APPROVAL') {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.PAYMENT_TRANSITION_INVALID,
          'Only pending payment instructions can be approved',
        );
      }
      const approved = await transaction.paymentInstruction.update({
        where: { id: instruction.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedByUserId: principal.subjectId,
          version: { increment: 1 },
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'PAYMENT_INSTRUCTION_APPROVED',
        'PaymentInstruction',
        instruction.id,
        {
          farmerSettlementId: instruction.farmerSettlementId,
          amountMinor: instruction.amountMinor.toString(),
          currency: instruction.currency,
          provider: instruction.provider,
        },
      );
      return this.serializeFinancial(approved);
    });
  }

  async submitPaymentInstruction(
    organizationId: string,
    paymentInstructionId: string,
    input: PaymentInstructionVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const queued = await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "PaymentInstruction" WHERE id = ${paymentInstructionId}::uuid FOR UPDATE`;
      const instruction = await transaction.paymentInstruction.findFirst({
        where: { id: paymentInstructionId, organizationId },
      });
      if (!instruction) throw new NotFoundException('Payment instruction not found');
      if (instruction.version !== input.version) this.versionConflict();
      if (!['APPROVED', 'QUEUED'].includes(instruction.status)) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.PAYMENT_TRANSITION_INVALID,
          'Only approved or queued payment instructions can be submitted',
        );
      }
      if (instruction.status === 'QUEUED') return instruction;
      const updated = await transaction.paymentInstruction.update({
        where: { id: instruction.id },
        data: { status: 'QUEUED', version: { increment: 1 } },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'PAYMENT_INSTRUCTION_QUEUED',
        'PaymentInstruction',
        instruction.id,
        { provider: instruction.provider, status: 'QUEUED' },
      );
      return updated;
    });
    await this.paymentSubmissionQueue.add(
      PAYMENT_SUBMIT_JOB,
      { paymentInstructionId: queued.id, expectedVersion: queued.version },
      { jobId: `payment-submit-${queued.id}` },
    );
    return this.serializeFinancial(queued);
  }

  async createPaymentMethod(
    organizationId: string,
    farmerId: string,
    input: CreateFarmerPaymentMethodInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await this.requireFarmerMembership(transaction, organizationId, farmerId);
      if (input.isDefault) {
        await transaction.farmerPaymentMethod.updateMany({
          where: { organizationId, farmerId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const identifier = 'accountIdentifier' in input ? input.accountIdentifier : null;
      const method = await transaction.farmerPaymentMethod.create({
        data: {
          organizationId,
          farmerId,
          type: input.type,
          provider: input.provider,
          accountHolderName: input.accountHolderName,
          accountIdentifierEncrypted: identifier ? this.encryption.encrypt(identifier) : null,
          accountIdentifierLast4: identifier ? this.encryption.lastFour(identifier) : null,
          isDefault: input.isDefault,
          createdByUserId: principal.subjectId,
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'FARMER_PAYMENT_METHOD_CREATED',
        'FarmerPaymentMethod',
        method.id,
        {
          farmerId,
          type: method.type,
          provider: method.provider,
          accountIdentifierLast4: method.accountIdentifierLast4,
        },
      );
      return this.maskPaymentMethod(method);
    });
  }

  async listReconciliations(organizationId: string) {
    const reconciliations = await this.database.client.paymentReconciliation.findMany({
      where: { organizationId },
      include: {
        paymentInstruction: {
          select: {
            instructionNumber: true,
            farmerId: true,
            amountMinor: true,
            currency: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return this.serializeFinancial(reconciliations);
  }

  async createReconciliation(
    organizationId: string,
    input: CreateManualReconciliationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "PaymentInstruction" WHERE id = ${input.paymentInstructionId}::uuid FOR UPDATE`;
      const instruction = await transaction.paymentInstruction.findFirst({
        where: { id: input.paymentInstructionId, organizationId },
        include: { attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
      });
      if (!instruction) throw new NotFoundException('Payment instruction not found');
      if (!['SUBMITTED', 'PROCESSING', 'REQUIRES_REVIEW'].includes(instruction.status)) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.RECONCILIATION_REVIEW_REQUIRED,
          'Only submitted payment instructions can be reconciled',
        );
      }
      if (Object.keys(input.evidenceMetadata).length === 0) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.RECONCILIATION_REVIEW_REQUIRED,
          'Reconciliation evidence metadata is required',
        );
      }
      const exactMatch =
        input.currency === instruction.currency &&
        BigInt(input.amountMinor) === instruction.amountMinor;
      const reconciliation = await transaction.paymentReconciliation.create({
        data: {
          organizationId,
          paymentInstructionId: instruction.id,
          ...(instruction.attempts[0] ? { paymentAttemptId: instruction.attempts[0].id } : {}),
          source: 'MANUAL',
          externalReference: input.externalReference,
          currency: input.currency,
          amountMinor: BigInt(input.amountMinor),
          valueDate: new Date(`${input.valueDate}T00:00:00.000Z`),
          status: exactMatch ? 'POSSIBLE_MATCH' : 'UNMATCHED',
          evidenceMetadata: input.evidenceMetadata as Prisma.InputJsonObject,
          matchedByUserId: principal.subjectId,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
      if (!exactMatch) {
        await transaction.paymentInstruction.update({
          where: { id: instruction.id },
          data: { status: 'REQUIRES_REVIEW', version: { increment: 1 } },
        });
      }
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'PAYMENT_RECONCILIATION_RECORDED',
        'PaymentReconciliation',
        reconciliation.id,
        {
          paymentInstructionId: instruction.id,
          externalReference: input.externalReference,
          status: reconciliation.status,
          amountMinor: input.amountMinor,
          currency: input.currency,
        },
      );
      return this.serializeFinancial(reconciliation);
    });
  }

  async reviewReconciliation(
    organizationId: string,
    reconciliationId: string,
    input: ReviewReconciliationInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "PaymentReconciliation" WHERE id = ${reconciliationId}::uuid FOR UPDATE`;
      const reconciliation = await transaction.paymentReconciliation.findFirst({
        where: { id: reconciliationId, organizationId },
        include: { paymentInstruction: true, paymentAttempt: true },
      });
      if (!reconciliation) throw new NotFoundException('Payment reconciliation not found');
      if (reconciliation.matchedByUserId === principal.subjectId) this.selfApproval();
      if (!['POSSIBLE_MATCH', 'UNMATCHED', 'MATCHED'].includes(reconciliation.status)) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.RECONCILIATION_REVIEW_REQUIRED,
          'This reconciliation has already been reviewed',
        );
      }
      if (
        input.status === 'CONFIRMED' &&
        (reconciliation.currency !== reconciliation.paymentInstruction.currency ||
          reconciliation.amountMinor !== reconciliation.paymentInstruction.amountMinor)
      ) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.RECONCILIATION_REVIEW_REQUIRED,
          'Currency and amount must match before payment can be confirmed',
        );
      }
      const reviewedAt = new Date();
      const reviewed = await transaction.paymentReconciliation.update({
        where: { id: reconciliation.id },
        data: {
          status: input.status,
          reviewedByUserId: principal.subjectId,
          reviewedAt,
          notes: input.notes,
        },
      });
      if (input.status === 'CONFIRMED') {
        await transaction.paymentInstruction.update({
          where: { id: reconciliation.paymentInstructionId },
          data: { status: 'COMPLETED', completedAt: reviewedAt, version: { increment: 1 } },
        });
        if (reconciliation.paymentAttempt) {
          await transaction.paymentAttempt.update({
            where: { id: reconciliation.paymentAttempt.id },
            data: { status: 'SUCCESSFUL', confirmedAt: reviewedAt },
          });
        }
        await transaction.farmerSettlement.update({
          where: { id: reconciliation.paymentInstruction.farmerSettlementId },
          data: { paymentStatus: 'PAID' },
        });
      } else {
        await transaction.paymentInstruction.update({
          where: { id: reconciliation.paymentInstructionId },
          data: { status: 'REQUIRES_REVIEW', version: { increment: 1 } },
        });
      }
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        input.status === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_RECONCILIATION_REJECTED',
        'PaymentReconciliation',
        reconciliation.id,
        {
          paymentInstructionId: reconciliation.paymentInstructionId,
          farmerSettlementId: reconciliation.paymentInstruction.farmerSettlementId,
          externalReference: reconciliation.externalReference,
          amountMinor: reconciliation.amountMinor.toString(),
          currency: reconciliation.currency,
        },
      );
      return this.serializeFinancial(reviewed);
    });
  }

  async verifyPaymentMethod(
    organizationId: string,
    paymentMethodId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "FarmerPaymentMethod" WHERE id = ${paymentMethodId}::uuid FOR UPDATE`;
      const method = await transaction.farmerPaymentMethod.findFirst({
        where: { id: paymentMethodId, organizationId },
      });
      if (!method) throw new NotFoundException('Farmer payment method not found');
      if (method.createdByUserId === principal.subjectId) this.selfApproval();
      if (method.status !== 'PENDING_VERIFICATION') {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          'Only pending payment methods can be verified',
        );
      }
      const verified = await transaction.farmerPaymentMethod.update({
        where: { id: method.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedByUserId: principal.subjectId,
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'FARMER_PAYMENT_METHOD_VERIFIED',
        'FarmerPaymentMethod',
        method.id,
        {
          farmerId: method.farmerId,
          type: method.type,
          accountIdentifierLast4: method.accountIdentifierLast4,
        },
      );
      return this.maskPaymentMethod(verified);
    });
  }

  private transitionSettlement(
    organizationId: string,
    settlementRunId: string,
    input: SettlementVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
    fromStatus: 'CALCULATED',
    toStatus: 'PENDING_APPROVAL',
    action: string,
    data: Prisma.SettlementRunUpdateInput,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SettlementRun" WHERE id = ${settlementRunId}::uuid FOR UPDATE`;
      const run = await transaction.settlementRun.findFirst({
        where: { id: settlementRunId, organizationId },
      });
      if (!run) throw new NotFoundException('Settlement run not found');
      if (run.version !== input.version) this.versionConflict();
      if (run.status !== fromStatus) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.SETTLEMENT_TRANSITION_INVALID,
          `Settlement must be ${fromStatus.toLowerCase()} for this action`,
        );
      }
      const updated = await transaction.settlementRun.update({
        where: { id: run.id },
        data: { ...data, status: toStatus, version: { increment: 1 } },
      });
      await this.statusEvent(
        transaction,
        run.id,
        fromStatus,
        toStatus,
        organizationId,
        principal.subjectId,
      );
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        action,
        'SettlementRun',
        run.id,
      );
      return this.serializeFinancial(updated);
    });
  }

  private transitionPaymentInstruction(
    organizationId: string,
    paymentInstructionId: string,
    input: PaymentInstructionVersionActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
    fromStatus: 'DRAFT',
    toStatus: 'PENDING_APPROVAL',
    action: string,
  ) {
    return this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "PaymentInstruction" WHERE id = ${paymentInstructionId}::uuid FOR UPDATE`;
      const instruction = await transaction.paymentInstruction.findFirst({
        where: { id: paymentInstructionId, organizationId },
      });
      if (!instruction) throw new NotFoundException('Payment instruction not found');
      if (instruction.version !== input.version) this.versionConflict();
      if (instruction.status !== fromStatus) {
        this.unprocessable(
          PHASE_SIX_ERROR_CODES.PAYMENT_TRANSITION_INVALID,
          `Payment instruction must be ${fromStatus.toLowerCase()} for this action`,
        );
      }
      const updated = await transaction.paymentInstruction.update({
        where: { id: instruction.id },
        data: { status: toStatus, version: { increment: 1 } },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        action,
        'PaymentInstruction',
        instruction.id,
      );
      return this.serializeFinancial(updated);
    });
  }

  private statusEvent(
    transaction: Prisma.TransactionClient,
    settlementRunId: string,
    fromStatus: Prisma.SettlementRunGetPayload<object>['status'] | null,
    toStatus: Prisma.SettlementRunGetPayload<object>['status'],
    organizationId: string,
    actorUserId: string,
  ) {
    return transaction.settlementRunStatusEvent.create({
      data: {
        settlementRunId,
        fromStatus,
        toStatus,
        actorUserId,
        actorOrganizationId: organizationId,
        metadata: {},
      },
    });
  }

  private serializeFinancial<T>(value: T): unknown {
    return JSON.parse(
      JSON.stringify(value, (_key, nestedValue: unknown) =>
        typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
      ),
    ) as unknown;
  }

  private calculateDeduction(
    type: 'FIXED_AMOUNT' | 'PERCENTAGE' | 'PER_QUANTITY_UNIT',
    value: string,
    grossEntitlementMinor: bigint,
    quantityUnits: bigint,
  ): bigint {
    const scaledValue = this.toScaledInteger(value, 8);
    if (type === 'FIXED_AMOUNT') return scaledValue / 100_000_000n;
    if (type === 'PERCENTAGE') {
      return (grossEntitlementMinor * scaledValue) / 10_000_000_000n;
    }
    return (quantityUnits * scaledValue) / 1_000_000_000_000n;
  }

  private toScaledInteger(value: string, decimalPlaces: number): bigint {
    const [whole = '0', fraction = ''] = value.split('.');
    return (
      BigInt(whole) * 10n ** BigInt(decimalPlaces) +
      BigInt(fraction.slice(0, decimalPlaces).padEnd(decimalPlaces, '0'))
    );
  }

  private minimum(left: bigint, right: bigint): bigint {
    return left < right ? left : right;
  }

  private requireFarmerMembership(
    transaction: Prisma.TransactionClient | DatabaseService['client'],
    organizationId: string,
    farmerId: string,
  ) {
    return transaction.farmerOrganizationMembership
      .findFirst({ where: { organizationId, farmerId, status: 'ACTIVE' }, select: { id: true } })
      .then((membership) => {
        if (!membership) throw new NotFoundException('Active farmer membership not found');
        return membership;
      });
  }

  private maskPaymentMethod<
    T extends {
      id: string;
      farmerId: string;
      type: string;
      provider: string;
      accountHolderName: string;
      accountIdentifierLast4: string | null;
      status: string;
      isDefault: boolean;
      verifiedAt: Date | null;
    },
  >(method: T) {
    return {
      id: method.id,
      farmerId: method.farmerId,
      type: method.type,
      provider: method.provider,
      accountHolderName: method.accountHolderName,
      accountIdentifierLast4: method.accountIdentifierLast4,
      status: method.status,
      isDefault: method.isDefault,
      verifiedAt: method.verifiedAt,
    };
  }

  private serializeProceeds<T extends { expectedAmountMinor: bigint; recordedAmountMinor: bigint }>(
    record: T,
  ) {
    return {
      ...record,
      expectedAmountMinor: record.expectedAmountMinor.toString(),
      recordedAmountMinor: record.recordedAmountMinor.toString(),
    };
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.database.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined;
        const message = error instanceof Error ? error.message : '';
        if (
          attempt === 3 ||
          (code !== 'P2034' &&
            !/could not serialize|serialization failure|deadlock detected/i.test(message))
        )
          throw error;
      }
    }
    throw new Error('Serializable transaction retry loop exhausted');
  }

  private async record(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    requestId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonObject = {},
  ) {
    await this.audit.create(
      { organizationId, actorUserId, action, entityType, entityId, requestId, metadata },
      transaction,
    );
    await this.events.create(
      {
        aggregateType: entityType,
        aggregateId: entityId,
        eventType: action,
        payload: { organizationId, ...metadata },
      },
      transaction,
    );
  }

  private versionConflict(): never {
    this.conflict(PHASE_SIX_ERROR_CODES.VERSION_CONFLICT, 'Resource version changed');
  }

  private selfApproval(): never {
    this.conflict(PHASE_SIX_ERROR_CODES.SELF_APPROVAL_FORBIDDEN, 'A separate user must approve');
  }

  private conflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }

  private unprocessable(code: string, message: string): never {
    throw new UnprocessableEntityException({ code, message });
  }
}
