import { createDatabaseClient } from '../src/index.js';
import { argon2id, hash } from 'argon2';

const database = createDatabaseClient();

const ids = {
  platformAdmin: '00000000-0000-4000-8000-000000000101',
  cooperativeAdmin: '00000000-0000-4000-8000-000000000102',
  collectionAgent: '00000000-0000-4000-8000-000000000103',
  financeOfficer: '00000000-0000-4000-8000-000000000104',
  cooperative: '00000000-0000-4000-8000-000000000201',
  collectionPoint: '00000000-0000-4000-8000-000000000301',
  farmers: [
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000403',
  ],
  farms: [
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000503',
  ],
  consents: [
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000603',
  ],
  qrIdentities: [
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000703',
  ],
} as const;

const localPassword = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
if (process.env.NODE_ENV === 'production' && !process.env.SEED_STAFF_PASSWORD) {
  throw new Error('SEED_STAFF_PASSWORD is required when seeding production');
}
if (!process.env.SEED_STAFF_PASSWORD) {
  console.warn('WARNING: using documented local-only Phase 1 seed credentials');
}

const passwordHash = await hash(localPassword, { type: argon2id });

try {
  await database.systemSetting.upsert({
    where: { key: 'platform.foundation.version' },
    update: { value: { version: 1 } },
    create: { key: 'platform.foundation.version', value: { version: 1 } },
  });

  const users = [
    {
      id: ids.platformAdmin,
      email: process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'platform.admin@clycites.local',
      firstName: 'Platform',
      lastName: 'Administrator',
      platformRole: 'PLATFORM_ADMIN' as const,
    },
    {
      id: ids.cooperativeAdmin,
      email: process.env.SEED_COOPERATIVE_ADMIN_EMAIL ?? 'cooperative.admin@clycites.local',
      firstName: 'Grace',
      lastName: 'Nabirye',
      platformRole: null,
    },
    {
      id: ids.collectionAgent,
      email: process.env.SEED_COLLECTION_AGENT_EMAIL ?? 'collection.agent@clycites.local',
      firstName: 'Moses',
      lastName: 'Okello',
      platformRole: null,
    },
    {
      id: ids.financeOfficer,
      email: process.env.SEED_FINANCE_OFFICER_EMAIL ?? 'finance.officer@clycites.local',
      firstName: 'Sarah',
      lastName: 'Atim',
      platformRole: null,
    },
  ];

  for (const user of users) {
    await database.user.upsert({
      where: { id: user.id },
      update: { ...user, passwordHash, status: 'ACTIVE' },
      create: { ...user, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
  }

  await database.organization.upsert({
    where: { id: ids.cooperative },
    update: { name: 'Rwenzori Coffee Cooperative', status: 'ACTIVE' },
    create: {
      id: ids.cooperative,
      name: 'Rwenzori Coffee Cooperative',
      slug: 'rwenzori-coffee-cooperative',
      type: 'COOPERATIVE',
      status: 'ACTIVE',
      registrationNumber: 'LOCAL-DEMO-001',
      district: 'Kasese',
      subCounty: 'Kisinga',
    },
  });

  const memberships = [
    { userId: ids.cooperativeAdmin, role: 'COOPERATIVE_ADMIN' as const },
    { userId: ids.collectionAgent, role: 'COLLECTION_AGENT' as const },
    { userId: ids.financeOfficer, role: 'FINANCE_OFFICER' as const },
  ];
  for (const membership of memberships) {
    await database.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: ids.cooperative,
          userId: membership.userId,
        },
      },
      update: { role: membership.role, status: 'ACTIVE' },
      create: {
        organizationId: ids.cooperative,
        userId: membership.userId,
        role: membership.role,
        status: 'ACTIVE',
        invitedByUserId: ids.platformAdmin,
        joinedAt: new Date(),
      },
    });
  }

  await database.collectionPoint.upsert({
    where: { id: ids.collectionPoint },
    update: { name: 'Kisinga Central Collection Point', status: 'ACTIVE' },
    create: {
      id: ids.collectionPoint,
      organizationId: ids.cooperative,
      name: 'Kisinga Central Collection Point',
      code: 'KIS-01',
      status: 'ACTIVE',
      district: 'Kasese',
      subCounty: 'Kisinga',
      village: 'Kisinga',
    },
  });

  const farmers = [
    {
      firstName: 'Amina',
      lastName: 'Nakato',
      number: 'UG-KSE-0001',
      membership: 'RCC-0001',
      area: '2.5000',
    },
    {
      firstName: 'Peter',
      lastName: 'Mumbere',
      number: 'UG-KSE-0002',
      membership: 'RCC-0002',
      area: '1.7500',
    },
    {
      firstName: 'Ruth',
      lastName: 'Masika',
      number: 'UG-KSE-0003',
      membership: 'RCC-0003',
      area: '3.2000',
    },
  ];

  for (const [index, farmer] of farmers.entries()) {
    const farmerId = ids.farmers[index];
    const farmId = ids.farms[index];
    const consentId = ids.consents[index];
    const qrIdentityId = ids.qrIdentities[index];
    if (!farmerId || !farmId || !consentId || !qrIdentityId)
      throw new Error('Invalid seed fixture');

    await database.farmer.upsert({
      where: { id: farmerId },
      update: { firstName: farmer.firstName, lastName: farmer.lastName, status: 'ACTIVE' },
      create: {
        id: farmerId,
        farmerNumber: farmer.number,
        firstName: farmer.firstName,
        lastName: farmer.lastName,
        district: 'Kasese',
        subCounty: 'Kisinga',
        village: 'Kisinga',
        status: 'ACTIVE',
        registeredByUserId: ids.collectionAgent,
      },
    });
    await database.farmerOrganizationMembership.upsert({
      where: { farmerId_organizationId: { farmerId, organizationId: ids.cooperative } },
      update: { membershipNumber: farmer.membership, status: 'ACTIVE' },
      create: {
        farmerId,
        organizationId: ids.cooperative,
        membershipNumber: farmer.membership,
        status: 'ACTIVE',
        joinedAt: new Date(),
        registeredAtCollectionPointId: ids.collectionPoint,
      },
    });
    await database.farm.upsert({
      where: { id: farmId },
      update: { totalArea: farmer.area, status: 'ACTIVE' },
      create: {
        id: farmId,
        farmerId,
        organizationId: ids.cooperative,
        name: `${farmer.firstName}'s Coffee Farm`,
        district: 'Kasese',
        subCounty: 'Kisinga',
        village: 'Kisinga',
        totalArea: farmer.area,
        areaUnit: 'ACRE',
        ownershipType: 'FAMILY_OWNED',
      },
    });
    await database.farmerConsent.upsert({
      where: { id: consentId },
      update: { status: 'GRANTED' },
      create: {
        id: consentId,
        farmerId,
        organizationId: ids.cooperative,
        consentType: 'DATA_PROCESSING',
        policyVersion: 'local-demo-v1',
        status: 'GRANTED',
        capturedByUserId: ids.collectionAgent,
        captureMethod: 'VERBAL_WITNESSED',
        notes: 'Local development fixture only',
      },
    });
    await database.farmerQrIdentity.upsert({
      where: { id: qrIdentityId },
      update: { status: 'ACTIVE', revokedAt: null, replacedById: null },
      create: {
        id: qrIdentityId,
        farmerId,
        organizationId: ids.cooperative,
        publicId: `fq1_${['N4hYp8mQ2vL7xR5cT9kW', 'B6sJ3dF8nP2zX7qM4aVh', 'K9wC5rT2yL8pG4mN7xQs'][index]}`,
        status: 'ACTIVE',
        issuedByUserId: ids.cooperativeAdmin,
      },
    });
  }
} finally {
  await database.$disconnect();
}
