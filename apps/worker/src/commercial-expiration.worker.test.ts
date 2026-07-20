import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommercialExpirationWorker } from './commercial-expiration.worker.js';
import type { WorkerEnvironment } from './environment.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const cooperativeId = '00000000-0000-4000-8000-000000000201';
const buyerId = '00000000-0000-4000-8000-000000000202';
const cooperativeAdminId = '00000000-0000-4000-8000-000000000102';
const commodityId = '00000000-0000-4000-8000-000000000801';
const parchmentFormId = '00000000-0000-4000-8000-000000000813';

describe.sequential('Commercial expiration worker', () => {
  const config = new ConfigService<WorkerEnvironment, true>({
    NODE_ENV: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    LOG_LEVEL: 'info',
    DATABASE_URL: process.env.DATABASE_URL!,
    HEDERA_PROVIDER: 'mock',
    HEDERA_NETWORK: 'local',
    HEDERA_SUBMISSION_ENABLED: false,
    HEDERA_CONFIRMATION_ENABLED: false,
    HEDERA_MAX_TRANSACTION_FEE_USD: 1,
    HEDERA_CONFIRMATION_TIMEOUT_SECONDS: 120,
    HEDERA_CONFIRMATION_POLL_INTERVAL_SECONDS: 1,
    HEDERA_REFERENCE_SECRET: 'test-only-hedera-reference-secret-at-least-32-bytes',
    HEDERA_REFERENCE_SECRET_VERSION: 'v1',
  });
  const database = new WorkerDatabaseService(config);
  const worker = new CommercialExpirationWorker(database);
  const lotId = randomUUID();
  const listingId = randomUUID();
  const acceptedOfferId = randomUUID();
  const expiredOfferId = randomUUID();
  const reservationId = randomUUID();
  const contractId = randomUUID();
  const invitationId = randomUUID();
  const shareId = randomUUID();

  beforeAll(async () => database.onModuleInit());

  afterAll(async () => {
    await database.client.outboxEvent.deleteMany({ where: { aggregateId: reservationId } });
    await database.client.auditEvent.deleteMany({ where: { entityId: reservationId } });
    await database.client.traceabilityShare.deleteMany({ where: { id: shareId } });
    await database.client.salesContract.deleteMany({ where: { id: contractId } });
    await database.client.lotReservation.deleteMany({ where: { id: reservationId } });
    await database.client.listingInvitation.deleteMany({ where: { id: invitationId } });
    await database.client.offer.deleteMany({
      where: { id: { in: [acceptedOfferId, expiredOfferId] } },
    });
    await database.client.marketplaceListing.deleteMany({ where: { id: listingId } });
    await database.client.cooperativeLot.deleteMany({ where: { id: lotId } });
    await database.onModuleDestroy();
  });

  it('expires commercial records and releases each reservation exactly once', async () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const expiredAt = new Date(now.getTime() - 60_000);
    await database.client.$transaction(async (transaction) => {
      await transaction.cooperativeLot.create({
        data: {
          id: lotId,
          publicId: `lot1_worker_${lotId.replaceAll('-', '')}`,
          lotNumber: `LOT-WORKER-${lotId.slice(0, 8)}`,
          organizationId: cooperativeId,
          commodityId,
          commodityFormId: parchmentFormId,
          status: 'APPROVED',
          quantity: '5.0000',
          saleHoldAt: expiredAt,
          saleHoldReason: `Reserved by ${reservationId}`,
          createdByUserId: cooperativeAdminId,
        },
      });
      await transaction.marketplaceListing.create({
        data: {
          id: listingId,
          publicId: `lst1_worker_${listingId.replaceAll('-', '')}`,
          listingNumber: `LST-WORKER-${listingId.slice(0, 8)}`,
          sellerOrganizationId: cooperativeId,
          lotId,
          status: 'FULLY_RESERVED',
          title: 'Worker expiration fixture',
          listedQuantity: '5.0000',
          availableQuantity: '0.0000',
          currency: 'UGX',
          pricingMethod: 'NEGOTIABLE',
          allowPartialQuantity: true,
          visibility: 'PUBLIC_BUYERS',
          expiresAt: expiredAt,
          createdByUserId: cooperativeAdminId,
        },
      });
      await transaction.offer.createMany({
        data: [
          {
            id: acceptedOfferId,
            publicId: `ofr1_worker_accepted_${acceptedOfferId.replaceAll('-', '')}`,
            offerNumber: `OFF-WORKER-A-${acceptedOfferId.slice(0, 8)}`,
            listingId,
            sellerOrganizationId: cooperativeId,
            buyerOrganizationId: buyerId,
            status: 'ACCEPTED',
            quantity: '5.0000',
            unitPriceMinor: 1_000_000n,
            currency: 'UGX',
            totalAmountMinor: 5_000_000n,
            deliveryTerm: 'Buyer pickup',
            validUntil: expiredAt,
            submittedByUserId: cooperativeAdminId,
          },
          {
            id: expiredOfferId,
            publicId: `ofr1_worker_expired_${expiredOfferId.replaceAll('-', '')}`,
            offerNumber: `OFF-WORKER-E-${expiredOfferId.slice(0, 8)}`,
            listingId,
            sellerOrganizationId: cooperativeId,
            buyerOrganizationId: buyerId,
            status: 'SUBMITTED',
            quantity: '1.0000',
            unitPriceMinor: 1_000_000n,
            currency: 'UGX',
            totalAmountMinor: 1_000_000n,
            deliveryTerm: 'Buyer pickup',
            validUntil: expiredAt,
            submittedByUserId: cooperativeAdminId,
          },
        ],
      });
      await transaction.lotReservation.create({
        data: {
          id: reservationId,
          reservationNumber: `RSV-WORKER-${reservationId.slice(0, 8)}`,
          lotId,
          listingId,
          offerId: acceptedOfferId,
          sellerOrganizationId: cooperativeId,
          buyerOrganizationId: buyerId,
          quantity: '5.0000',
          status: 'ACTIVE',
          expiresAt: expiredAt,
        },
      });
      await transaction.salesContract.create({
        data: {
          id: contractId,
          publicId: `ctr1_worker_${contractId.replaceAll('-', '')}`,
          contractNumber: `CTR-WORKER-${contractId.slice(0, 8)}`,
          listingId,
          offerId: acceptedOfferId,
          reservationId,
          sellerOrganizationId: cooperativeId,
          buyerOrganizationId: buyerId,
          lotId,
          status: 'PENDING_SELLER_APPROVAL',
          quantity: '5.0000',
          unitPriceMinor: 1_000_000n,
          currency: 'UGX',
          totalAmountMinor: 5_000_000n,
          deliveryTerm: 'Buyer pickup',
          paymentTerms: 'Settlement is outside Phase 5.',
          qualityTerms: {},
        },
      });
      await transaction.listingInvitation.create({
        data: {
          id: invitationId,
          listingId,
          buyerOrganizationId: buyerId,
          status: 'INVITED',
          invitedByUserId: cooperativeAdminId,
          expiresAt: expiredAt,
        },
      });
      await transaction.traceabilityShare.create({
        data: {
          id: shareId,
          publicId: `shr1_worker_${shareId.replaceAll('-', '')}`,
          sellerOrganizationId: cooperativeId,
          buyerOrganizationId: buyerId,
          listingId,
          contractId,
          lotId,
          status: 'ACTIVE',
          scopes: ['LOT_SUMMARY'],
          expiresAt: expiredAt,
          createdByUserId: cooperativeAdminId,
        },
      });
    });

    await expect(worker.runOnce(now)).resolves.toEqual({ expired: 3, released: 1 });
    await expect(worker.runOnce(now)).resolves.toEqual({ expired: 0, released: 0 });

    await expect(
      database.client.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(
      database.client.offer.findUniqueOrThrow({ where: { id: expiredOfferId } }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(
      database.client.lotReservation.findUniqueOrThrow({ where: { id: reservationId } }),
    ).resolves.toMatchObject({
      status: 'EXPIRED',
      releaseReason: 'Reservation expired before contract activation',
    });
    await expect(
      database.client.salesContract.findUniqueOrThrow({ where: { id: contractId } }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(
      database.client.traceabilityShare.findUniqueOrThrow({ where: { id: shareId } }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(
      database.client.cooperativeLot.findUniqueOrThrow({ where: { id: lotId } }),
    ).resolves.toMatchObject({ saleHoldAt: null, saleHoldReason: null });
    await expect(
      database.client.auditEvent.count({
        where: { entityId: reservationId, action: 'LOT_RESERVATION_EXPIRED' },
      }),
    ).resolves.toBe(1);
    await expect(
      database.client.outboxEvent.count({
        where: { aggregateId: reservationId, eventType: 'LOT_RESERVATION_EXPIRED' },
      }),
    ).resolves.toBe(1);
  });
});
