import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  counterOfferSchema,
  createMarketplaceListingSchema,
  inviteBuyerSchema,
  reasonActionSchema,
  submitOfferSchema,
  updateMarketplaceListingSchema,
  versionedActionSchema,
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
import { MarketplaceService } from './marketplace.service.js';

@ApiTags('Marketplace')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@OrgScopeFromParam()
@Controller('organizations/:organizationId/marketplace')
export class MarketplaceController {
  constructor(@Inject(MarketplaceService) private readonly marketplace: MarketplaceService) {}

  @Get('listings')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_READ)
  list(@Param('organizationId') organizationId: string) {
    return this.marketplace.list(organizationId);
  }

  @Get('listings/:listingId')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_READ)
  get(@Param('organizationId') organizationId: string, @Param('listingId') listingId: string) {
    return this.marketplace.get(organizationId, listingId);
  }

  @Post('listings')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_MANAGE)
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.create(
      organizationId,
      parseWithSchema(createMarketplaceListingSchema, body),
      principal,
      request.requestId,
    );
  }

  @Patch('listings/:listingId')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_MANAGE)
  update(
    @Param('organizationId') organizationId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.update(
      organizationId,
      listingId,
      parseWithSchema(updateMarketplaceListingSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('listings/:listingId/publish')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_MANAGE)
  publish(
    @Param('organizationId') organizationId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.publish(
      organizationId,
      listingId,
      parseWithSchema(versionedActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('listings/:listingId/pause')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_MANAGE)
  pause(
    @Param('organizationId') organizationId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.pause(
      organizationId,
      listingId,
      parseWithSchema(versionedActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('listings/:listingId/close')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_MANAGE)
  close(
    @Param('organizationId') organizationId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.close(
      organizationId,
      listingId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('listings/:listingId/cancel')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_LISTING_MANAGE)
  cancel(
    @Param('organizationId') organizationId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.cancel(
      organizationId,
      listingId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('listings/:listingId/invitations')
  @RequirePermissions(PERMISSIONS.MARKETPLACE_INVITATION_MANAGE)
  invite(
    @Param('organizationId') organizationId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.invite(
      organizationId,
      listingId,
      parseWithSchema(inviteBuyerSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('offers')
  @RequirePermissions(PERMISSIONS.OFFER_READ)
  offers(@Param('organizationId') organizationId: string) {
    return this.marketplace.listOffers(organizationId);
  }

  @Get('offers/:offerId')
  @RequirePermissions(PERMISSIONS.OFFER_READ)
  offer(@Param('organizationId') organizationId: string, @Param('offerId') offerId: string) {
    return this.marketplace.getOffer(organizationId, offerId);
  }

  @Post('listings/:listingId/offers')
  @RequirePermissions(PERMISSIONS.OFFER_SUBMIT)
  submitOffer(
    @Param('organizationId') organizationId: string,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.submitOffer(
      organizationId,
      listingId,
      parseWithSchema(submitOfferSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('offers/:offerId/counter')
  @RequirePermissions(PERMISSIONS.OFFER_RESPOND)
  counterOffer(
    @Param('organizationId') organizationId: string,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.counterOffer(
      organizationId,
      offerId,
      parseWithSchema(counterOfferSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('offers/:offerId/accept')
  @RequirePermissions(PERMISSIONS.OFFER_RESPOND)
  acceptOffer(
    @Param('organizationId') organizationId: string,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.acceptOffer(
      organizationId,
      offerId,
      parseWithSchema(versionedActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('offers/:offerId/reject')
  @RequirePermissions(PERMISSIONS.OFFER_RESPOND)
  rejectOffer(
    @Param('organizationId') organizationId: string,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.rejectOffer(
      organizationId,
      offerId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Post('offers/:offerId/withdraw')
  @RequirePermissions(PERMISSIONS.OFFER_RESPOND)
  withdrawOffer(
    @Param('organizationId') organizationId: string,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.marketplace.withdrawOffer(
      organizationId,
      offerId,
      parseWithSchema(reasonActionSchema, body),
      principal,
      request.requestId,
    );
  }

  @Get('contracts/:contractId')
  @RequirePermissions(PERMISSIONS.SALES_CONTRACT_READ)
  contract(
    @Param('organizationId') organizationId: string,
    @Param('contractId') contractId: string,
  ) {
    return this.marketplace.getContract(organizationId, contractId);
  }
}
