import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import {
  PHASE_FIVE_ERROR_CODES,
  type AttachCustodyTransferInput,
  type CreateBuyerInspectionInput,
  type CreateContractAmendmentInput,
  type CreateOrderInput,
  type CreateTraceabilityShareInput,
  type ReasonActionInput,
  type ReasonInput,
  type RecordBuyerAcceptanceInput,
  type VersionedActionInput,
} from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { formatQuantity, toQuantityUnits } from '../batches/quantity.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class CommerceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async listContracts(organizationId: string) {
    const contracts = await this.database.client.salesContract.findMany({
      where: {
        OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
      },
      include: {
        sellerOrganization: true,
        buyerOrganization: true,
        lot: true,
        reservation: true,
        amendments: true,
        order: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return contracts.map((contract) => ({
      ...this.serializeMoney(contract),
      order: contract.order ? this.serializeMoney(contract.order) : null,
    }));
  }

  async approveContract(
    organizationId: string,
    contractId: string,
    input: VersionedActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesContract" WHERE id = ${contractId}::uuid FOR UPDATE`;
      const contract = await transaction.salesContract.findUnique({ where: { id: contractId } });
      if (
        !contract ||
        ![contract.sellerOrganizationId, contract.buyerOrganizationId].includes(organizationId)
      )
        throw new NotFoundException('Sales contract not found');
      if (contract.version !== input.version) this.versionConflict();
      if (
        organizationId === contract.sellerOrganizationId &&
        contract.status === 'PENDING_SELLER_APPROVAL'
      ) {
        await transaction.salesContract.update({
          where: { id: contractId },
          data: {
            status: 'PENDING_BUYER_APPROVAL',
            sellerApprovedByUserId: principal.subjectId,
            sellerApprovedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.record(
          transaction,
          organizationId,
          principal.subjectId,
          requestId,
          'SALES_CONTRACT_SELLER_APPROVED',
          'SalesContract',
          contractId,
          { buyerOrganizationId: contract.buyerOrganizationId },
        );
        return;
      }
      if (
        organizationId === contract.buyerOrganizationId &&
        contract.status === 'PENDING_BUYER_APPROVAL' &&
        contract.sellerApprovedAt
      ) {
        const activatedAt = new Date();
        await transaction.salesContract.update({
          where: { id: contractId },
          data: {
            status: 'ACTIVE',
            buyerApprovedByUserId: principal.subjectId,
            buyerApprovedAt: activatedAt,
            activatedAt,
            version: { increment: 1 },
          },
        });
        await transaction.lotReservation.update({
          where: { id: contract.reservationId },
          data: { status: 'CONTRACTED', version: { increment: 1 } },
        });
        await this.record(
          transaction,
          organizationId,
          principal.subjectId,
          requestId,
          'SALES_CONTRACT_ACTIVATED',
          'SalesContract',
          contractId,
          {
            sellerOrganizationId: contract.sellerOrganizationId,
            reservationId: contract.reservationId,
          },
        );
        return;
      }
      this.conflict(
        PHASE_FIVE_ERROR_CODES.CONTRACT_APPROVAL_ORDER_INVALID,
        'Contract is not awaiting approval from this organization',
      );
    });
    return this.getContract(organizationId, contractId);
  }

  async releaseReservation(
    organizationId: string,
    reservationId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionReservation(
      organizationId,
      reservationId,
      input,
      principal,
      requestId,
      'RELEASED',
      true,
      ['ACTIVE'],
    );
  }

  async cancelReservation(
    organizationId: string,
    reservationId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionReservation(
      organizationId,
      reservationId,
      input,
      principal,
      requestId,
      'CANCELLED',
      false,
      ['ACTIVE', 'CONTRACTED'],
    );
  }

  async cancelContract(
    organizationId: string,
    contractId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesContract" WHERE id = ${contractId}::uuid FOR UPDATE`;
      const contract = await transaction.salesContract.findFirst({
        where: {
          id: contractId,
          OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
        },
        include: { reservation: true, order: true },
      });
      if (!contract) throw new NotFoundException('Sales contract not found');
      if (contract.version !== input.version) this.versionConflict();
      if (
        contract.order ||
        !['DRAFT', 'PENDING_SELLER_APPROVAL', 'PENDING_BUYER_APPROVAL', 'ACTIVE'].includes(
          contract.status,
        )
      )
        throw new UnprocessableEntityException('Contract can no longer be cancelled directly');
      await transaction.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${contract.listingId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT id FROM "CooperativeLot" WHERE id = ${contract.lotId}::uuid FOR UPDATE`;
      await transaction.salesContract.update({
        where: { id: contract.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: input.reason,
          version: { increment: 1 },
        },
      });
      await this.restoreAllocation(transaction, contract.reservation, 'CANCELLED', input.reason);
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'SALES_CONTRACT_CANCELLED',
        'SalesContract',
        contract.id,
        { reason: input.reason, reservationId: contract.reservationId },
      );
    });
    return this.getContract(organizationId, contractId);
  }

  async proposeAmendment(
    organizationId: string,
    contractId: string,
    input: CreateContractAmendmentInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const id = randomUUID();
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesContract" WHERE id = ${contractId}::uuid FOR UPDATE`;
      const contract = await transaction.salesContract.findUnique({ where: { id: contractId } });
      if (
        !contract ||
        ![contract.sellerOrganizationId, contract.buyerOrganizationId].includes(organizationId)
      )
        throw new NotFoundException('Sales contract not found');
      if (contract.status !== 'ACTIVE')
        throw new UnprocessableEntityException('Only active contracts can be amended');
      const latest = await transaction.contractAmendment.aggregate({
        where: { contractId },
        _max: { amendmentNumber: true },
      });
      await transaction.contractAmendment.create({
        data: {
          id,
          contractId,
          amendmentNumber: (latest._max.amendmentNumber ?? 0) + 1,
          status: 'PENDING_COUNTERPARTY',
          reason: input.reason,
          proposedChanges: this.allowedContractChanges(input.proposedChanges),
          requestedByOrganizationId: organizationId,
          requestedByUserId: principal.subjectId,
          ...(organizationId === contract.sellerOrganizationId
            ? { sellerApprovedByUserId: principal.subjectId }
            : { buyerApprovedByUserId: principal.subjectId }),
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'CONTRACT_AMENDMENT_PROPOSED',
        'ContractAmendment',
        id,
        { contractId },
      );
    });
    return this.database.client.contractAmendment.findUniqueOrThrow({ where: { id } });
  }

  async approveAmendment(
    organizationId: string,
    amendmentId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "ContractAmendment" WHERE id = ${amendmentId}::uuid FOR UPDATE`;
      const amendment = await transaction.contractAmendment.findUnique({
        where: { id: amendmentId },
        include: { contract: true },
      });
      if (
        !amendment ||
        ![amendment.contract.sellerOrganizationId, amendment.contract.buyerOrganizationId].includes(
          organizationId,
        )
      )
        throw new NotFoundException('Contract amendment not found');
      if (
        amendment.status !== 'PENDING_COUNTERPARTY' ||
        amendment.requestedByOrganizationId === organizationId
      )
        throw new UnprocessableEntityException('Amendment is not awaiting this organization');
      const changes = this.allowedContractChanges(amendment.proposedChanges);
      await transaction.salesContract.update({
        where: { id: amendment.contractId },
        data: { ...changes, version: { increment: 1 } },
      });
      const approved = await transaction.contractAmendment.update({
        where: { id: amendmentId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          ...(organizationId === amendment.contract.sellerOrganizationId
            ? { sellerApprovedByUserId: principal.subjectId }
            : { buyerApprovedByUserId: principal.subjectId }),
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'CONTRACT_AMENDMENT_APPROVED',
        'ContractAmendment',
        amendmentId,
        { contractId: amendment.contractId },
      );
      return approved;
    });
  }

  async rejectAmendment(
    organizationId: string,
    amendmentId: string,
    input: ReasonInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionAmendment(
      organizationId,
      amendmentId,
      input,
      principal,
      requestId,
      'REJECTED',
      false,
    );
  }

  async withdrawAmendment(
    organizationId: string,
    amendmentId: string,
    input: ReasonInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionAmendment(
      organizationId,
      amendmentId,
      input,
      principal,
      requestId,
      'WITHDRAWN',
      true,
    );
  }

  async createOrder(
    sellerOrganizationId: string,
    contractId: string,
    input: CreateOrderInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const id = randomUUID();
    await this.database.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "SalesContract" WHERE id = ${contractId}::uuid FOR UPDATE`;
        const contract = await transaction.salesContract.findFirst({
          where: { id: contractId, sellerOrganizationId },
          include: { order: true, reservation: true },
        });
        if (!contract) throw new NotFoundException('Active seller contract not found');
        if (contract.status !== 'ACTIVE' || contract.order)
          throw new UnprocessableEntityException('Contract is not eligible for a new order');
        await transaction.salesOrder.create({
          data: {
            id,
            publicId: `ord1_${randomUUID().replaceAll('-', '')}`,
            orderNumber: `ORD-${Date.now()}-${id.slice(0, 6)}`,
            contractId,
            reservationId: contract.reservationId,
            sellerOrganizationId,
            buyerOrganizationId: contract.buyerOrganizationId,
            lotId: contract.lotId,
            quantity: contract.quantity,
            unitPriceMinor: contract.unitPriceMinor,
            currency: contract.currency,
            totalAmountMinor: contract.totalAmountMinor,
            fulfillmentMethod: input.fulfillmentMethod,
            ...(input.expectedDispatchAt
              ? { expectedDispatchAt: new Date(input.expectedDispatchAt) }
              : {}),
          },
        });
        await transaction.lotReservation.update({
          where: { id: contract.reservationId },
          data: { status: 'CONSUMED', consumedAt: new Date(), version: { increment: 1 } },
        });
        await this.statusEvent(
          transaction,
          id,
          null,
          'PENDING_FULFILLMENT',
          sellerOrganizationId,
          principal.subjectId,
          'ORDER_CREATED',
        );
        await this.record(
          transaction,
          sellerOrganizationId,
          principal.subjectId,
          requestId,
          'SALES_ORDER_CREATED',
          'SalesOrder',
          id,
          { contractId, buyerOrganizationId: contract.buyerOrganizationId },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.getOrder(sellerOrganizationId, id);
  }

  async cancelOrder(
    sellerOrganizationId: string,
    orderId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await transaction.salesOrder.findFirst({
        where: { id: orderId, sellerOrganizationId },
        include: { reservation: true },
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (order.version !== input.version) this.versionConflict();
      if (!['PENDING_FULFILLMENT', 'READY_FOR_DISPATCH'].includes(order.status))
        this.conflict(
          PHASE_FIVE_ERROR_CODES.ORDER_TRANSITION_INVALID,
          'Only pre-dispatch orders can be cancelled',
        );
      await transaction.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = (SELECT "listingId" FROM "LotReservation" WHERE id = ${order.reservationId}::uuid) FOR UPDATE`;
      await transaction.$queryRaw`SELECT id FROM "CooperativeLot" WHERE id = ${order.lotId}::uuid FOR UPDATE`;
      await transaction.salesOrder.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: input.reason,
          version: { increment: 1 },
        },
      });
      await transaction.salesContract.update({
        where: { id: order.contractId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: input.reason,
          version: { increment: 1 },
        },
      });
      await this.restoreAllocation(transaction, order.reservation, 'CANCELLED', input.reason);
      await this.statusEvent(
        transaction,
        order.id,
        order.status,
        'CANCELLED',
        sellerOrganizationId,
        principal.subjectId,
        'SELLER_CANCELLED',
      );
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'SALES_ORDER_CANCELLED',
        'SalesOrder',
        order.id,
        { reason: input.reason, contractId: order.contractId },
      );
    });
    return this.getOrder(sellerOrganizationId, orderId);
  }

  async attachCustodyTransfer(
    sellerOrganizationId: string,
    orderId: string,
    input: AttachCustodyTransferInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await transaction.salesOrder.findFirst({
        where: { id: orderId, sellerOrganizationId },
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (order.version !== input.version || order.status !== 'PENDING_FULFILLMENT')
        this.versionConflict();
      const transfer = await transaction.custodyTransfer.findFirst({
        where: {
          id: input.custodyTransferId,
          lotId: order.lotId,
          fromOrganizationId: order.sellerOrganizationId,
          toOrganizationId: order.buyerOrganizationId,
          status: 'DRAFT',
        },
      });
      if (
        !transfer ||
        toQuantityUnits(transfer.quantity.toFixed(4)) !== toQuantityUnits(order.quantity.toFixed(4))
      )
        throw new UnprocessableEntityException('Matching draft custody transfer not found');
      await transaction.salesOrder.update({
        where: { id: orderId },
        data: {
          custodyTransferId: transfer.id,
          status: 'READY_FOR_DISPATCH',
          version: { increment: 1 },
        },
      });
      await this.statusEvent(
        transaction,
        orderId,
        order.status,
        'READY_FOR_DISPATCH',
        sellerOrganizationId,
        principal.subjectId,
        'CUSTODY_ATTACHED',
      );
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'ORDER_READY_FOR_DISPATCH',
        'SalesOrder',
        orderId,
        { custodyTransferId: transfer.id },
      );
    });
    return this.getOrder(sellerOrganizationId, orderId);
  }

  async syncCustody(
    organizationId: string,
    orderId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await transaction.salesOrder.findFirst({
        where: {
          id: orderId,
          OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
        },
        include: { custodyTransfer: true },
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (!order.custodyTransfer)
        throw new UnprocessableEntityException('Order has no custody transfer');
      const next =
        order.custodyTransfer.status === 'RECEIVED'
          ? 'PENDING_BUYER_INSPECTION'
          : order.custodyTransfer.status === 'DISPATCHED'
            ? 'IN_TRANSIT'
            : null;
      if (!next)
        throw new UnprocessableEntityException(
          'Custody transfer has not been dispatched or received',
        );
      if (order.status === next) return;
      const timestamps =
        next === 'IN_TRANSIT'
          ? { dispatchedAt: order.custodyTransfer.dispatchedAt }
          : { receivedAt: order.custodyTransfer.receivedAt };
      await transaction.salesOrder.update({
        where: { id: orderId },
        data: { status: next, ...timestamps, version: { increment: 1 } },
      });
      await this.statusEvent(
        transaction,
        orderId,
        order.status,
        next,
        organizationId,
        principal.subjectId,
        'CUSTODY_SYNCHRONIZED',
      );
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        next === 'IN_TRANSIT' ? 'ORDER_DISPATCHED' : 'ORDER_RECEIVED',
        'SalesOrder',
        orderId,
        { custodyTransferId: order.custodyTransfer.id },
      );
    });
    return this.getOrder(organizationId, orderId);
  }

  async inspect(
    buyerOrganizationId: string,
    orderId: string,
    input: CreateBuyerInspectionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const id = randomUUID();
    await this.database.client.$transaction(async (transaction) => {
      const order = await transaction.salesOrder.findFirst({
        where: { id: orderId, buyerOrganizationId },
        include: { custodyTransfer: true },
      });
      if (!order) throw new NotFoundException('Buyer sales order not found');
      if (
        order.custodyTransfer?.status !== 'RECEIVED' ||
        !['PENDING_BUYER_INSPECTION', 'RECEIVED'].includes(order.status)
      )
        this.conflict(
          PHASE_FIVE_ERROR_CODES.CUSTODY_NOT_RECEIVED,
          'Custody must be received before buyer inspection',
        );
      if (input.status === 'DRAFT')
        throw new UnprocessableEntityException('Submitted inspections must be completed');
      if (input.supersedesInspectionId) {
        const previous = await transaction.buyerInspection.findFirst({
          where: { id: input.supersedesInspectionId, orderId, buyerOrganizationId },
        });
        if (!previous) throw new UnprocessableEntityException('Superseded inspection not found');
        await transaction.buyerInspection.update({
          where: { id: previous.id },
          data: { status: 'SUPERSEDED' },
        });
      }
      await transaction.buyerInspection.create({
        data: {
          id,
          inspectionNumber: input.inspectionNumber,
          orderId,
          lotId: order.lotId,
          buyerOrganizationId,
          status: input.status,
          inspectedByUserId: principal.subjectId,
          sampledAt: new Date(input.sampledAt),
          completedAt: new Date(),
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.supersedesInspectionId
            ? { supersedesInspectionId: input.supersedesInspectionId }
            : {}),
          measurements: {
            create: input.measurements.map((measurement) => ({
              qualityAttributeDefinitionId: measurement.qualityAttributeDefinitionId,
              ...(measurement.decimalValue !== undefined
                ? { decimalValue: measurement.decimalValue }
                : {}),
              ...(measurement.integerValue !== undefined
                ? { integerValue: measurement.integerValue }
                : {}),
              ...(measurement.textValue !== undefined ? { textValue: measurement.textValue } : {}),
              ...(measurement.booleanValue !== undefined
                ? { booleanValue: measurement.booleanValue }
                : {}),
              ...(measurement.enumValue !== undefined ? { enumValue: measurement.enumValue } : {}),
            })),
          },
        },
      });
      await this.record(
        transaction,
        buyerOrganizationId,
        principal.subjectId,
        requestId,
        'BUYER_INSPECTION_COMPLETED',
        'BuyerInspection',
        id,
        { orderId, status: input.status },
      );
    });
    return this.database.client.buyerInspection.findUniqueOrThrow({
      where: { id },
      include: { measurements: { include: { qualityAttributeDefinition: true } } },
    });
  }

  async accept(
    buyerOrganizationId: string,
    orderId: string,
    input: RecordBuyerAcceptanceInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const id = randomUUID();
    await this.database.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await transaction.salesOrder.findFirst({
          where: { id: orderId, buyerOrganizationId },
          include: { custodyTransfer: true },
        });
        if (!order) throw new NotFoundException('Buyer sales order not found');
        if (order.custodyTransfer?.status !== 'RECEIVED')
          this.conflict(
            PHASE_FIVE_ERROR_CODES.CUSTODY_NOT_RECEIVED,
            'Custody must be received before acceptance',
          );
        const accepted = toQuantityUnits(input.acceptedQuantity);
        const rejected = toQuantityUnits(input.rejectedQuantity);
        const ordered = toQuantityUnits(order.quantity.toFixed(4));
        if (accepted + rejected !== ordered)
          this.conflict(
            PHASE_FIVE_ERROR_CODES.ACCEPTANCE_QUANTITY_MISMATCH,
            'Accepted and rejected quantities must equal the order quantity',
          );
        if (input.decision === 'ACCEPTED' && (accepted !== ordered || rejected !== 0n))
          throw new UnprocessableEntityException(
            'Full acceptance requires the full order quantity',
          );
        if (input.decision === 'REJECTED' && (accepted !== 0n || rejected !== ordered))
          throw new UnprocessableEntityException('Rejection requires the full order quantity');
        if (input.decision === 'PARTIALLY_ACCEPTED' && (accepted === 0n || rejected === 0n))
          throw new UnprocessableEntityException(
            'Partial acceptance requires accepted and rejected quantities',
          );
        if (input.decision !== 'ACCEPTED' && !input.reason)
          throw new UnprocessableEntityException(
            'Partial acceptance and rejection require a reason',
          );
        if (input.buyerInspectionId) {
          const inspection = await transaction.buyerInspection.findFirst({
            where: {
              id: input.buyerInspectionId,
              orderId,
              buyerOrganizationId,
              status: { not: 'SUPERSEDED' },
            },
          });
          if (!inspection)
            throw new UnprocessableEntityException('Active buyer inspection not found');
        }
        if (input.supersedesAcceptanceId) {
          const previous = await transaction.buyerAcceptance.findFirst({
            where: { id: input.supersedesAcceptanceId, orderId },
          });
          if (!previous) throw new UnprocessableEntityException('Superseded acceptance not found');
        }
        await transaction.buyerAcceptance.create({
          data: {
            id,
            orderId,
            acceptedQuantity: input.acceptedQuantity,
            rejectedQuantity: input.rejectedQuantity,
            decision: input.decision,
            decidedByUserId: principal.subjectId,
            decidedAt: new Date(),
            ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
            ...(input.reason ? { reason: input.reason } : {}),
            ...(input.buyerInspectionId ? { buyerInspectionId: input.buyerInspectionId } : {}),
            ...(input.supersedesAcceptanceId
              ? { supersedesAcceptanceId: input.supersedesAcceptanceId }
              : {}),
          },
        });
        const status =
          input.decision === 'ACCEPTED'
            ? 'ACCEPTED'
            : input.decision === 'REJECTED'
              ? 'REJECTED'
              : 'DISPUTED';
        await transaction.salesOrder.update({
          where: { id: orderId },
          data: { status, version: { increment: 1 } },
        });
        await this.statusEvent(
          transaction,
          orderId,
          order.status,
          status,
          buyerOrganizationId,
          principal.subjectId,
          input.reasonCode ?? input.decision,
        );
        await this.record(
          transaction,
          buyerOrganizationId,
          principal.subjectId,
          requestId,
          input.decision === 'ACCEPTED' ? 'BUYER_ACCEPTANCE_RECORDED' : 'BUYER_EXCEPTION_RECORDED',
          'BuyerAcceptance',
          id,
          { orderId, decision: input.decision, sellerOrganizationId: order.sellerOrganizationId },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.database.client.buyerAcceptance.findUniqueOrThrow({ where: { id } });
  }

  async complete(
    sellerOrganizationId: string,
    orderId: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "SalesOrder" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await transaction.salesOrder.findFirst({
        where: { id: orderId, sellerOrganizationId },
      });
      if (!order) throw new NotFoundException('Sales order not found');
      if (order.status !== 'ACCEPTED')
        this.conflict(
          PHASE_FIVE_ERROR_CODES.ORDER_TRANSITION_INVALID,
          'Only accepted orders can be completed',
        );
      await transaction.salesOrder.update({
        where: { id: orderId },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
      });
      await transaction.salesContract.update({
        where: { id: order.contractId },
        data: { status: 'FULFILLED', version: { increment: 1 } },
      });
      await transaction.cooperativeLot.update({
        where: { id: order.lotId },
        data: { status: 'CLOSED', saleHoldAt: null, saleHoldReason: null },
      });
      await this.statusEvent(
        transaction,
        orderId,
        order.status,
        'COMPLETED',
        sellerOrganizationId,
        principal.subjectId,
        'BUYER_ACCEPTED',
      );
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'SALES_ORDER_COMPLETED',
        'SalesOrder',
        orderId,
        { contractId: order.contractId, buyerOrganizationId: order.buyerOrganizationId },
      );
    });
    return this.getOrder(sellerOrganizationId, orderId);
  }

  async createShare(
    sellerOrganizationId: string,
    input: CreateTraceabilityShareInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    await this.database.client.$transaction(async (transaction) => {
      const lot = await transaction.cooperativeLot.findFirst({
        where: { id: input.lotId, organizationId: sellerOrganizationId },
      });
      if (!lot) throw new NotFoundException('Seller lot not found');
      if (new Date(input.expiresAt) <= new Date())
        throw new UnprocessableEntityException('Share expiry must be in the future');
      if (input.listingId) {
        const listing = await transaction.marketplaceListing.findFirst({
          where: { id: input.listingId, lotId: input.lotId, sellerOrganizationId },
        });
        if (!listing)
          throw new UnprocessableEntityException('Share listing does not match the seller lot');
      }
      if (input.contractId) {
        const contract = await transaction.salesContract.findFirst({
          where: {
            id: input.contractId,
            lotId: input.lotId,
            sellerOrganizationId,
            buyerOrganizationId: input.buyerOrganizationId,
          },
        });
        if (!contract)
          throw new UnprocessableEntityException(
            'Share contract does not match both parties and lot',
          );
      }
      await transaction.traceabilityShare.create({
        data: {
          id,
          publicId: `shr1_${randomUUID().replaceAll('-', '')}`,
          sellerOrganizationId,
          buyerOrganizationId: input.buyerOrganizationId,
          lotId: input.lotId,
          scopes: input.scopes,
          accessTokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(input.expiresAt),
          createdByUserId: principal.subjectId,
          ...(input.listingId ? { listingId: input.listingId } : {}),
          ...(input.contractId ? { contractId: input.contractId } : {}),
        },
      });
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'TRACEABILITY_SHARE_CREATED',
        'TraceabilityShare',
        id,
        {
          buyerOrganizationId: input.buyerOrganizationId,
          lotId: input.lotId,
          scopes: input.scopes,
        },
      );
    });
    const share = await this.database.client.traceabilityShare.findUniqueOrThrow({ where: { id } });
    return { ...share, accessToken: token, accessTokenHash: undefined };
  }

  async revokeShare(
    sellerOrganizationId: string,
    shareId: string,
    input: ReasonInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shareId);
    const share = await this.database.client.$transaction(async (transaction) => {
      const existing = await transaction.traceabilityShare.findFirst({
        where: { ...(isUuid ? { id: shareId } : { publicId: shareId }), sellerOrganizationId },
      });
      if (!existing) throw new NotFoundException('Traceability share not found');
      if (existing.status !== 'ACTIVE')
        throw new UnprocessableEntityException('Only active shares can be revoked');
      const revoked = await transaction.traceabilityShare.update({
        where: { id: existing.id },
        data: { status: 'REVOKED', revokedAt: new Date(), accessTokenHash: null },
      });
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'TRACEABILITY_SHARE_REVOKED',
        'TraceabilityShare',
        existing.id,
        { reason: input.reason, buyerOrganizationId: existing.buyerOrganizationId },
      );
      return revoked;
    });
    return { ...share, accessTokenHash: undefined };
  }

  async sharedTrace(buyerOrganizationId: string, shareId: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shareId);
    const share = await this.database.client.traceabilityShare.findFirst({
      where: {
        ...(isUuid ? { id: shareId } : { publicId: shareId }),
        buyerOrganizationId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      include: {
        lot: {
          include: {
            commodity: true,
            commodityForm: true,
            inspections: {
              include: { measurements: { include: { qualityAttributeDefinition: true } } },
              orderBy: { inspectedAt: 'desc' },
              take: 1,
            },
            custodyTransfers: { orderBy: { createdAt: 'asc' } },
            contributions: {
              include: {
                batch: {
                  include: {
                    farmerContributions: {
                      include: {
                        delivery: {
                          select: { publicId: true, deliveryNumber: true, acceptedAt: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!share)
      this.conflict(
        PHASE_FIVE_ERROR_CODES.TRACEABILITY_SHARE_DENIED,
        'Active traceability share not found',
      );
    const scopes = new Set(share.scopes);
    return {
      share: { publicId: share.publicId, scopes: share.scopes, expiresAt: share.expiresAt },
      lot: scopes.has('LOT_SUMMARY')
        ? {
            publicId: share.lot.publicId,
            lotNumber: share.lot.lotNumber,
            commodity: share.lot.commodity.name,
            form: share.lot.commodityForm.name,
            quantity: share.lot.quantity.toFixed(4),
            unit: share.lot.quantityUnit,
            status: share.lot.status,
          }
        : null,
      quality: scopes.has('QUALITY_DETAILS')
        ? share.lot.inspections.map((inspection) => ({
            status: inspection.status,
            inspectedAt: inspection.inspectedAt,
            measurements: inspection.measurements.map((measurement) => ({
              code: measurement.qualityAttributeDefinition.code,
              unit: measurement.qualityAttributeDefinition.unit,
              value:
                measurement.decimalValue?.toString() ??
                measurement.integerValue ??
                measurement.textValue ??
                measurement.booleanValue ??
                measurement.enumValue,
            })),
          }))
        : null,
      custody: scopes.has('CUSTODY_DETAILS')
        ? share.lot.custodyTransfers.map((transfer) => ({
            transferNumber: transfer.transferNumber,
            status: transfer.status,
            quantity: transfer.quantity.toFixed(4),
            dispatchedAt: transfer.dispatchedAt,
            receivedAt: transfer.receivedAt,
          }))
        : null,
      lineage: scopes.has('TRACEABILITY_LINEAGE')
        ? share.lot.contributions.map((contribution) => ({
            batchPublicId: contribution.batch.publicId,
            batchNumber: contribution.batch.batchNumber,
            quantity: contribution.quantity.toFixed(4),
            deliveries: contribution.batch.farmerContributions.map((item) => item.delivery),
          }))
        : null,
      documents: scopes.has('DOCUMENTS') ? [] : null,
    };
  }

  async getContract(organizationId: string, contractId: string) {
    const contract = await this.database.client.salesContract.findFirst({
      where: {
        id: contractId,
        OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
      },
      include: { amendments: true, order: true, reservation: true },
    });
    if (!contract) throw new NotFoundException('Sales contract not found');
    return {
      ...this.serializeMoney(contract),
      order: contract.order ? this.serializeMoney(contract.order) : null,
    };
  }

  async getOrder(organizationId: string, orderId: string) {
    const order = await this.database.client.salesOrder.findFirst({
      where: {
        id: orderId,
        OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
      },
      include: {
        contract: true,
        custodyTransfer: true,
        statusEvents: { orderBy: { occurredAt: 'asc' } },
        buyerInspections: { include: { measurements: true } },
        buyerAcceptances: { orderBy: { decidedAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    return { ...this.serializeMoney(order), contract: this.serializeMoney(order.contract) };
  }

  private allowedContractChanges(
    value: unknown,
  ): Prisma.SalesContractUpdateInput & Prisma.InputJsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new UnprocessableEntityException('Proposed changes must be an object');
    const source = value as Record<string, unknown>;
    const allowed = new Set([
      'deliveryTerm',
      'expectedDeliveryDate',
      'paymentTerms',
      'qualityTerms',
      'additionalTerms',
    ]);
    if (Object.keys(source).some((key) => !allowed.has(key)))
      throw new UnprocessableEntityException(
        'Amendment contains immutable or unsupported contract fields',
      );
    const changes: Record<string, string | Date | Prisma.InputJsonValue | null> = {};
    if (typeof source.deliveryTerm === 'string') changes.deliveryTerm = source.deliveryTerm;
    if (typeof source.expectedDeliveryDate === 'string')
      changes.expectedDeliveryDate = new Date(source.expectedDeliveryDate);
    if (typeof source.paymentTerms === 'string') changes.paymentTerms = source.paymentTerms;
    if (source.qualityTerms !== undefined)
      changes.qualityTerms = source.qualityTerms as Prisma.InputJsonValue;
    if (typeof source.additionalTerms === 'string' || source.additionalTerms === null)
      changes.additionalTerms = source.additionalTerms;
    if (Object.keys(changes).length === 0)
      throw new UnprocessableEntityException('Amendment has no supported changes');
    return changes as Prisma.SalesContractUpdateInput & Prisma.InputJsonObject;
  }

  private async transitionReservation(
    organizationId: string,
    reservationId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
    status: 'RELEASED' | 'CANCELLED',
    sellerOnly: boolean,
    allowedStatuses: Array<'ACTIVE' | 'CONTRACTED'>,
  ) {
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "LotReservation" WHERE id = ${reservationId}::uuid FOR UPDATE`;
      const reservation = await transaction.lotReservation.findFirst({
        where: {
          id: reservationId,
          ...(sellerOnly
            ? { sellerOrganizationId: organizationId }
            : {
                OR: [
                  { sellerOrganizationId: organizationId },
                  { buyerOrganizationId: organizationId },
                ],
              }),
        },
        include: { salesContract: { include: { order: true } } },
      });
      if (!reservation) throw new NotFoundException('Lot reservation not found');
      if (reservation.version !== input.version) this.versionConflict();
      if (
        !allowedStatuses.includes(reservation.status as 'ACTIVE' | 'CONTRACTED') ||
        reservation.salesContract?.order
      )
        throw new UnprocessableEntityException('Reservation can no longer be released');
      await transaction.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${reservation.listingId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT id FROM "CooperativeLot" WHERE id = ${reservation.lotId}::uuid FOR UPDATE`;
      if (
        reservation.salesContract &&
        !['CANCELLED', 'EXPIRED'].includes(reservation.salesContract.status)
      ) {
        await transaction.salesContract.update({
          where: { id: reservation.salesContract.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancellationReason: input.reason,
            version: { increment: 1 },
          },
        });
      }
      await this.restoreAllocation(transaction, reservation, status, input.reason);
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        `LOT_RESERVATION_${status}`,
        'LotReservation',
        reservation.id,
        { reason: input.reason, listingId: reservation.listingId },
      );
    });
    const reservation = await this.database.client.lotReservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    return { ...reservation, quantity: reservation.quantity.toFixed(4) };
  }

  private async restoreAllocation(
    transaction: Prisma.TransactionClient,
    reservation: Prisma.LotReservationGetPayload<object>,
    status: 'RELEASED' | 'CANCELLED',
    reason: string,
  ) {
    const listing = await transaction.marketplaceListing.findUniqueOrThrow({
      where: { id: reservation.listingId },
    });
    const restored =
      toQuantityUnits(listing.availableQuantity.toFixed(4)) +
      toQuantityUnits(reservation.quantity.toFixed(4));
    const listed = toQuantityUnits(listing.listedQuantity.toFixed(4));
    if (restored > listed)
      throw new ConflictException('Reservation release would exceed listed quantity');
    const terminal = ['CLOSED', 'CANCELLED', 'EXPIRED'].includes(listing.status);
    const listingStatus =
      terminal || listing.status === 'PAUSED'
        ? listing.status
        : listing.expiresAt && listing.expiresAt <= new Date()
          ? 'EXPIRED'
          : restored === listed
            ? 'PUBLISHED'
            : 'PARTIALLY_RESERVED';
    await transaction.lotReservation.update({
      where: { id: reservation.id },
      data: { status, releasedAt: new Date(), releaseReason: reason, version: { increment: 1 } },
    });
    await transaction.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        availableQuantity: formatQuantity(restored),
        status: listingStatus,
        version: { increment: 1 },
      },
    });
    const remaining = await transaction.lotReservation.count({
      where: {
        lotId: reservation.lotId,
        id: { not: reservation.id },
        status: { in: ['ACTIVE', 'CONTRACTED', 'CONSUMED'] },
      },
    });
    if (remaining === 0) {
      await transaction.cooperativeLot.update({
        where: { id: reservation.lotId },
        data: { saleHoldAt: null, saleHoldReason: null },
      });
    }
  }

  private async transitionAmendment(
    organizationId: string,
    amendmentId: string,
    input: ReasonInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
    status: 'REJECTED' | 'WITHDRAWN',
    requesterActs: boolean,
  ) {
    return this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "ContractAmendment" WHERE id = ${amendmentId}::uuid FOR UPDATE`;
      const amendment = await transaction.contractAmendment.findUnique({
        where: { id: amendmentId },
        include: { contract: true },
      });
      if (
        !amendment ||
        ![amendment.contract.sellerOrganizationId, amendment.contract.buyerOrganizationId].includes(
          organizationId,
        )
      )
        throw new NotFoundException('Contract amendment not found');
      if ((amendment.requestedByOrganizationId === organizationId) !== requesterActs)
        throw new UnprocessableEntityException(
          'Amendment action is not available to this organization',
        );
      if (amendment.status !== 'PENDING_COUNTERPARTY')
        throw new UnprocessableEntityException('Amendment is no longer actionable');
      const updated = await transaction.contractAmendment.update({
        where: { id: amendment.id },
        data: { status, ...(status === 'REJECTED' ? { rejectedAt: new Date() } : {}) },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        `CONTRACT_AMENDMENT_${status}`,
        'ContractAmendment',
        amendment.id,
        { reason: input.reason, contractId: amendment.contractId },
      );
      return updated;
    });
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

  private statusEvent(
    transaction: Prisma.TransactionClient,
    orderId: string,
    fromStatus: Prisma.SalesOrderGetPayload<object>['status'] | null,
    toStatus: Prisma.SalesOrderGetPayload<object>['status'],
    organizationId: string,
    userId: string,
    reasonCode: string,
  ) {
    return transaction.orderStatusEvent.create({
      data: {
        orderId,
        fromStatus,
        toStatus,
        reasonCode,
        actorUserId: userId,
        actorOrganizationId: organizationId,
        metadata: {},
      },
    });
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

  private serializeMoney<
    T extends { quantity: Prisma.Decimal; unitPriceMinor: bigint; totalAmountMinor: bigint },
  >(value: T) {
    return {
      ...value,
      quantity: value.quantity.toFixed(4),
      unitPriceMinor: value.unitPriceMinor.toString(),
      totalAmountMinor: value.totalAmountMinor.toString(),
    };
  }

  private versionConflict(): never {
    this.conflict(PHASE_FIVE_ERROR_CODES.VERSION_CONFLICT, 'Resource version changed');
  }

  private conflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }
}
