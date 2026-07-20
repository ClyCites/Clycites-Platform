import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  createFarmerPaymentMethodSchema,
  createDeductionPolicySchema,
  createPaymentInstructionSchema,
  createManualReconciliationSchema,
  createSettlementRunSchema,
  recordSaleProceedsSchema,
  reverseSaleProceedsSchema,
  paymentInstructionVersionActionSchema,
  reviewReconciliationSchema,
  verifyFarmerPaymentMethodSchema,
  verifySaleProceedsSchema,
  settlementVersionActionSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('Financial settlements')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations/:organizationId/finance')
export class SettlementsController {
  constructor(@Inject(SettlementsService) private readonly settlements: SettlementsService) {}

  @Get('sale-proceeds')
  @RequirePermissions(PERMISSIONS.SALE_PROCEEDS_READ)
  saleProceeds(@Param('organizationId') organizationId: string) {
    return this.settlements.listSaleProceeds(organizationId);
  }

  @Post('sale-proceeds')
  @RequirePermissions(PERMISSIONS.SALE_PROCEEDS_RECORD)
  recordSaleProceeds(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.recordSaleProceeds(
      organizationId,
      parseWithSchema(recordSaleProceedsSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('sale-proceeds/:recordId/verify')
  @RequirePermissions(PERMISSIONS.SALE_PROCEEDS_VERIFY)
  verifySaleProceeds(
    @Param('organizationId') organizationId: string,
    @Param('recordId') recordId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.verifySaleProceeds(
      organizationId,
      recordId,
      parseWithSchema(verifySaleProceedsSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('sale-proceeds/:recordId/reverse')
  @RequirePermissions(PERMISSIONS.SALE_PROCEEDS_VERIFY)
  reverseSaleProceeds(
    @Param('organizationId') organizationId: string,
    @Param('recordId') recordId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.reverseSaleProceeds(
      organizationId,
      recordId,
      parseWithSchema(reverseSaleProceedsSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('settlements')
  @RequirePermissions(PERMISSIONS.SETTLEMENT_READ)
  settlementRuns(@Param('organizationId') organizationId: string) {
    return this.settlements.listSettlementRuns(organizationId);
  }

  @Get('deduction-policies')
  @RequirePermissions(PERMISSIONS.DEDUCTION_POLICY_READ)
  deductionPolicies(@Param('organizationId') organizationId: string) {
    return this.settlements.listDeductionPolicies(organizationId);
  }

  @Post('deduction-policies')
  @RequirePermissions(PERMISSIONS.DEDUCTION_POLICY_MANAGE)
  createDeductionPolicy(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.createDeductionPolicy(
      organizationId,
      parseWithSchema(createDeductionPolicySchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('deduction-policies/:policyId/approve')
  @RequirePermissions(PERMISSIONS.DEDUCTION_POLICY_APPROVE)
  approveDeductionPolicy(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.approveDeductionPolicy(
      organizationId,
      policyId,
      principal,
      request.requestId,
    );
  }

  @Get('settlements/:settlementRunId')
  @RequirePermissions(PERMISSIONS.SETTLEMENT_READ)
  settlementRun(
    @Param('organizationId') organizationId: string,
    @Param('settlementRunId') settlementRunId: string,
  ) {
    return this.settlements.getSettlementRun(organizationId, settlementRunId);
  }

  @Post('settlements')
  @RequirePermissions(PERMISSIONS.SETTLEMENT_CALCULATE)
  createSettlementRun(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.createSettlementRun(
      organizationId,
      parseWithSchema(createSettlementRunSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('settlements/:settlementRunId/calculate')
  @RequirePermissions(PERMISSIONS.SETTLEMENT_CALCULATE)
  calculateSettlementRun(
    @Param('organizationId') organizationId: string,
    @Param('settlementRunId') settlementRunId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.calculateSettlementRun(
      organizationId,
      settlementRunId,
      parseWithSchema(settlementVersionActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('settlements/:settlementRunId/submit')
  @RequirePermissions(PERMISSIONS.SETTLEMENT_REVIEW)
  submitSettlementRun(
    @Param('organizationId') organizationId: string,
    @Param('settlementRunId') settlementRunId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.submitSettlementRun(
      organizationId,
      settlementRunId,
      parseWithSchema(settlementVersionActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('settlements/:settlementRunId/approve')
  @RequirePermissions(PERMISSIONS.SETTLEMENT_APPROVE)
  approveSettlementRun(
    @Param('organizationId') organizationId: string,
    @Param('settlementRunId') settlementRunId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.approveSettlementRun(
      organizationId,
      settlementRunId,
      parseWithSchema(settlementVersionActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('farmers/:farmerId/payment-methods')
  @RequirePermissions(PERMISSIONS.PAYMENT_METHOD_READ)
  paymentMethods(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
  ) {
    return this.settlements.listPaymentMethods(organizationId, farmerId);
  }

  @Post('farmer-settlements/:farmerSettlementId/statements')
  @RequirePermissions(PERMISSIONS.FARMER_STATEMENT_ISSUE)
  issueStatement(
    @Param('organizationId') organizationId: string,
    @Param('farmerSettlementId') farmerSettlementId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.issueStatement(
      organizationId,
      farmerSettlementId,
      principal,
      request.requestId,
    );
  }

  @Get('payment-instructions')
  @RequirePermissions(PERMISSIONS.PAYMENT_INSTRUCTION_READ)
  paymentInstructions(@Param('organizationId') organizationId: string) {
    return this.settlements.listPaymentInstructions(organizationId);
  }

  @Post('payment-instructions')
  @RequirePermissions(PERMISSIONS.PAYMENT_INSTRUCTION_CREATE)
  createPaymentInstruction(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.createPaymentInstruction(
      organizationId,
      parseWithSchema(createPaymentInstructionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('payment-instructions/:paymentInstructionId/request-approval')
  @RequirePermissions(PERMISSIONS.PAYMENT_INSTRUCTION_CREATE)
  requestPaymentInstructionApproval(
    @Param('organizationId') organizationId: string,
    @Param('paymentInstructionId') paymentInstructionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.requestPaymentInstructionApproval(
      organizationId,
      paymentInstructionId,
      parseWithSchema(paymentInstructionVersionActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('payment-instructions/:paymentInstructionId/approve')
  @RequirePermissions(PERMISSIONS.PAYMENT_INSTRUCTION_APPROVE)
  approvePaymentInstruction(
    @Param('organizationId') organizationId: string,
    @Param('paymentInstructionId') paymentInstructionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.approvePaymentInstruction(
      organizationId,
      paymentInstructionId,
      parseWithSchema(paymentInstructionVersionActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('payment-instructions/:paymentInstructionId/submit')
  @RequirePermissions(PERMISSIONS.PAYMENT_INSTRUCTION_SUBMIT)
  submitPaymentInstruction(
    @Param('organizationId') organizationId: string,
    @Param('paymentInstructionId') paymentInstructionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.submitPaymentInstruction(
      organizationId,
      paymentInstructionId,
      parseWithSchema(paymentInstructionVersionActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('reconciliations')
  @RequirePermissions(PERMISSIONS.PAYMENT_RECONCILIATION_READ)
  reconciliations(@Param('organizationId') organizationId: string) {
    return this.settlements.listReconciliations(organizationId);
  }

  @Post('reconciliations')
  @RequirePermissions(PERMISSIONS.PAYMENT_RECONCILIATION_CREATE)
  createReconciliation(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.createReconciliation(
      organizationId,
      parseWithSchema(createManualReconciliationSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('reconciliations/:reconciliationId/review')
  @RequirePermissions(PERMISSIONS.PAYMENT_RECONCILIATION_CONFIRM)
  reviewReconciliation(
    @Param('organizationId') organizationId: string,
    @Param('reconciliationId') reconciliationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.reviewReconciliation(
      organizationId,
      reconciliationId,
      parseWithSchema(reviewReconciliationSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('farmers/:farmerId/payment-methods')
  @RequirePermissions(PERMISSIONS.PAYMENT_METHOD_MANAGE)
  createPaymentMethod(
    @Param('organizationId') organizationId: string,
    @Param('farmerId') farmerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.settlements.createPaymentMethod(
      organizationId,
      farmerId,
      parseWithSchema(createFarmerPaymentMethodSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('payment-methods/:paymentMethodId/verify')
  @RequirePermissions(PERMISSIONS.PAYMENT_METHOD_VERIFY)
  verifyPaymentMethod(
    @Param('organizationId') organizationId: string,
    @Param('paymentMethodId') paymentMethodId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    parseWithSchema(verifyFarmerPaymentMethodSchema, body);
    return this.settlements.verifyPaymentMethod(
      organizationId,
      paymentMethodId,
      principal,
      request.requestId,
    );
  }
}
