import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  confirmDeliverySchema,
  createDeliverySchema,
  deliveryListQuerySchema,
  deliveryVersionCommandSchema,
  rejectDeliverySchema,
  requestDeliveryCorrectionSchema,
  reviewDeliveryCorrectionSchema,
} from '@clycites/contracts';

import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import {
  CurrentPrincipal,
  OrgScopeFromParam,
  RequirePermissions,
} from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { DeliveriesService } from './deliveries.service.js';

@ApiTags('Deliveries')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId/deliveries')
export class DeliveriesController {
  constructor(@Inject(DeliveriesService) private readonly deliveries: DeliveriesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.DELIVERY_RECORD)
  create(
    @Param('organizationId') organizationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.create(
      organizationId,
      idempotencyKey,
      parseWithSchema(createDeliverySchema, body),
      principal,
      request.requestId,
    );
  }

  @Get()
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  list(@Param('organizationId') organizationId: string, @Query() query: Record<string, unknown>) {
    return this.deliveries.list(organizationId, parseWithSchema(deliveryListQuerySchema, query));
  }

  @Get(':deliveryId')
  @RequirePermissions(PERMISSIONS.DELIVERY_READ)
  get(@Param('organizationId') organizationId: string, @Param('deliveryId') deliveryId: string) {
    return this.deliveries.get(organizationId, deliveryId);
  }

  @Post(':deliveryId/submit')
  @RequirePermissions(PERMISSIONS.DELIVERY_SUBMIT)
  submit(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.submit(
      organizationId,
      deliveryId,
      parseWithSchema(deliveryVersionCommandSchema, body).lockVersion,
      principal,
      request.requestId,
    );
  }

  @Post(':deliveryId/confirm')
  @RequirePermissions(PERMISSIONS.DELIVERY_CONFIRM)
  confirm(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.confirm(
      organizationId,
      deliveryId,
      parseWithSchema(confirmDeliverySchema, body),
      principal,
      request.requestId,
    );
  }

  @Post(':deliveryId/accept')
  @RequirePermissions(PERMISSIONS.DELIVERY_ACCEPT)
  accept(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.accept(
      organizationId,
      deliveryId,
      parseWithSchema(deliveryVersionCommandSchema, body).lockVersion,
      principal,
      request.requestId,
    );
  }

  @Post(':deliveryId/reject')
  @RequirePermissions(PERMISSIONS.DELIVERY_REJECT)
  reject(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.reject(
      organizationId,
      deliveryId,
      parseWithSchema(rejectDeliverySchema, body),
      principal,
      request.requestId,
    );
  }

  @Get(':deliveryId/receipt')
  @RequirePermissions(PERMISSIONS.DELIVERY_RECEIPT_READ)
  receipt(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.deliveries.receipt(organizationId, deliveryId, false);
  }

  @Post(':deliveryId/receipt/reprint')
  @RequirePermissions(PERMISSIONS.DELIVERY_RECEIPT_REPRINT)
  reprintReceipt(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.reprintReceipt(organizationId, deliveryId, principal, request.requestId);
  }

  @Post(':deliveryId/corrections')
  @RequirePermissions(PERMISSIONS.DELIVERY_CORRECTION_REQUEST)
  requestCorrection(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.requestCorrection(
      organizationId,
      deliveryId,
      parseWithSchema(requestDeliveryCorrectionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post(':deliveryId/corrections/:correctionId/approve')
  @RequirePermissions(PERMISSIONS.DELIVERY_CORRECTION_REVIEW)
  approveCorrection(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @Param('correctionId') correctionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.approveCorrection(
      organizationId,
      deliveryId,
      correctionId,
      parseWithSchema(reviewDeliveryCorrectionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post(':deliveryId/corrections/:correctionId/reject')
  @RequirePermissions(PERMISSIONS.DELIVERY_CORRECTION_REVIEW)
  rejectCorrection(
    @Param('organizationId') organizationId: string,
    @Param('deliveryId') deliveryId: string,
    @Param('correctionId') correctionId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deliveries.rejectCorrection(
      organizationId,
      deliveryId,
      correctionId,
      parseWithSchema(reviewDeliveryCorrectionSchema, body),
      principal,
      request.requestId,
    );
  }
}
