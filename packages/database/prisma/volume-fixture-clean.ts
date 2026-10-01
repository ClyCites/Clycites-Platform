import { createDatabaseClient } from '../src/index.js';

/** Removes rows produced by `db:volume-fixture` for a given VOLUME_TAG. */

const database = createDatabaseClient();
const tag = process.env.VOLUME_TAG ?? 'A';
if (!/^[A-Z0-9]{1,6}$/.test(tag) && tag !== 'UNTAGGED') {
  throw new Error(`VOLUME_TAG must be 1-6 uppercase alphanumeric characters, received "${tag}"`);
}

const deliveryPrefix = tag === 'UNTAGGED' ? 'vol\\_%' : `vol${tag}\\_%`;
const codePrefix = tag === 'UNTAGGED' ? 'VOL-%' : `VOL${tag}-%`;
const farmerPrefix = tag === 'UNTAGGED' ? 'VOL-F-%' : `VOL${tag}-F-%`;

try {
  await database.$executeRawUnsafe(
    `DELETE FROM "DeliveryPricing" p USING "Delivery" d WHERE p."deliveryId" = d."id" AND d."publicId" LIKE '${deliveryPrefix}'`,
  );
  await database.$executeRawUnsafe(
    `DELETE FROM "DeliveryMeasurement" m USING "Delivery" d WHERE m."deliveryId" = d."id" AND d."publicId" LIKE '${deliveryPrefix}'`,
  );
  await database.$executeRawUnsafe(`DELETE FROM "Delivery" WHERE "publicId" LIKE '${deliveryPrefix}'`);
  await database.$executeRawUnsafe(
    `DELETE FROM "CollectionSession" s USING "CollectionPoint" c WHERE s."collectionPointId" = c."id" AND c."code" LIKE '${codePrefix}'`,
  );
  await database.$executeRawUnsafe(
    `DELETE FROM "FarmerOrganizationMembership" fm USING "Farmer" f WHERE fm."farmerId" = f."id" AND f."farmerNumber" LIKE '${farmerPrefix}'`,
  );
  await database.$executeRawUnsafe(`DELETE FROM "Farmer" WHERE "farmerNumber" LIKE '${farmerPrefix}'`);
  await database.$executeRawUnsafe(`DELETE FROM "CollectionPoint" WHERE "code" LIKE '${codePrefix}'`);
  console.log(`Removed volume fixture data for tag ${tag}`);
} finally {
  await database.$disconnect();
}
