import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  attachCustodyTransferSchema,
  createBuyerInspectionSchema,
  createContractAmendmentSchema,
  createOrderSchema,
  createTraceabilityShareSchema,
  reasonActionSchema,
  reasonSchema,
  recordBuyerAcceptanceSchema,
  versionedActionSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { CommerceService } from './commerce.service.js';

@ApiTags('Commercial fulfillment')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations/:organizationId/commerce')
export class CommerceController {
  constructor(@Inject(CommerceService) private readonly commerce: CommerceService) {}

  @Get('contracts')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_READ)
  contracts(@Param('organizationId') organizationId: string) {
    return this.commerce.listContracts(organizationId);
  }

  @Get('contracts/:contractId')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_READ)
  contract(
    @Param('organizationId') organizationId: string,
    @Param('contractId') contractId: string,
  ) {
    return this.commerce.getContract(organizationId, contractId);
  }

  @Post('contracts/:contractId/approve')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_APPROVE)
  approveContract(
    @Param('organizationId') organizationId: string,
    @Param('contractId') contractId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.approveContract(
      organizationId,
      contractId,
      parseWithSchema(versionedActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('reservations/:reservationId/release')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_APPROVE)
  releaseReservation(
    @Param('organizationId') organizationId: string,
    @Param('reservationId') reservationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.releaseReservation(
      organizationId,
      reservationId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('reservations/:reservationId/cancel')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_APPROVE)
  cancelReservation(
    @Param('organizationId') organizationId: string,
    @Param('reservationId') reservationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.cancelReservation(
      organizationId,
      reservationId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('contracts/:contractId/cancel')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_APPROVE)
  cancelContract(
    @Param('organizationId') organizationId: string,
    @Param('contractId') contractId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.cancelContract(
      organizationId,
      contractId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('contracts/:contractId/amendments')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_AMEND)
  proposeAmendment(
    @Param('organizationId') organizationId: string,
    @Param('contractId') contractId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.proposeAmendment(
      organizationId,
      contractId,
      parseWithSchema(createContractAmendmentSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('amendments/:amendmentId/approve')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_AMEND)
  approveAmendment(
    @Param('organizationId') organizationId: string,
    @Param('amendmentId') amendmentId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.approveAmendment(
      organizationId,
      amendmentId,
      principal,
      request.requestId,
    );
  }

  @Post('amendments/:amendmentId/reject')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_AMEND)
  rejectAmendment(
    @Param('organizationId') organizationId: string,
    @Param('amendmentId') amendmentId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.rejectAmendment(
      organizationId,
      amendmentId,
      parseWithSchema(reasonSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('amendments/:amendmentId/withdraw')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_AMEND)
  withdrawAmendment(
    @Param('organizationId') organizationId: string,
    @Param('amendmentId') amendmentId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.withdrawAmendment(
      organizationId,
      amendmentId,
      parseWithSchema(reasonSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('contracts/:contractId/orders')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_MANAGE)
  createOrder(
    @Param('organizationId') organizationId: string,
    @Param('contractId') contractId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.createOrder(
      organizationId,
      contractId,
      parseWithSchema(createOrderSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('orders/:orderId')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_READ)
  order(@Param('organizationId') organizationId: string, @Param('orderId') orderId: string) {
    return this.commerce.getOrder(organizationId, orderId);
  }

  @Post('orders/:orderId/cancel')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_MANAGE)
  cancelOrder(
    @Param('organizationId') organizationId: string,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.cancelOrder(
      organizationId,
      orderId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('orders/:orderId/custody-transfer')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_MANAGE)
  attachCustody(
    @Param('organizationId') organizationId: string,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.attachCustodyTransfer(
      organizationId,
      orderId,
      parseWithSchema(attachCustodyTransferSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('orders/:orderId/sync-custody')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_READ)
  syncCustody(
    @Param('organizationId') organizationId: string,
    @Param('orderId') orderId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.syncCustody(organizationId, orderId, principal, request.requestId);
  }

  @Post('orders/:orderId/inspections')
  @RequirePermissions(PERMISSIONS.BUYER_INSPECTION_RECORD)
  inspect(
    @Param('organizationId') organizationId: string,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.inspect(
      organizationId,
      orderId,
      parseWithSchema(createBuyerInspectionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('orders/:orderId/acceptance')
  @RequirePermissions(PERMISSIONS.BUYER_ACCEPTANCE_RECORD)
  accept(
    @Param('organizationId') organizationId: string,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.accept(
      organizationId,
      orderId,
      parseWithSchema(recordBuyerAcceptanceSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('orders/:orderId/complete')
  @RequirePermissions(PERMISSIONS.SALES_ORDER_MANAGE)
  complete(
    @Param('organizationId') organizationId: string,
    @Param('orderId') orderId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.complete(organizationId, orderId, principal, request.requestId);
  }

  @Post('traceability-shares')
  @RequirePermissions(PERMISSIONS.TRACEABILITY_SHARE_MANAGE)
  createShare(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.createShare(
      organizationId,
      parseWithSchema(createTraceabilityShareSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('traceability-shares/:shareId/revoke')
  @RequirePermissions(PERMISSIONS.TRACEABILITY_SHARE_MANAGE)
  revokeShare(
    @Param('organizationId') organizationId: string,
    @Param('shareId') shareId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.revokeShare(
      organizationId,
      shareId,
      parseWithSchema(reasonSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('traceability-shares/:shareId')
  @RequirePermissions(PERMISSIONS.TRACEABILITY_SHARE_READ)
  sharedTrace(@Param('organizationId') organizationId: string, @Param('shareId') shareId: string) {
    return this.commerce.sharedTrace(organizationId, shareId);
  }
}
