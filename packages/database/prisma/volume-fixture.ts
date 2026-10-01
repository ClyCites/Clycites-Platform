import { createDatabaseClient } from '../src/index.js';

/**
 * Explicit, opt-in capture volume fixture. This is never part of `db:seed`.
 * It builds one cooperative season on top of the standard seed:
 * 800 farmers, 4 collection points, 90 business days, and 40k-70k deliveries.
 */

const database = createDatabaseClient();

const organizationId = '00000000-0000-4000-8000-000000000201';
const agentUserId = '00000000-0000-4000-8000-000000000103';
const deviceId = '00000000-0000-4000-8000-000000000901';
const commodityId = '00000000-0000-4000-8000-000000000801';
const commodityFormId = '00000000-0000-4000-8000-000000000811';

const FARMERS = 800;
const COLLECTION_POINTS = 4;
const DAYS = 90;
const DELIVERIES_PER_DAY = 600;

/** Distinct tag so repeated runs create disjoint data instead of colliding. */
const tag = process.env.VOLUME_TAG ?? 'A';
if (!/^[A-Z0-9]{1,6}$/.test(tag)) {
  throw new Error(`VOLUME_TAG must be 1-6 uppercase alphanumeric characters, received "${tag}"`);
}

const parseCount = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received "${value}"`);
  }
  return parsed;
};

async function main(): Promise<void> {
  const deliveriesPerDay = parseCount(process.env.VOLUME_DELIVERIES_PER_DAY, DELIVERIES_PER_DAY);
  const days = parseCount(process.env.VOLUME_DAYS, DAYS);
  const total = deliveriesPerDay * days;
  if (total < 40_000 || total > 70_000) {
    throw new Error(`Configured volume ${total} is outside the required 40,000-70,000 deliveries`);
  }

  const started = Date.now();
  await database.$executeRawUnsafe(`
    INSERT INTO "CollectionPoint" ("id", "organizationId", "name", "code", "status", "district", "latitude", "longitude", "timezone", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '${organizationId}', 'Volume point ' || n, 'VOL${tag}-' || n, 'ACTIVE', 'Kisoro',
           -1.285000 + (n / 1000.0), 29.684000 + (n / 1000.0), 'Africa/Kampala', now(), now()
    FROM generate_series(1, ${COLLECTION_POINTS}) AS n
    ON CONFLICT ("organizationId", "code") DO NOTHING;
  `);

  await database.$executeRawUnsafe(`
    INSERT INTO "Farmer" ("id", "farmerNumber", "firstName", "lastName", "district", "status", "registeredByUserId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), 'VOL${tag}-F-' || n, 'Volume', 'Farmer ' || n, 'Kisoro', 'ACTIVE', '${agentUserId}', now(), now()
    FROM generate_series(1, ${FARMERS}) AS n
    ON CONFLICT ("farmerNumber") DO NOTHING;
  `);

  await database.$executeRawUnsafe(`
    INSERT INTO "FarmerOrganizationMembership" ("id", "farmerId", "organizationId", "membershipNumber", "status", "joinedAt", "registeredAtCollectionPointId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), f."id", '${organizationId}', 'VOL${tag}-M-' || f."farmerNumber", 'ACTIVE', now(),
           (SELECT cp."id" FROM "CollectionPoint" cp WHERE cp."organizationId" = '${organizationId}' AND cp."code" LIKE 'VOL${tag}-%' ORDER BY cp."code" OFFSET (abs(hashtext(f."farmerNumber")) % ${COLLECTION_POINTS}) LIMIT 1),
           now(), now()
    FROM "Farmer" f
    WHERE f."farmerNumber" LIKE 'VOL${tag}-F-%'
    ON CONFLICT ("farmerId", "organizationId") DO NOTHING;
  `);

  await database.$executeRawUnsafe(`
    INSERT INTO "CollectionSession" ("id", "organizationId", "collectionPointId", "agentUserId", "deviceId", "businessDate", "status", "openedAt", "closedAt", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), '${organizationId}', cp."id", '${agentUserId}', '${deviceId}',
           (current_date - d)::date, 'CLOSED', now() - (d || ' days')::interval, now() - (d || ' days')::interval, now(), now()
    FROM "CollectionPoint" cp
    CROSS JOIN generate_series(1, ${days}) AS d
    WHERE cp."organizationId" = '${organizationId}' AND cp."code" LIKE 'VOL${tag}-%';
  `);

  await database.$executeRawUnsafe(`
    INSERT INTO "Delivery" (
      "id", "publicId", "deliveryNumber", "organizationId", "collectionPointId", "collectionSessionId",
      "farmerId", "farmerOrganizationMembershipId", "commodityId", "commodityFormId", "status", "source",
      "clientCreatedAt", "serverReceivedAt", "createdByUserId", "acceptedAt", "acceptedByUserId",
      "confirmedAt", "confirmationMethod", "createdAt", "updatedAt"
    )
    SELECT delivery."id", 'vol${tag}_' || delivery."id", 'VOL${tag}-' || to_char(delivery."businessDate", 'YYYYMMDD') || '-' || delivery."seq",
           '${organizationId}', delivery."collectionPointId", delivery."sessionId", delivery."farmerId", delivery."membershipId",
           '${commodityId}', '${commodityFormId}', 'ACCEPTED', 'ONLINE',
           delivery."occurredAt", delivery."occurredAt", '${agentUserId}', delivery."occurredAt", '${agentUserId}',
           delivery."occurredAt", 'VERBAL_WITNESSED', now(), now()
    FROM (
      SELECT gen_random_uuid() AS "id",
             s."id" AS "sessionId",
             s."collectionPointId",
             s."businessDate",
             s."openedAt" + (n || ' seconds')::interval AS "occurredAt",
             row_number() OVER () AS "seq",
             m."farmerId",
             m."id" AS "membershipId"
      FROM "CollectionSession" s
      CROSS JOIN generate_series(1, ${Math.ceil(deliveriesPerDay / COLLECTION_POINTS)}) AS n
      JOIN LATERAL (
        SELECT fm."id", fm."farmerId"
        FROM "FarmerOrganizationMembership" fm
        WHERE fm."registeredAtCollectionPointId" = s."collectionPointId"
        ORDER BY md5(s."id"::text || n::text)
        LIMIT 1
      ) m ON true
      WHERE s."organizationId" = '${organizationId}'
        AND s."collectionPointId" IN (
          SELECT "id" FROM "CollectionPoint" WHERE "organizationId" = '${organizationId}' AND "code" LIKE 'VOL${tag}-%'
        )
    ) AS delivery;
  `);

  await database.$executeRawUnsafe(`
    INSERT INTO "DeliveryMeasurement" ("id", "deliveryId", "measurementType", "netQuantity", "unit", "captureMethod", "instrumentFlagged", "instrumentFlagReason", "capturedByUserId", "capturedAt", "version", "createdAt")
    SELECT gen_random_uuid(), d."id", 'WEIGHT', 10 + (abs(hashtext(d."id"::text)) % 5000) / 100.0, 'KG', 'MANUAL', true, 'INSTRUMENT_NOT_RECORDED', '${agentUserId}', d."clientCreatedAt", 1, now()
    FROM "Delivery" d
    WHERE d."publicId" LIKE 'vol${tag}\_%'
      AND NOT EXISTS (SELECT 1 FROM "DeliveryMeasurement" m WHERE m."deliveryId" = d."id");
  `);

  await database.$executeRawUnsafe(`
    INSERT INTO "DeliveryPricing" ("id", "deliveryId", "unitPriceMinor", "currency", "quantity", "quantityUnit", "grossAmountMinor", "adjustmentAmountMinor", "netAmountMinor", "priceSource", "createdAt")
    SELECT gen_random_uuid(), m."deliveryId", 3000, 'UGX', m."netQuantity", 'KG',
           round(m."netQuantity" * 3000)::bigint, 0, round(m."netQuantity" * 3000)::bigint, 'COLLECTION_POINT', now()
    FROM "DeliveryMeasurement" m
    JOIN "Delivery" d ON d."id" = m."deliveryId"
    WHERE d."publicId" LIKE 'vol${tag}\_%'
      AND NOT EXISTS (SELECT 1 FROM "DeliveryPricing" p WHERE p."deliveryId" = m."deliveryId");
  `);

  await database.$executeRawUnsafe('ANALYZE "Delivery";');
  await database.$executeRawUnsafe('ANALYZE "DeliveryMeasurement";');
  await database.$executeRawUnsafe('ANALYZE "DeliveryPricing";');

  const deliveries = await database.delivery.count({
    where: { publicId: { startsWith: `vol${tag}_` } },
  });
  console.log(
    JSON.stringify(
      {
        farmers: FARMERS,
        collectionPoints: COLLECTION_POINTS,
        days,
        deliveries,
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
      },
      null,
      2,
    ),
  );
  if (deliveries < 40_000 || deliveries > 70_000) {
    throw new Error(`Volume fixture produced ${deliveries} deliveries, outside 40,000-70,000`);
  }
}

try {
  await main();
} finally {
  await database.$disconnect();
}
