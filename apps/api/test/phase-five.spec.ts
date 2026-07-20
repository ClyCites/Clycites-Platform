import 'reflect-metadata';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const buyerId = '00000000-0000-4000-8000-000000000202';
const commodityId = '00000000-0000-4000-8000-000000000801';
const parchmentFormId = '00000000-0000-4000-8000-000000000813';
const cooperativeAdminId = '00000000-0000-4000-8000-000000000102';
const password = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
const database = createDatabaseClient();

describe.sequential('Phase 5 marketplace API', () => {
  let app: INestApplication;
  let sellerToken: string;
  let buyerToken: string;
  let listingId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    sellerToken = await login('cooperative.admin@clycites.local');
    buyerToken = await login('buyer@clycites.local');

    const lotId = crypto.randomUUID();
    await database.cooperativeLot.create({
      data: {
        id: lotId,
        publicId: `lot1_phase5_${lotId.replaceAll('-', '')}`,
        lotNumber: `LOT-P5-${lotId.slice(0, 8)}`,
        organizationId: cooperativeId,
        commodityId,
        commodityFormId: parchmentFormId,
        status: 'APPROVED',
        quantity: '10.0000',
        createdByUserId: cooperativeAdminId,
      },
    });
    await database.qualityInspection.create({
      data: {
        organizationId: cooperativeId,
        lotId,
        status: 'PASSED',
        inspectorUserId: cooperativeAdminId,
        inspectedAt: new Date(),
      },
    });
    const listing = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({
        lotId,
        listingNumber: `LST-P5-${lotId.slice(0, 8)}`,
        title: 'Concurrency test parchment',
        listedQuantity: '10.0000',
        currency: 'UGX',
        pricingMethod: 'NEGOTIABLE',
        allowPartialQuantity: true,
        visibility: 'PUBLIC_BUYERS',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    listingId = listing.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings/${listingId}/publish`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ version: 1 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('allows buyer discovery without exposing nonmarketplace records', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${buyerId}/marketplace/listings`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(200);
    const listings = response.body.data as Array<{ id: string }>;
    expect(listings.some((listing) => listing.id === listingId)).toBe(true);
    expect(JSON.stringify(response.body.data)).not.toContain('passwordHash');
  });

  it('rejects floating-point money before transaction processing', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/marketplace/listings/${listingId}/offers`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({
        quantity: '1.0000',
        unitPriceMinor: '1200.50',
        currency: 'UGX',
        deliveryTerm: 'Buyer pickup',
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(422);
  });

  it('allows only one competing offer to reserve scarce listing quantity', async () => {
    const offerIds = await Promise.all(
      ['7.0000', '7.0000'].map(async (quantity) => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/organizations/${buyerId}/marketplace/listings/${listingId}/offers`)
          .set('authorization', `Bearer ${buyerToken}`)
          .send({
            quantity,
            unitPriceMinor: '1200000',
            currency: 'UGX',
            deliveryTerm: 'Buyer pickup',
            validUntil: new Date(Date.now() + 86_400_000).toISOString(),
          })
          .expect(201);
        return response.body.data.id as string;
      }),
    );
    const results = await Promise.all(
      offerIds.map((offerId) =>
        request(app.getHttpServer())
          .post(`/api/v1/organizations/${cooperativeId}/marketplace/offers/${offerId}/accept`)
          .set('authorization', `Bearer ${sellerToken}`)
          .send({ version: 1 }),
      ),
    );
    expect(
      results.map((result) => result.status).sort(),
      JSON.stringify(
        results.map((result) => ({ status: result.status, body: result.body as unknown })),
      ),
    ).toEqual([201, 409]);
    const listing = await database.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      include: { reservations: true, contracts: true },
    });
    expect(listing.availableQuantity.toFixed(4)).toBe('3.0000');
    expect(listing.reservations).toHaveLength(1);
    expect(listing.contracts).toHaveLength(1);
  });

  it('supports versioned listing controls and party-scoped offer termination', async () => {
    const paused = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings/${listingId}/pause`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ version: 3 })
      .expect(201);
    expect(paused.body.data.status).toBe('PAUSED');

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${buyerId}/marketplace/listings`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(200);
    expect(
      (hidden.body.data as Array<{ id: string }>).some((listing) => listing.id === listingId),
    ).toBe(false);

    const resumed = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings/${listingId}/publish`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ version: 4 })
      .expect(201);
    expect(resumed.body.data.status).toBe('PARTIALLY_RESERVED');

    const submit = async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${buyerId}/marketplace/listings/${listingId}/offers`)
        .set('authorization', `Bearer ${buyerToken}`)
        .send({
          quantity: '1.0000',
          unitPriceMinor: '1200000',
          currency: 'UGX',
          deliveryTerm: 'Buyer pickup',
          validUntil: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      return response.body.data.id as string;
    };

    const withdrawnOfferId = await submit();
    const withdrawn = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/marketplace/offers/${withdrawnOfferId}/withdraw`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ version: 1, reason: 'Delivery timing changed' })
      .expect(201);
    expect(withdrawn.body.data.status).toBe('WITHDRAWN');

    const rejectedOfferId = await submit();
    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/offers/${rejectedOfferId}/reject`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ version: 1, reason: 'Price does not meet current terms' })
      .expect(201);
    expect(rejected.body.data.status).toBe('REJECTED');

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/marketplace/listings/${listingId}/close`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ version: 5, reason: 'Remaining quantity retained by cooperative' })
      .expect(201);
    expect(closed.body.data.status).toBe('CLOSED');
  });

  it('returns only allowlisted private traceability fields to the named buyer', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${buyerId}/commerce/traceability-shares/shr1_local_buyer_2026`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(200);
    const serialized = JSON.stringify(response.body.data);
    expect(serialized).toContain('LOT-KIS-2026-001');
    expect(serialized).not.toContain('farmerId');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('village');
    expect(serialized).not.toContain('00000000-0000-4000-8000-000000000401');
  });

  it('terminates commercial commitments and revokes private sharing', async () => {
    const pendingContract = await database.salesContract.findFirstOrThrow({
      where: { listingId, status: 'PENDING_SELLER_APPROVAL' },
      include: { reservation: true },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/contracts/${pendingContract.id}/cancel`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ version: 1, reason: 'Buyer procurement requirement changed' })
      .expect(201);
    const cancelledReservation = await database.lotReservation.findUniqueOrThrow({
      where: { id: pendingContract.reservationId },
    });
    const closedListing = await database.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    expect(cancelledReservation.status).toBe('CANCELLED');
    expect(closedListing.availableQuantity.toFixed(4)).toBe('10.0000');
    expect(closedListing.status).toBe('CLOSED');

    const seededContract = await database.salesContract.findUniqueOrThrow({
      where: { publicId: 'ctr1_local_active_2026' },
    });
    const rejectedAmendment = await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/commerce/contracts/${seededContract.id}/amendments`,
      )
      .set('authorization', `Bearer ${sellerToken}`)
      .send({
        reason: 'Move delivery window',
        proposedChanges: { deliveryTerm: 'Revised delivery window' },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${buyerId}/commerce/amendments/${rejectedAmendment.body.data.id as string}/reject`,
      )
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ reason: 'Original delivery window is required' })
      .expect(201);

    const withdrawnAmendment = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${buyerId}/commerce/contracts/${seededContract.id}/amendments`)
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ reason: 'Change quality note', proposedChanges: { additionalTerms: 'Buyer draft' } })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${buyerId}/commerce/amendments/${withdrawnAmendment.body.data.id as string}/withdraw`,
      )
      .set('authorization', `Bearer ${buyerToken}`)
      .send({ reason: 'Draft was submitted prematurely' })
      .expect(201);

    const seededOrder = await database.salesOrder.findUniqueOrThrow({
      where: { publicId: 'ord1_local_pending_2026' },
    });
    const cancelledOrder = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${cooperativeId}/commerce/orders/${seededOrder.id}/cancel`)
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ version: seededOrder.version, reason: 'Lot retained before dispatch' })
      .expect(201);
    expect(cancelledOrder.body.data.status).toBe('CANCELLED');
    const seededListing = await database.marketplaceListing.findUniqueOrThrow({
      where: { publicId: 'lst1_local_parchment_2026' },
    });
    expect(seededListing.availableQuantity.toFixed(4)).toBe('68.0000');

    await request(app.getHttpServer())
      .post(
        `/api/v1/organizations/${cooperativeId}/commerce/traceability-shares/shr1_local_buyer_2026/revoke`,
      )
      .set('authorization', `Bearer ${sellerToken}`)
      .send({ reason: 'Commercial relationship ended' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${buyerId}/commerce/traceability-shares/shr1_local_buyer_2026`)
      .set('authorization', `Bearer ${buyerToken}`)
      .expect(409);
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.data.accessToken as string;
  }
});
