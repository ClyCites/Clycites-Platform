import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@clycites/database';

import { WorkerDatabaseService } from './worker-database.service.js';

const RUN_INTERVAL_MS = 60_000;
const SYSTEM_REQUEST_ID = 'commercial-expiration-worker';

@Injectable()
export class CommercialExpirationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private interval?: NodeJS.Timeout;

  constructor(private readonly database: WorkerDatabaseService) {}

  onApplicationBootstrap(): void {
    void this.runOnce();
    this.interval = setInterval(() => void this.runOnce(), RUN_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async runOnce(now = new Date()): Promise<{ expired: number; released: number }> {
    const expired = await this.database.client.$transaction(async (transaction) => {
      const listings = await transaction.$executeRaw`
        UPDATE "MarketplaceListing"
        SET status = 'EXPIRED', "updatedAt" = ${now}, version = version + 1
        WHERE status IN ('PUBLISHED', 'PAUSED', 'UNDER_OFFER', 'PARTIALLY_RESERVED')
          AND "expiresAt" IS NOT NULL AND "expiresAt" <= ${now}
      `;
      const offers = await transaction.$executeRaw`
        UPDATE "Offer"
        SET status = 'EXPIRED', "updatedAt" = ${now}, version = version + 1
        WHERE status = 'SUBMITTED' AND "validUntil" <= ${now}
      `;
      const invitations = await transaction.$executeRaw`
        UPDATE "ListingInvitation"
        SET status = 'EXPIRED', "updatedAt" = ${now}
        WHERE status IN ('INVITED', 'VIEWED') AND "expiresAt" IS NOT NULL AND "expiresAt" <= ${now}
      `;
      const shares = await transaction.$executeRaw`
        UPDATE "TraceabilityShare"
        SET status = 'EXPIRED', "updatedAt" = ${now}
        WHERE status = 'ACTIVE' AND "expiresAt" <= ${now}
      `;
      return listings + offers + invitations + shares;
    });

    const due = await this.database.client.lotReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      select: { id: true },
    });

    let released = 0;
    for (const candidate of due) {
      const didRelease = await this.database.client.$transaction(
        async (transaction) => {
          const target = await transaction.lotReservation.findUnique({
            where: { id: candidate.id },
            select: {
              listingId: true,
              lotId: true,
              salesContract: { select: { id: true } },
            },
          });
          if (!target) return false;
          // Commerce locks are taken order -> contract -> listing -> lot -> reservation everywhere.
          if (target.salesContract) {
            await transaction.$queryRaw`SELECT id FROM "SalesContract" WHERE id = ${target.salesContract.id}::uuid FOR UPDATE`;
          }
          await transaction.$queryRaw`SELECT id FROM "MarketplaceListing" WHERE id = ${target.listingId}::uuid FOR UPDATE`;
          await transaction.$queryRaw`SELECT id FROM "CooperativeLot" WHERE id = ${target.lotId}::uuid FOR UPDATE`;
          await transaction.$queryRaw`SELECT id FROM "LotReservation" WHERE id = ${candidate.id}::uuid FOR UPDATE`;
          // Re-read under the lock: another transaction may have released it while we queued.
          const reservation = await transaction.lotReservation.findFirst({
            where: { id: candidate.id, status: 'ACTIVE', expiresAt: { lte: now } },
          });
          if (!reservation) return false;
          const listing = await transaction.marketplaceListing.findUniqueOrThrow({
            where: { id: reservation.listingId },
          });
          const nextAvailable = listing.availableQuantity.add(reservation.quantity);
          const canReopen = !listing.expiresAt || listing.expiresAt > now;
          await transaction.marketplaceListing.update({
            where: { id: listing.id },
            data: {
              availableQuantity: nextAvailable,
              status: canReopen ? 'PUBLISHED' : 'EXPIRED',
              version: { increment: 1 },
            },
          });
          await transaction.lotReservation.update({
            where: { id: reservation.id },
            data: {
              status: 'EXPIRED',
              releasedAt: now,
              releaseReason: 'Reservation expired before contract activation',
              version: { increment: 1 },
            },
          });
          await transaction.salesContract.updateMany({
            where: {
              reservationId: reservation.id,
              status: { in: ['DRAFT', 'PENDING_SELLER_APPROVAL', 'PENDING_BUYER_APPROVAL'] },
            },
            data: { status: 'EXPIRED', version: { increment: 1 } },
          });
          const activeReservations = await transaction.lotReservation.count({
            where: { lotId: reservation.lotId, status: { in: ['ACTIVE', 'CONTRACTED'] } },
          });
          if (activeReservations === 0)
            await transaction.cooperativeLot.update({
              where: { id: reservation.lotId },
              data: { saleHoldAt: null, saleHoldReason: null },
            });
          await transaction.auditEvent.create({
            data: {
              organizationId: reservation.sellerOrganizationId,
              actorType: 'SYSTEM',
              action: 'LOT_RESERVATION_EXPIRED',
              entityType: 'LotReservation',
              entityId: reservation.id,
              requestId: SYSTEM_REQUEST_ID,
              metadata: { listingId: reservation.listingId, lotId: reservation.lotId },
            },
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateType: 'LotReservation',
              aggregateId: reservation.id,
              eventType: 'LOT_RESERVATION_EXPIRED',
              schemaVersion: '1.0',
              payload: {
                organizationId: reservation.sellerOrganizationId,
                listingId: reservation.listingId,
                lotId: reservation.lotId,
              },
            },
          });
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (didRelease) released += 1;
    }
    return { expired, released };
  }
}
