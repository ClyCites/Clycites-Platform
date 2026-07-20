import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import {
  PHASE_FIVE_ERROR_CODES,
  type CounterOfferInput,
  type CreateMarketplaceListingInput,
  type InviteBuyerInput,
  type ReasonActionInput,
  type SubmitOfferInput,
  type UpdateMarketplaceListingInput,
  type VersionedActionInput,
} from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { AuditService } from '../audit/audit.service.js';
import { DomainEventService } from '../audit/domain-event.service.js';
import { formatQuantity, toQuantityUnits } from '../batches/quantity.js';
import { DatabaseService } from '../database/database.service.js';

const listingInclude = {
  lot: { include: { commodity: true, commodityForm: true, inspections: true } },
  sellerOrganization: true,
  invitations: true,
} satisfies Prisma.MarketplaceListingInclude;

@Injectable()
export class MarketplaceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventService) private readonly events: DomainEventService,
  ) {}

  async list(organizationId: string) {
    const organization = await this.organization(organizationId);
    const listings = await this.database.client.marketplaceListing.findMany({
      where:
        organization.type === 'BUYER'
          ? {
              status: { in: ['PUBLISHED', 'PARTIALLY_RESERVED'] },
              OR: [
                { visibility: 'PUBLIC_BUYERS' },
                {
                  invitations: { some: { buyerOrganizationId: organizationId, status: 'INVITED' } },
                },
              ],
            }
          : { sellerOrganizationId: organizationId },
      include: listingInclude,
      orderBy: { createdAt: 'desc' },
    });
    return listings.map((listing) => this.serializeListing(listing));
  }

  async get(organizationId: string, listingId: string) {
    const listing = await this.database.client.marketplaceListing.findUnique({
      where: { id: listingId },
      include: listingInclude,
    });
    if (!listing) throw new NotFoundException('Marketplace listing not found');
    await this.assertCanView(organizationId, listing);
    return this.serializeListing(listing);
  }

  async create(
    organizationId: string,
    input: CreateMarketplaceListingInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const id = randomUUID();
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "CooperativeLot" WHERE id = ${input.lotId}::uuid FOR UPDATE`;
      const lot = await transaction.cooperativeLot.findFirst({
        where: { id: input.lotId, organizationId },
        include: { inspections: { orderBy: { inspectedAt: 'desc' }, take: 1 } },
      });
      if (!lot || lot.status !== 'APPROVED' || lot.inspections[0]?.status !== 'PASSED')
        this.conflict(
          PHASE_FIVE_ERROR_CODES.LISTING_NOT_ELIGIBLE,
          'Only approved lots with a passed quality inspection can be listed',
        );
      const requested = toQuantityUnits(input.listedQuantity);
      const existingListings = await transaction.marketplaceListing.findMany({
        where: {
          lotId: lot.id,
          status: {
            in: [
              'DRAFT',
              'PUBLISHED',
              'PAUSED',
              'UNDER_OFFER',
              'PARTIALLY_RESERVED',
              'FULLY_RESERVED',
            ],
          },
        },
        select: { listedQuantity: true },
      });
      const alreadyListed = existingListings.reduce(
        (total, listing) => total + toQuantityUnits(listing.listedQuantity.toFixed(4)),
        0n,
      );
      if (requested <= 0n || requested + alreadyListed > toQuantityUnits(lot.quantity.toFixed(4)))
        this.conflict(
          PHASE_FIVE_ERROR_CODES.INSUFFICIENT_AVAILABLE_QUANTITY,
          'Listed quantity exceeds the approved lot quantity',
        );
      if (input.pricingMethod === 'FIXED_PRICE' && input.askingUnitPriceMinor === undefined)
        throw new UnprocessableEntityException('Fixed-price listings require an asking price');
      await transaction.marketplaceListing.create({
        data: {
          id,
          publicId: `lst1_${randomUUID().replaceAll('-', '')}`,
          listingNumber: input.listingNumber,
          sellerOrganizationId: organizationId,
          lotId: input.lotId,
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          listedQuantity: input.listedQuantity,
          availableQuantity: input.listedQuantity,
          currency: input.currency,
          pricingMethod: input.pricingMethod,
          ...(input.askingUnitPriceMinor
            ? { askingUnitPriceMinor: BigInt(input.askingUnitPriceMinor) }
            : {}),
          ...(input.minimumOfferUnitPriceMinor
            ? { minimumOfferUnitPriceMinor: BigInt(input.minimumOfferUnitPriceMinor) }
            : {}),
          ...(input.minimumOfferQuantity
            ? { minimumOfferQuantity: input.minimumOfferQuantity }
            : {}),
          allowPartialQuantity: input.allowPartialQuantity,
          visibility: input.visibility,
          ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
          createdByUserId: principal.subjectId,
        },
      });
      await this.recordListingVersion(id, principal.subjectId, transaction);
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'MARKETPLACE_LISTING_CREATED',
        'MarketplaceListing',
        id,
        { lotId: input.lotId },
      );
    });
    return this.get(organizationId, id);
  }

  async update(
    organizationId: string,
    listingId: string,
    input: UpdateMarketplaceListingInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const updated = await this.database.client.$transaction(async (transaction) => {
      const result = await transaction.marketplaceListing.updateMany({
        where: {
          id: listingId,
          sellerOrganizationId: organizationId,
          version: input.version,
          status: { in: ['DRAFT', 'PAUSED'] },
        },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.listedQuantity !== undefined
            ? {
                listedQuantity: input.listedQuantity,
                availableQuantity: input.listedQuantity,
              }
            : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.pricingMethod !== undefined ? { pricingMethod: input.pricingMethod } : {}),
          ...(input.askingUnitPriceMinor !== undefined
            ? { askingUnitPriceMinor: BigInt(input.askingUnitPriceMinor) }
            : {}),
          ...(input.minimumOfferUnitPriceMinor !== undefined
            ? { minimumOfferUnitPriceMinor: BigInt(input.minimumOfferUnitPriceMinor) }
            : {}),
          ...(input.minimumOfferQuantity !== undefined
            ? { minimumOfferQuantity: input.minimumOfferQuantity }
            : {}),
          ...(input.allowPartialQuantity !== undefined
            ? { allowPartialQuantity: input.allowPartialQuantity }
            : {}),
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
          ...(input.expiresAt !== undefined ? { expiresAt: new Date(input.expiresAt) } : {}),
          updatedByUserId: principal.subjectId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) this.versionConflict();
      await this.recordListingVersion(listingId, principal.subjectId, transaction);
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'MARKETPLACE_LISTING_UPDATED',
        'MarketplaceListing',
        listingId,
      );
      return listingId;
    });
    return this.get(organizationId, updated);
  }

  async publish(
    organizationId: string,
    listingId: string,
    input: VersionedActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const listing = await transaction.marketplaceListing.findFirst({
        where: { id: listingId, sellerOrganizationId: organizationId },
      });
      if (!listing) throw new NotFoundException('Marketplace listing not found');
      const status = listing.availableQuantity.equals(listing.listedQuantity)
        ? 'PUBLISHED'
        : 'PARTIALLY_RESERVED';
      const result = await transaction.marketplaceListing.updateMany({
        where: {
          id: listingId,
          sellerOrganizationId: organizationId,
          version: input.version,
          status: { in: ['DRAFT', 'PAUSED'] },
        },
        data: {
          status,
          publishedAt: new Date(),
          updatedByUserId: principal.subjectId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) this.versionConflict();
      await this.recordListingVersion(listingId, principal.subjectId, transaction);
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'MARKETPLACE_LISTING_PUBLISHED',
        'MarketplaceListing',
        listingId,
      );
    });
    return this.get(organizationId, listingId);
  }

  async pause(
    organizationId: string,
    listingId: string,
    input: VersionedActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionListing(
      organizationId,
      listingId,
      input.version,
      ['PUBLISHED', 'PARTIALLY_RESERVED'],
      'PAUSED',
      principal,
      requestId,
      'MARKETPLACE_LISTING_PAUSED',
    );
  }

  async close(
    organizationId: string,
    listingId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionListing(
      organizationId,
      listingId,
      input.version,
      ['PUBLISHED', 'PAUSED', 'PARTIALLY_RESERVED'],
      'CLOSED',
      principal,
      requestId,
      'MARKETPLACE_LISTING_CLOSED',
      input.reason,
    );
  }

  async cancel(
    organizationId: string,
    listingId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionListing(
      organizationId,
      listingId,
      input.version,
      ['DRAFT', 'PUBLISHED', 'PAUSED'],
      'CANCELLED',
      principal,
      requestId,
      'MARKETPLACE_LISTING_CANCELLED',
      input.reason,
    );
  }

  async invite(
    organizationId: string,
    listingId: string,
    input: InviteBuyerInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const listing = await this.database.client.marketplaceListing.findFirst({
      where: { id: listingId, sellerOrganizationId: organizationId },
    });
    if (!listing) throw new NotFoundException('Marketplace listing not found');
    const buyer = await this.database.client.organization.findFirst({
      where: { id: input.buyerOrganizationId, type: 'BUYER', status: 'ACTIVE', deletedAt: null },
    });
    if (!buyer) throw new UnprocessableEntityException('Active buyer organization not found');
    const invitation = await this.database.client.$transaction(async (transaction) => {
      const created = await transaction.listingInvitation.upsert({
        where: {
          listingId_buyerOrganizationId: {
            listingId,
            buyerOrganizationId: input.buyerOrganizationId,
          },
        },
        create: {
          listingId,
          buyerOrganizationId: input.buyerOrganizationId,
          invitedByUserId: principal.subjectId,
          ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
        },
        update: {
          status: 'INVITED',
          invitedByUserId: principal.subjectId,
          invitedAt: new Date(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        'MARKETPLACE_BUYER_INVITED',
        'ListingInvitation',
        created.id,
        { listingId, buyerOrganizationId: input.buyerOrganizationId },
      );
      return created;
    });
    return invitation;
  }

  async listOffers(organizationId: string) {
    const offers = await this.database.client.offer.findMany({
      where: {
        OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
      },
      include: { listing: true, sellerOrganization: true, buyerOrganization: true },
      orderBy: { createdAt: 'desc' },
    });
    return offers.map((offer) => this.serializeOffer(offer));
  }

  async submitOffer(
    buyerOrganizationId: string,
    listingId: string,
    input: SubmitOfferInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const id = randomUUID();
    await this.database.client.$transaction(async (transaction) => {
      const buyer = await transaction.organization.findFirst({
        where: { id: buyerOrganizationId, type: 'BUYER', status: 'ACTIVE', deletedAt: null },
      });
      if (!buyer) throw new ForbiddenException('Only active buyer organizations may submit offers');
      await transaction.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${listingId}::uuid FOR UPDATE`;
      const listing = await transaction.marketplaceListing.findUnique({
        where: { id: listingId },
        include: { invitations: true },
      });
      if (
        !listing ||
        !['PUBLISHED', 'PARTIALLY_RESERVED'].includes(listing.status) ||
        (listing.expiresAt && listing.expiresAt <= new Date())
      )
        this.conflict(PHASE_FIVE_ERROR_CODES.LISTING_NOT_ACTIVE, 'Listing is not open for offers');
      this.assertListingVisibility(buyerOrganizationId, listing);
      const quantity = toQuantityUnits(input.quantity);
      if (quantity <= 0n || quantity > toQuantityUnits(listing.availableQuantity.toFixed(4)))
        this.conflict(
          PHASE_FIVE_ERROR_CODES.INSUFFICIENT_AVAILABLE_QUANTITY,
          'Offer quantity exceeds listing availability',
        );
      if (
        !listing.allowPartialQuantity &&
        quantity !== toQuantityUnits(listing.availableQuantity.toFixed(4))
      )
        throw new UnprocessableEntityException(
          'This listing does not allow partial-quantity offers',
        );
      if (
        listing.minimumOfferQuantity &&
        quantity < toQuantityUnits(listing.minimumOfferQuantity.toFixed(4))
      )
        throw new UnprocessableEntityException('Offer quantity is below the listing minimum');
      const unitPriceMinor = BigInt(input.unitPriceMinor);
      if (listing.minimumOfferUnitPriceMinor && unitPriceMinor < listing.minimumOfferUnitPriceMinor)
        throw new UnprocessableEntityException('Offer price is below the listing minimum');
      if (input.currency !== listing.currency)
        throw new UnprocessableEntityException('Offer currency must match the listing currency');
      const offer = await transaction.offer.create({
        data: {
          id,
          publicId: `ofr1_${randomUUID().replaceAll('-', '')}`,
          offerNumber: `OFF-${Date.now()}-${id.slice(0, 6)}`,
          listingId,
          sellerOrganizationId: listing.sellerOrganizationId,
          buyerOrganizationId,
          roundNumber: 1,
          status: 'SUBMITTED',
          quantity: input.quantity,
          unitPriceMinor,
          currency: input.currency,
          totalAmountMinor: this.totalMinor(quantity, unitPriceMinor),
          deliveryTerm: input.deliveryTerm,
          ...(input.proposedDeliveryDate
            ? { proposedDeliveryDate: new Date(input.proposedDeliveryDate) }
            : {}),
          validUntil: new Date(input.validUntil),
          ...(input.message ? { message: input.message } : {}),
          submittedByUserId: principal.subjectId,
        },
      });
      await transaction.offer.update({ where: { id }, data: { rootOfferId: id } });
      await this.record(
        transaction,
        buyerOrganizationId,
        principal.subjectId,
        requestId,
        'OFFER_SUBMITTED',
        'Offer',
        id,
        { listingId, sellerOrganizationId: listing.sellerOrganizationId },
      );
      return offer;
    });
    return this.getOffer(buyerOrganizationId, id);
  }

  async counterOffer(
    organizationId: string,
    offerId: string,
    input: CounterOfferInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const counterId = randomUUID();
    await this.database.client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId}::uuid FOR UPDATE`;
        const offer = await transaction.offer.findUnique({
          where: { id: offerId },
          include: { listing: true },
        });
        if (
          !offer ||
          ![offer.sellerOrganizationId, offer.buyerOrganizationId].includes(organizationId)
        )
          throw new NotFoundException('Offer not found');
        if (offer.status !== 'SUBMITTED' || offer.version !== input.version)
          this.offerNotActionable();
        if (offer.submittedByUserId === principal.subjectId)
          throw new ForbiddenException('The submitting party cannot counter its own offer');
        const quantity = toQuantityUnits(input.quantity);
        const unitPriceMinor = BigInt(input.unitPriceMinor);
        await transaction.offer.update({
          where: { id: offerId },
          data: {
            status: 'COUNTERED',
            respondedByUserId: principal.subjectId,
            respondedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await transaction.offer.create({
          data: {
            id: counterId,
            publicId: `ofr1_${randomUUID().replaceAll('-', '')}`,
            offerNumber: `OFF-${Date.now()}-${counterId.slice(0, 6)}`,
            listingId: offer.listingId,
            sellerOrganizationId: offer.sellerOrganizationId,
            buyerOrganizationId: offer.buyerOrganizationId,
            parentOfferId: offer.id,
            rootOfferId: offer.rootOfferId ?? offer.id,
            roundNumber: offer.roundNumber + 1,
            status: 'SUBMITTED',
            quantity: input.quantity,
            unitPriceMinor,
            currency: input.currency,
            totalAmountMinor: this.totalMinor(quantity, unitPriceMinor),
            deliveryTerm: input.deliveryTerm,
            ...(input.proposedDeliveryDate
              ? { proposedDeliveryDate: new Date(input.proposedDeliveryDate) }
              : {}),
            validUntil: new Date(input.validUntil),
            ...(input.message ? { message: input.message } : {}),
            submittedByUserId: principal.subjectId,
          },
        });
        await this.record(
          transaction,
          organizationId,
          principal.subjectId,
          requestId,
          'OFFER_COUNTERED',
          'Offer',
          counterId,
          { previousOfferId: offerId },
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.getOffer(organizationId, counterId);
  }

  async acceptOffer(
    sellerOrganizationId: string,
    offerId: string,
    input: VersionedActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    let contractId = '';
    await this.serializable(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId}::uuid FOR UPDATE`;
      const offer = await transaction.offer.findFirst({
        where: { id: offerId, sellerOrganizationId },
        include: { listing: true },
      });
      if (!offer) throw new NotFoundException('Offer not found');
      await transaction.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${offer.listingId}::uuid FOR UPDATE`;
      await transaction.$queryRaw`SELECT id FROM "CooperativeLot" WHERE id = ${offer.listing.lotId}::uuid FOR UPDATE`;
      const listing = await transaction.marketplaceListing.findUniqueOrThrow({
        where: { id: offer.listingId },
      });
      if (offer.status !== 'SUBMITTED' || offer.version !== input.version)
        this.offerNotActionable();
      if (offer.validUntil <= new Date())
        this.conflict(PHASE_FIVE_ERROR_CODES.OFFER_EXPIRED, 'Offer has expired');
      const quantity = toQuantityUnits(offer.quantity.toFixed(4));
      const available = toQuantityUnits(listing.availableQuantity.toFixed(4));
      if (quantity > available)
        this.conflict(
          PHASE_FIVE_ERROR_CODES.INSUFFICIENT_AVAILABLE_QUANTITY,
          'Listing availability changed before acceptance',
        );
      const reservationId = randomUUID();
      contractId = randomUUID();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await transaction.offer.update({
        where: { id: offer.id },
        data: {
          status: 'ACCEPTED',
          respondedByUserId: principal.subjectId,
          respondedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const remaining = available - quantity;
      await transaction.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          availableQuantity: formatQuantity(remaining),
          status: remaining === 0n ? 'FULLY_RESERVED' : 'PARTIALLY_RESERVED',
          version: { increment: 1 },
          updatedByUserId: principal.subjectId,
        },
      });
      await transaction.lotReservation.create({
        data: {
          id: reservationId,
          reservationNumber: `RSV-${Date.now()}-${reservationId.slice(0, 6)}`,
          lotId: listing.lotId,
          listingId: listing.id,
          offerId: offer.id,
          sellerOrganizationId,
          buyerOrganizationId: offer.buyerOrganizationId,
          quantity: offer.quantity,
          expiresAt,
        },
      });
      const latestInspection = await transaction.qualityInspection.findFirst({
        where: { lotId: listing.lotId, status: 'PASSED' },
        include: { measurements: true },
        orderBy: { inspectedAt: 'desc' },
      });
      await transaction.salesContract.create({
        data: {
          id: contractId,
          publicId: `ctr1_${randomUUID().replaceAll('-', '')}`,
          contractNumber: `CTR-${Date.now()}-${contractId.slice(0, 6)}`,
          listingId: listing.id,
          offerId: offer.id,
          reservationId,
          sellerOrganizationId,
          buyerOrganizationId: offer.buyerOrganizationId,
          lotId: listing.lotId,
          quantity: offer.quantity,
          unitPriceMinor: offer.unitPriceMinor,
          currency: offer.currency,
          totalAmountMinor: offer.totalAmountMinor,
          deliveryTerm: offer.deliveryTerm,
          expectedDeliveryDate: offer.proposedDeliveryDate,
          paymentTerms:
            'Commercial terms recorded only; payment and settlement are outside Phase 5.',
          qualityTerms: latestInspection
            ? { sourceInspectionId: latestInspection.id, status: latestInspection.status }
            : {},
        },
      });
      await transaction.cooperativeLot.update({
        where: { id: listing.lotId },
        data: { saleHoldAt: new Date(), saleHoldReason: `Reserved by ${reservationId}` },
      });
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'OFFER_ACCEPTED',
        'Offer',
        offer.id,
        { reservationId, contractId, buyerOrganizationId: offer.buyerOrganizationId },
      );
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'LOT_RESERVED',
        'LotReservation',
        reservationId,
        { offerId: offer.id, contractId, lotId: listing.lotId },
      );
      await this.record(
        transaction,
        sellerOrganizationId,
        principal.subjectId,
        requestId,
        'SALES_CONTRACT_CREATED',
        'SalesContract',
        contractId,
        { reservationId, buyerOrganizationId: offer.buyerOrganizationId },
      );
    });
    return this.getContract(sellerOrganizationId, contractId);
  }

  async rejectOffer(
    organizationId: string,
    offerId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionOffer(
      organizationId,
      offerId,
      input,
      principal,
      requestId,
      'REJECTED',
      false,
    );
  }

  async withdrawOffer(
    organizationId: string,
    offerId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    return this.transitionOffer(
      organizationId,
      offerId,
      input,
      principal,
      requestId,
      'WITHDRAWN',
      true,
    );
  }

  async getOffer(organizationId: string, offerId: string) {
    const offer = await this.database.client.offer.findFirst({
      where: {
        id: offerId,
        OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
      },
      include: { listing: true, sellerOrganization: true, buyerOrganization: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return this.serializeOffer(offer);
  }

  async getContract(organizationId: string, contractId: string) {
    const contract = await this.database.client.salesContract.findFirst({
      where: {
        id: contractId,
        OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
      },
      include: {
        listing: true,
        reservation: true,
        sellerOrganization: true,
        buyerOrganization: true,
        amendments: true,
        order: true,
      },
    });
    if (!contract) throw new NotFoundException('Sales contract not found');
    return this.serializeMoney(contract);
  }

  private async organization(id: string) {
    const organization = await this.database.client.organization.findFirst({
      where: { id, status: 'ACTIVE', deletedAt: null },
    });
    if (!organization) throw new NotFoundException('Active organization not found');
    return organization;
  }

  private async assertCanView(
    organizationId: string,
    listing: Prisma.MarketplaceListingGetPayload<{ include: typeof listingInclude }>,
  ) {
    if (listing.sellerOrganizationId === organizationId) return;
    const organization = await this.organization(organizationId);
    if (
      organization.type !== 'BUYER' ||
      !['PUBLISHED', 'PARTIALLY_RESERVED'].includes(listing.status)
    )
      throw new ForbiddenException('Listing is not visible to this organization');
    this.assertListingVisibility(organizationId, listing);
  }

  private assertListingVisibility(
    buyerOrganizationId: string,
    listing: {
      visibility: string;
      invitations: Array<{ buyerOrganizationId: string; status: string; expiresAt: Date | null }>;
    },
  ) {
    if (listing.visibility === 'PUBLIC_BUYERS') return;
    const invitation = listing.invitations.find(
      (item) =>
        item.buyerOrganizationId === buyerOrganizationId &&
        item.status === 'INVITED' &&
        (!item.expiresAt || item.expiresAt > new Date()),
    );
    if (!invitation)
      this.conflict(
        PHASE_FIVE_ERROR_CODES.LISTING_VISIBILITY_DENIED,
        'Listing requires an active buyer invitation',
      );
  }

  private async recordListingVersion(
    listingId: string,
    userId: string,
    transaction: Prisma.TransactionClient,
  ) {
    const listing = await transaction.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    await transaction.marketplaceListingVersion.create({
      data: {
        listingId,
        version: listing.version,
        status: listing.status,
        title: listing.title,
        description: listing.description,
        listedQuantity: listing.listedQuantity,
        quantityUnit: listing.quantityUnit,
        currency: listing.currency,
        pricingMethod: listing.pricingMethod,
        askingUnitPriceMinor: listing.askingUnitPriceMinor,
        minimumOfferQuantity: listing.minimumOfferQuantity,
        allowPartialQuantity: listing.allowPartialQuantity,
        visibility: listing.visibility,
        expiresAt: listing.expiresAt,
        recordedByUserId: userId,
      },
    });
  }

  private async transitionListing(
    organizationId: string,
    listingId: string,
    version: number,
    fromStatuses: Array<'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'PARTIALLY_RESERVED'>,
    status: 'PAUSED' | 'CLOSED' | 'CANCELLED',
    principal: AuthenticatedPrincipal,
    requestId: string,
    action: string,
    reason?: string,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      const result = await transaction.marketplaceListing.updateMany({
        where: {
          id: listingId,
          sellerOrganizationId: organizationId,
          version,
          status: { in: fromStatuses },
        },
        data: {
          status,
          updatedByUserId: principal.subjectId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) this.versionConflict();
      if (status === 'CLOSED' || status === 'CANCELLED') {
        await transaction.offer.updateMany({
          where: { listingId, status: 'SUBMITTED' },
          data: {
            status: 'REJECTED',
            respondedByUserId: principal.subjectId,
            respondedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      await this.recordListingVersion(listingId, principal.subjectId, transaction);
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        action,
        'MarketplaceListing',
        listingId,
        reason ? { reason } : {},
      );
    });
    return this.get(organizationId, listingId);
  }

  private async transitionOffer(
    organizationId: string,
    offerId: string,
    input: ReasonActionInput,
    principal: AuthenticatedPrincipal,
    requestId: string,
    status: 'REJECTED' | 'WITHDRAWN',
    submittedPartyActs: boolean,
  ) {
    await this.database.client.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId}::uuid FOR UPDATE`;
      const offer = await transaction.offer.findFirst({
        where: {
          id: offerId,
          OR: [{ sellerOrganizationId: organizationId }, { buyerOrganizationId: organizationId }],
        },
      });
      if (!offer) throw new NotFoundException('Offer not found');
      const submitter = await transaction.organizationMembership.findFirst({
        where: {
          userId: offer.submittedByUserId,
          organizationId: { in: [offer.sellerOrganizationId, offer.buyerOrganizationId] },
          status: 'ACTIVE',
        },
      });
      const callerIsSubmitter = submitter?.organizationId === organizationId;
      if (callerIsSubmitter !== submittedPartyActs)
        throw new ForbiddenException('Only the appropriate offer party may perform this action');
      if (offer.status !== 'SUBMITTED' || offer.version !== input.version)
        this.offerNotActionable();
      await transaction.offer.update({
        where: { id: offer.id },
        data: {
          status,
          respondedByUserId: principal.subjectId,
          respondedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.record(
        transaction,
        organizationId,
        principal.subjectId,
        requestId,
        `OFFER_${status}`,
        'Offer',
        offer.id,
        { reason: input.reason },
      );
    });
    return this.getOffer(organizationId, offerId);
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

  private totalMinor(quantityUnits: bigint, unitPriceMinor: bigint) {
    return (quantityUnits * unitPriceMinor + 5_000n) / 10_000n;
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
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined;
        const errorMessage = error instanceof Error ? error.message : '';
        const retryable =
          errorCode === 'P2034' ||
          /could not serialize|serialization failure|deadlock detected/i.test(errorMessage);
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new Error('Serializable transaction retry loop exhausted');
  }

  private serializeListing<
    T extends {
      listedQuantity: Prisma.Decimal;
      availableQuantity: Prisma.Decimal;
      askingUnitPriceMinor: bigint | null;
      minimumOfferUnitPriceMinor: bigint | null;
      minimumOfferQuantity: Prisma.Decimal | null;
    },
  >(listing: T) {
    return {
      ...listing,
      listedQuantity: listing.listedQuantity.toFixed(4),
      availableQuantity: listing.availableQuantity.toFixed(4),
      askingUnitPriceMinor: listing.askingUnitPriceMinor?.toString() ?? null,
      minimumOfferUnitPriceMinor: listing.minimumOfferUnitPriceMinor?.toString() ?? null,
      minimumOfferQuantity: listing.minimumOfferQuantity?.toFixed(4) ?? null,
    };
  }

  private serializeOffer<
    T extends { quantity: Prisma.Decimal; unitPriceMinor: bigint; totalAmountMinor: bigint },
  >(offer: T) {
    return {
      ...offer,
      quantity: offer.quantity.toFixed(4),
      unitPriceMinor: offer.unitPriceMinor.toString(),
      totalAmountMinor: offer.totalAmountMinor.toString(),
    };
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

  private offerNotActionable(): never {
    this.conflict(
      PHASE_FIVE_ERROR_CODES.OFFER_NOT_ACTIONABLE,
      'Offer is no longer actionable or its version changed',
    );
  }

  private versionConflict(): never {
    this.conflict(PHASE_FIVE_ERROR_CODES.VERSION_CONFLICT, 'Resource changed or is not editable');
  }

  private conflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }
}
