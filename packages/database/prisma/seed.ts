import { createDatabaseClient } from '../src/index.js';
import { argon2id, hash } from 'argon2';
import { hashPayload } from '@clycites/hedera';
import { createCipheriv, randomBytes } from 'node:crypto';

const database = createDatabaseClient();

const ids = {
  platformAdmin: '00000000-0000-4000-8000-000000000101',
  cooperativeAdmin: '00000000-0000-4000-8000-000000000102',
  collectionAgent: '00000000-0000-4000-8000-000000000103',
  financeOfficer: '00000000-0000-4000-8000-000000000104',
  buyerUser: '00000000-0000-4000-8000-000000000105',
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
  coffee: '00000000-0000-4000-8000-000000000801',
  coffeeForms: {
    cherry: '00000000-0000-4000-8000-000000000811',
    kiboko: '00000000-0000-4000-8000-000000000812',
    parchment: '00000000-0000-4000-8000-000000000813',
    faq: '00000000-0000-4000-8000-000000000814',
    greenBean: '00000000-0000-4000-8000-000000000815',
  },
  qualityDefinitions: {
    moisture: '00000000-0000-4000-8000-000000000821',
    cherryRipeness: '00000000-0000-4000-8000-000000000822',
    cooperativeCherryRipeness: '00000000-0000-4000-8000-000000000823',
  },
  device: '00000000-0000-4000-8000-000000000901',
  collectionSession: '00000000-0000-4000-8000-000000000902',
  deliveries: {
    accepted: '00000000-0000-4000-8000-000000000a01',
    pending: '00000000-0000-4000-8000-000000000a02',
    correctionOriginal: '00000000-0000-4000-8000-000000000a03',
    correctionReplacement: '00000000-0000-4000-8000-000000000a04',
  },
  correctionRequest: '00000000-0000-4000-8000-000000000b01',
  recipientOrganization: '00000000-0000-4000-8000-000000000202',
  storageLocation: '00000000-0000-4000-8000-000000000f01',
  phaseThree: {
    aggregationBatch: '00000000-0000-4000-8000-000000001001',
    splitBatchA: '00000000-0000-4000-8000-000000001002',
    splitBatchB: '00000000-0000-4000-8000-000000001003',
    mergedBatch: '00000000-0000-4000-8000-000000001004',
    transformedBatch: '00000000-0000-4000-8000-000000001005',
    contribution: '00000000-0000-4000-8000-000000001011',
    split: '00000000-0000-4000-8000-000000001021',
    merge: '00000000-0000-4000-8000-000000001022',
    transformation: '00000000-0000-4000-8000-000000001023',
    lot: '00000000-0000-4000-8000-000000001031',
    lotContribution: '00000000-0000-4000-8000-000000001032',
    inspection: '00000000-0000-4000-8000-000000001041',
    inspectionMeasurement: '00000000-0000-4000-8000-000000001042',
    transfer: '00000000-0000-4000-8000-000000001051',
    publication: '00000000-0000-4000-8000-000000001061',
  },
  phaseFive: {
    listing: '00000000-0000-4000-8000-000000003001',
    listingVersion: '00000000-0000-4000-8000-000000003002',
    invitation: '00000000-0000-4000-8000-000000003003',
    submittedOffer: '00000000-0000-4000-8000-000000003011',
    acceptedOffer: '00000000-0000-4000-8000-000000003012',
    reservation: '00000000-0000-4000-8000-000000003021',
    contract: '00000000-0000-4000-8000-000000003031',
    order: '00000000-0000-4000-8000-000000003041',
    orderStatusEvent: '00000000-0000-4000-8000-000000003042',
    share: '00000000-0000-4000-8000-000000003051',
  },
  phaseSix: {
    listing: '00000000-0000-4000-8000-000000004001',
    offer: '00000000-0000-4000-8000-000000004011',
    reservation: '00000000-0000-4000-8000-000000004021',
    contract: '00000000-0000-4000-8000-000000004031',
    order: '00000000-0000-4000-8000-000000004041',
    acceptance: '00000000-0000-4000-8000-000000004051',
    proceeds: '00000000-0000-4000-8000-000000004061',
    settlement: '00000000-0000-4000-8000-000000004071',
    settlementStatus: '00000000-0000-4000-8000-000000004072',
    settlementOrder: '00000000-0000-4000-8000-000000004073',
    allocation: '00000000-0000-4000-8000-000000004081',
    farmerSettlement: '00000000-0000-4000-8000-000000004091',
    policy: '00000000-0000-4000-8000-0000000040a1',
    deduction: '00000000-0000-4000-8000-0000000040a2',
    paymentMethod: '00000000-0000-4000-8000-0000000040b1',
    statement: '00000000-0000-4000-8000-0000000040c1',
    paymentInstruction: '00000000-0000-4000-8000-0000000040d1',
    paymentAttempt: '00000000-0000-4000-8000-0000000040d2',
    reconciliation: '00000000-0000-4000-8000-0000000040e1',
  },
  phaseSeven: {
    securityGate: '00000000-0000-4000-8000-000000005001',
    legalGate: '00000000-0000-4000-8000-000000005002',
    trainingGate: '00000000-0000-4000-8000-000000005003',
    securityGateEvent: '00000000-0000-4000-8000-000000005011',
    legalGateEvent: '00000000-0000-4000-8000-000000005012',
    trainingGateEvent: '00000000-0000-4000-8000-000000005013',
    retentionPolicy: '00000000-0000-4000-8000-000000005021',
    retentionDryRun: '00000000-0000-4000-8000-000000005022',
    privacyRequest: '00000000-0000-4000-8000-000000005031',
    incident: '00000000-0000-4000-8000-000000005041',
    backup: '00000000-0000-4000-8000-000000005051',
    notification: '00000000-0000-4000-8000-000000005061',
    featureFlag: '00000000-0000-4000-8000-000000005071',
  },
  phaseEight: {
    draftPilot: '00000000-0000-4000-8000-000000006001',
    blockedPilot: '00000000-0000-4000-8000-000000006002',
    supervisedPilot: '00000000-0000-4000-8000-000000006003',
    draftStatus: '00000000-0000-4000-8000-000000006011',
    blockedStatus: '00000000-0000-4000-8000-000000006012',
    supervisedStatus: '00000000-0000-4000-8000-000000006013',
    configuration: '00000000-0000-4000-8000-000000006021',
    farmerParticipant: '00000000-0000-4000-8000-000000006031',
    agentParticipant: '00000000-0000-4000-8000-000000006032',
    adminParticipant: '00000000-0000-4000-8000-000000006033',
    buyerParticipant: '00000000-0000-4000-8000-000000006034',
    collectionPoint: '00000000-0000-4000-8000-000000006041',
    deviceAssignment: '00000000-0000-4000-8000-000000006042',
    trainingModule: '00000000-0000-4000-8000-000000006051',
    trainingAssignment: '00000000-0000-4000-8000-000000006052',
    metricDefinition: '00000000-0000-4000-8000-000000006061',
    baseline: '00000000-0000-4000-8000-000000006062',
    observation: '00000000-0000-4000-8000-000000006063',
    fieldObservation: '00000000-0000-4000-8000-000000006064',
    feedback: '00000000-0000-4000-8000-000000006071',
    supportCase: '00000000-0000-4000-8000-000000006072',
    decision: '00000000-0000-4000-8000-000000006081',
  },
} as const;

const localPassword = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
if (process.env.NODE_ENV === 'production' && !process.env.SEED_STAFF_PASSWORD) {
  throw new Error('SEED_STAFF_PASSWORD is required when seeding production');
}
if (!process.env.SEED_STAFF_PASSWORD) {
  console.warn('WARNING: using documented local-only Phase 1 seed credentials');
}

const passwordHash = await hash(localPassword, { type: argon2id });
const platformTotpSecret = process.env.SEED_PLATFORM_ADMIN_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXP';
const mfaEncryptionKey = Buffer.from(
  process.env.AUTH_MFA_ENCRYPTION_KEY_BASE64 ?? 'BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=',
  'base64',
);
const encryptMfaSecret = (secret: string): string => {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaEncryptionKey, initializationVector);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    initializationVector.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

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
      mfaSecretEncrypted: encryptMfaSecret(platformTotpSecret),
      mfaEnrolledAt: new Date(),
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
    {
      id: ids.buyerUser,
      email: process.env.SEED_BUYER_EMAIL ?? 'buyer@clycites.local',
      firstName: 'Amina',
      lastName: 'Kato',
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

  await database.organization.upsert({
    where: { id: ids.recipientOrganization },
    update: { name: 'Kampala Coffee Exporters', type: 'BUYER', status: 'ACTIVE' },
    create: {
      id: ids.recipientOrganization,
      name: 'Kampala Coffee Exporters',
      slug: 'kampala-coffee-exporters',
      type: 'BUYER',
      status: 'ACTIVE',
      registrationNumber: 'LOCAL-DEMO-002',
      district: 'Kampala',
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

  for (const userId of [ids.cooperativeAdmin, ids.buyerUser]) {
    await database.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: ids.recipientOrganization,
          userId,
        },
      },
      update: { role: 'BUYER', status: 'ACTIVE' },
      create: {
        organizationId: ids.recipientOrganization,
        userId,
        role: 'BUYER',
        status: 'ACTIVE',
        invitedByUserId: ids.platformAdmin,
        joinedAt: new Date(),
      },
    });
  }

  await database.collectionPoint.upsert({
    where: { id: ids.collectionPoint },
    update: {
      name: 'Kisinga Central Collection Point',
      status: 'ACTIVE',
      latitude: '0.078000',
      longitude: '29.718000',
    },
    create: {
      id: ids.collectionPoint,
      organizationId: ids.cooperative,
      name: 'Kisinga Central Collection Point',
      code: 'KIS-01',
      status: 'ACTIVE',
      district: 'Kasese',
      subCounty: 'Kisinga',
      village: 'Kisinga',
      latitude: '0.078000',
      longitude: '29.718000',
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
      update: {
        totalArea: farmer.area,
        status: 'ACTIVE',
        latitude: `${(0.08 + index * 0.002).toFixed(6)}`,
        longitude: `${(29.72 + index * 0.002).toFixed(6)}`,
        locationMethod: 'DECLARED',
      },
      create: {
        id: farmId,
        farmerId,
        organizationId: ids.cooperative,
        name: `${farmer.firstName}'s Coffee Farm`,
        district: 'Kasese',
        subCounty: 'Kisinga',
        village: 'Kisinga',
        latitude: `${(0.08 + index * 0.002).toFixed(6)}`,
        longitude: `${(29.72 + index * 0.002).toFixed(6)}`,
        locationMethod: 'DECLARED',
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

  await database.commodity.upsert({
    where: { id: ids.coffee },
    update: { code: 'COFFEE', name: 'Coffee', status: 'ACTIVE' },
    create: {
      id: ids.coffee,
      code: 'COFFEE',
      name: 'Coffee',
      description: 'Coffee received through cooperative collection points',
      status: 'ACTIVE',
    },
  });

  const coffeeForms = [
    { id: ids.coffeeForms.cherry, code: 'CHERRY', name: 'Coffee Cherry' },
    { id: ids.coffeeForms.kiboko, code: 'KIBOKO', name: 'Kiboko' },
    { id: ids.coffeeForms.parchment, code: 'PARCHMENT', name: 'Parchment Coffee' },
    { id: ids.coffeeForms.faq, code: 'FAQ', name: 'Fair Average Quality' },
    { id: ids.coffeeForms.greenBean, code: 'GREEN_BEAN', name: 'Green Bean' },
  ];
  for (const form of coffeeForms) {
    await database.commodityForm.upsert({
      where: { id: form.id },
      update: { code: form.code, name: form.name, status: 'ACTIVE' },
      create: {
        ...form,
        commodityId: ids.coffee,
        defaultUnit: 'KG',
        status: 'ACTIVE',
      },
    });
  }

  // Platform defaults only. Ratios are output mass over input mass, taken from published
  // coffee processing figures, and are deliberately wide: they exist to flag an
  // implausible transformation, not to define a target an organization must hit.
  const formConversions = [
    {
      id: '00000000-0000-4000-8000-000000000841',
      fromFormId: ids.coffeeForms.cherry,
      toFormId: ids.coffeeForms.parchment,
      minRatio: '0.150000',
      maxRatio: '0.250000',
      sourceReference: 'Wet processing yield, roughly 5:1 cherry to parchment',
    },
    {
      id: '00000000-0000-4000-8000-000000000842',
      fromFormId: ids.coffeeForms.parchment,
      toFormId: ids.coffeeForms.greenBean,
      minRatio: '0.750000',
      maxRatio: '0.860000',
      sourceReference: 'Hulling yield, roughly 1.25:1 parchment to green',
    },
    {
      id: '00000000-0000-4000-8000-000000000843',
      fromFormId: ids.coffeeForms.cherry,
      toFormId: ids.coffeeForms.kiboko,
      minRatio: '0.400000',
      maxRatio: '0.550000',
      sourceReference: 'Natural drying yield, cherry to kiboko',
    },
    {
      id: '00000000-0000-4000-8000-000000000844',
      fromFormId: ids.coffeeForms.kiboko,
      toFormId: ids.coffeeForms.faq,
      minRatio: '0.500000',
      maxRatio: '0.620000',
      sourceReference: 'Hulling yield, kiboko to fair average quality',
    },
  ];
  for (const conversion of formConversions) {
    const { id, ...rest } = conversion;
    await database.commodityFormConversion.upsert({
      where: { id },
      update: { ...rest, basis: 'MASS', source: 'LITERATURE_ESTIMATE' },
      create: {
        id,
        ...rest,
        commodityId: ids.coffee,
        basis: 'MASS',
        source: 'LITERATURE_ESTIMATE',
      },
    });
  }

  const qualityDefinitions = [
    {
      id: ids.qualityDefinitions.moisture,
      commodityFormId: ids.coffeeForms.greenBean,
      organizationId: null,
      code: 'MOISTURE_PERCENT',
      name: 'Moisture',
      dataType: 'DECIMAL' as const,
      unit: '%',
      required: true,
      minimumValue: '8.000000',
      maximumValue: '14.000000',
      allowedValues: undefined,
      displayOrder: 10,
    },
    {
      id: ids.qualityDefinitions.cherryRipeness,
      commodityFormId: ids.coffeeForms.cherry,
      organizationId: null,
      code: 'CHERRY_RIPENESS',
      name: 'Cherry Ripeness',
      dataType: 'ENUM' as const,
      unit: undefined,
      required: true,
      minimumValue: undefined,
      maximumValue: undefined,
      allowedValues: ['RED', 'MIXED', 'UNRIPE'],
      displayOrder: 10,
    },
    {
      id: ids.qualityDefinitions.cooperativeCherryRipeness,
      commodityFormId: ids.coffeeForms.cherry,
      organizationId: ids.cooperative,
      code: 'CHERRY_RIPENESS',
      name: 'Cherry Ripeness',
      dataType: 'ENUM' as const,
      unit: undefined,
      required: true,
      minimumValue: undefined,
      maximumValue: undefined,
      allowedValues: ['RED', 'MIXED'],
      displayOrder: 10,
    },
  ];
  for (const definition of qualityDefinitions) {
    await database.qualityAttributeDefinition.upsert({
      where: { id: definition.id },
      update: {
        name: definition.name,
        required: definition.required,
        minimumValue: definition.minimumValue,
        maximumValue: definition.maximumValue,
        allowedValues: definition.allowedValues,
        status: 'ACTIVE',
      },
      create: {
        ...definition,
        status: 'ACTIVE',
      },
    });
  }

  await database.registeredDevice.upsert({
    where: { id: ids.device },
    update: { assignedUserId: ids.collectionAgent, status: 'ACTIVE', revokedAt: null },
    create: {
      id: ids.device,
      organizationId: ids.cooperative,
      assignedUserId: ids.collectionAgent,
      devicePublicId: 'device_local_collection_01',
      name: 'Kisinga Collection Tablet',
      platform: 'PWA',
      status: 'ACTIVE',
      lastSeenAt: new Date('2026-07-18T08:00:00.000Z'),
    },
  });

  await database.collectionSession.upsert({
    where: { id: ids.collectionSession },
    update: { status: 'OPEN', closedAt: null },
    create: {
      id: ids.collectionSession,
      organizationId: ids.cooperative,
      collectionPointId: ids.collectionPoint,
      agentUserId: ids.collectionAgent,
      deviceId: ids.device,
      businessDate: new Date('2026-07-18T00:00:00.000Z'),
      status: 'OPEN',
      openedAt: new Date('2026-07-18T07:00:00.000Z'),
      notes: 'Local Phase 2 collection session',
    },
  });

  const farmerMemberships = await database.farmerOrganizationMembership.findMany({
    where: { organizationId: ids.cooperative, farmerId: { in: [...ids.farmers] } },
  });
  const membershipByFarmer = new Map(
    farmerMemberships.map((membership) => [membership.farmerId, membership.id]),
  );

  const deliveries = [
    {
      id: ids.deliveries.accepted,
      publicId: 'delivery_local_accepted_01',
      deliveryNumber: 'KIS-20260718-0001',
      farmerId: ids.farmers[0],
      farmId: ids.farms[0],
      status: 'ACCEPTED' as const,
      version: 1,
      supersedesDeliveryId: null,
      netQuantity: '75.5000',
      unitPriceMinor: 3000n,
      grossAmountMinor: 226500n,
      acceptedAt: new Date('2026-07-18T07:31:00.000Z'),
      clientCreatedAt: new Date('2026-07-18T07:30:00.000Z'),
    },
    {
      id: ids.deliveries.pending,
      publicId: 'delivery_local_pending_01',
      deliveryNumber: 'KIS-20260718-0002',
      farmerId: ids.farmers[1],
      farmId: ids.farms[1],
      status: 'PENDING_CONFIRMATION' as const,
      version: 1,
      supersedesDeliveryId: null,
      netQuantity: '40.0000',
      unitPriceMinor: 2800n,
      grossAmountMinor: 112000n,
      acceptedAt: null,
      clientCreatedAt: new Date('2026-07-18T08:00:00.000Z'),
    },
    {
      id: ids.deliveries.correctionOriginal,
      publicId: 'delivery_local_corrected_01_v1',
      deliveryNumber: 'KIS-20260718-0003',
      farmerId: ids.farmers[2],
      farmId: ids.farms[2],
      status: 'CORRECTED' as const,
      version: 1,
      supersedesDeliveryId: null,
      netQuantity: '50.0000',
      unitPriceMinor: 3000n,
      grossAmountMinor: 150000n,
      acceptedAt: new Date('2026-07-18T08:31:00.000Z'),
      clientCreatedAt: new Date('2026-07-18T08:30:00.000Z'),
    },
    {
      id: ids.deliveries.correctionReplacement,
      publicId: 'delivery_local_corrected_01_v2',
      deliveryNumber: 'KIS-20260718-0003',
      farmerId: ids.farmers[2],
      farmId: ids.farms[2],
      status: 'ACCEPTED' as const,
      version: 2,
      supersedesDeliveryId: ids.deliveries.correctionOriginal,
      netQuantity: '52.0000',
      unitPriceMinor: 3000n,
      grossAmountMinor: 156000n,
      acceptedAt: new Date('2026-07-18T09:15:00.000Z'),
      clientCreatedAt: new Date('2026-07-18T08:30:00.000Z'),
    },
  ];

  for (const delivery of deliveries) {
    const farmerOrganizationMembershipId = membershipByFarmer.get(delivery.farmerId);
    if (!farmerOrganizationMembershipId) throw new Error('Missing farmer membership seed fixture');

    await database.delivery.upsert({
      where: { id: delivery.id },
      update: { status: delivery.status, acceptedAt: delivery.acceptedAt },
      create: {
        id: delivery.id,
        publicId: delivery.publicId,
        deliveryNumber: delivery.deliveryNumber,
        organizationId: ids.cooperative,
        collectionPointId: ids.collectionPoint,
        collectionSessionId: ids.collectionSession,
        farmerId: delivery.farmerId,
        farmerOrganizationMembershipId,
        farmId: delivery.farmId,
        commodityId: ids.coffee,
        commodityFormId: ids.coffeeForms.cherry,
        status: delivery.status,
        source: 'ONLINE',
        clientCreatedAt: delivery.clientCreatedAt,
        acceptedAt: delivery.acceptedAt,
        acceptedByUserId: delivery.acceptedAt ? ids.collectionAgent : null,
        confirmedAt: delivery.acceptedAt,
        confirmationMethod: delivery.acceptedAt ? 'VERBAL_WITNESSED' : null,
        version: delivery.version,
        supersedesDeliveryId: delivery.supersedesDeliveryId,
        createdByUserId: ids.collectionAgent,
      },
    });
    // Measurements are append-only and versioned, so there is no compound unique key to
    // upsert against. Target the single live (non-superseded) measurement instead.
    const liveWeight = await database.deliveryMeasurement.findFirst({
      where: { deliveryId: delivery.id, measurementType: 'WEIGHT', supersededAt: null },
      select: { id: true },
    });
    if (liveWeight) {
      await database.deliveryMeasurement.update({
        where: { id: liveWeight.id },
        data: { netQuantity: delivery.netQuantity },
      });
    } else {
      await database.deliveryMeasurement.create({
        data: {
          deliveryId: delivery.id,
          measurementType: 'WEIGHT',
          netQuantity: delivery.netQuantity,
          unit: 'KG',
          captureMethod: 'MANUAL',
          capturedByUserId: ids.collectionAgent,
          capturedAt: delivery.clientCreatedAt,
        },
      });
    }
    await database.deliveryPricing.upsert({
      where: { deliveryId: delivery.id },
      update: {
        quantity: delivery.netQuantity,
        grossAmountMinor: delivery.grossAmountMinor,
        netAmountMinor: delivery.grossAmountMinor,
      },
      create: {
        deliveryId: delivery.id,
        unitPriceMinor: delivery.unitPriceMinor,
        currency: 'UGX',
        quantity: delivery.netQuantity,
        quantityUnit: 'KG',
        grossAmountMinor: delivery.grossAmountMinor,
        adjustmentAmountMinor: 0n,
        netAmountMinor: delivery.grossAmountMinor,
        priceSource: 'COLLECTION_POINT',
        priceReference: 'KIS-01-2026-07-18',
      },
    });
    await database.deliveryQualityMeasurement.upsert({
      where: {
        deliveryId_qualityAttributeDefinitionId: {
          deliveryId: delivery.id,
          qualityAttributeDefinitionId: ids.qualityDefinitions.cooperativeCherryRipeness,
        },
      },
      update: { enumValue: 'RED' },
      create: {
        deliveryId: delivery.id,
        qualityAttributeDefinitionId: ids.qualityDefinitions.cooperativeCherryRipeness,
        enumValue: 'RED',
        capturedByUserId: ids.collectionAgent,
        capturedAt: delivery.clientCreatedAt,
      },
    });
    if (delivery.acceptedAt) {
      await database.deliveryConfirmation.upsert({
        where: { id: `${delivery.id.slice(0, -2)}c${delivery.id.slice(-1)}` },
        update: { status: 'CONFIRMED' },
        create: {
          id: `${delivery.id.slice(0, -2)}c${delivery.id.slice(-1)}`,
          deliveryId: delivery.id,
          method: 'VERBAL_WITNESSED',
          status: 'CONFIRMED',
          confirmedByName: farmers[ids.farmers.indexOf(delivery.farmerId)]?.firstName,
          confirmedByFarmerId: delivery.farmerId,
          witnessUserId: ids.collectionAgent,
          confirmedAt: delivery.acceptedAt,
          metadata: { fixture: true },
        },
      });
    }
  }

  const receipts = {
    accepted: '00000000-0000-4000-8000-000000000d01',
    original: '00000000-0000-4000-8000-000000000d02',
    replacement: '00000000-0000-4000-8000-000000000d03',
  } as const;
  await database.deliveryReceipt.upsert({
    where: { id: receipts.accepted },
    update: { status: 'ACTIVE' },
    create: {
      id: receipts.accepted,
      deliveryId: ids.deliveries.accepted,
      receiptNumber: 'RCP-KIS-20260718-0001',
      version: 1,
      status: 'ACTIVE',
      issuedAt: new Date('2026-07-18T07:31:00.000Z'),
      issuedByUserId: ids.collectionAgent,
      checksum: 'c5c0e3de927f26e234a2088f56f653486a28be10aafb05b2dc9ef1b17d7dfe12',
    },
  });
  await database.deliveryReceipt.upsert({
    where: { id: receipts.original },
    update: { status: 'SUPERSEDED' },
    create: {
      id: receipts.original,
      deliveryId: ids.deliveries.correctionOriginal,
      receiptNumber: 'RCP-KIS-20260718-0003-V1',
      version: 1,
      status: 'SUPERSEDED',
      issuedAt: new Date('2026-07-18T08:31:00.000Z'),
      issuedByUserId: ids.collectionAgent,
      checksum: '4f344baa6be78f0d11f588e4f723e3214af4f101f16801ce552f59e94e8b3287',
    },
  });
  await database.deliveryReceipt.upsert({
    where: { id: receipts.replacement },
    update: { status: 'ACTIVE' },
    create: {
      id: receipts.replacement,
      deliveryId: ids.deliveries.correctionReplacement,
      receiptNumber: 'RCP-KIS-20260718-0003-V2',
      version: 1,
      status: 'ACTIVE',
      issuedAt: new Date('2026-07-18T09:15:00.000Z'),
      issuedByUserId: ids.cooperativeAdmin,
      checksum: 'c7b9a17b6a8a0879e9167ea2ea28a1ca89b5eb50e8ad2995ece9d7d43ce09047',
    },
  });
  await database.deliveryReceipt.update({
    where: { id: receipts.original },
    data: { supersededById: receipts.replacement },
  });

  await database.deliveryCorrectionRequest.upsert({
    where: { id: ids.correctionRequest },
    update: {
      status: 'APPROVED',
      replacementDeliveryVersionId: ids.deliveries.correctionReplacement,
    },
    create: {
      id: ids.correctionRequest,
      deliveryId: ids.deliveries.correctionOriginal,
      requestedByUserId: ids.collectionAgent,
      reasonCode: 'WEIGHT_ENTRY_ERROR',
      reason: 'Gross bag weight was entered two kilograms low.',
      proposedChanges: {
        weight: { mode: 'DIRECT_NET', netQuantity: '52.0000', unit: 'KG', captureMethod: 'MANUAL' },
      },
      status: 'APPROVED',
      reviewedByUserId: ids.cooperativeAdmin,
      reviewedAt: new Date('2026-07-18T09:15:00.000Z'),
      reviewNotes: 'Compared against the signed collection sheet.',
      replacementDeliveryVersionId: ids.deliveries.correctionReplacement,
    },
  });

  await database.storageLocation.upsert({
    where: { id: ids.storageLocation },
    update: { status: 'ACTIVE', name: 'Kisinga Main Store' },
    create: {
      id: ids.storageLocation,
      organizationId: ids.cooperative,
      code: 'KIS-MAIN',
      name: 'Kisinga Main Store',
      status: 'ACTIVE',
    },
  });

  const phaseThreeBatches = [
    {
      id: ids.phaseThree.aggregationBatch,
      publicId: 'pb1_local_aggregation',
      batchNumber: 'BAT-KIS-2026-001',
      commodityFormId: ids.coffeeForms.cherry,
      operationType: 'AGGREGATION' as const,
      quantity: '75.5000',
      status: 'CONSUMED' as const,
    },
    {
      id: ids.phaseThree.splitBatchA,
      publicId: 'pb1_local_split_a',
      batchNumber: 'BAT-KIS-2026-001-A',
      commodityFormId: ids.coffeeForms.cherry,
      operationType: 'SPLIT' as const,
      quantity: '40.0000',
      status: 'CONSUMED' as const,
    },
    {
      id: ids.phaseThree.splitBatchB,
      publicId: 'pb1_local_split_b',
      batchNumber: 'BAT-KIS-2026-001-B',
      commodityFormId: ids.coffeeForms.cherry,
      operationType: 'SPLIT' as const,
      quantity: '35.5000',
      status: 'CONSUMED' as const,
    },
    {
      id: ids.phaseThree.mergedBatch,
      publicId: 'pb1_local_merged',
      batchNumber: 'BAT-KIS-2026-002',
      commodityFormId: ids.coffeeForms.cherry,
      operationType: 'MERGE' as const,
      quantity: '75.5000',
      status: 'CONSUMED' as const,
    },
    {
      id: ids.phaseThree.transformedBatch,
      publicId: 'pb1_local_parchment',
      batchNumber: 'BAT-KIS-2026-003',
      commodityFormId: ids.coffeeForms.parchment,
      operationType: 'TRANSFORMATION' as const,
      quantity: '68.0000',
      status: 'CONSUMED' as const,
    },
  ];
  for (const batch of phaseThreeBatches) {
    await database.produceBatch.upsert({
      where: { id: batch.id },
      update: {
        status: batch.status,
        initialQuantity: batch.quantity,
        sealedAt: new Date('2026-07-18T12:00:00.000Z'),
      },
      create: {
        id: batch.id,
        publicId: batch.publicId,
        batchNumber: batch.batchNumber,
        organizationId: ids.cooperative,
        commodityId: ids.coffee,
        commodityFormId: batch.commodityFormId,
        storageLocationId: ids.storageLocation,
        operationType: batch.operationType,
        status: batch.status,
        initialQuantity: batch.quantity,
        quantityUnit: 'KG',
        sealedAt: new Date('2026-07-18T12:00:00.000Z'),
        createdByUserId: ids.cooperativeAdmin,
      },
    });
  }

  await database.farmerBatchContribution.upsert({
    where: { id: ids.phaseThree.contribution },
    update: { quantity: '75.5000' },
    create: {
      id: ids.phaseThree.contribution,
      batchId: ids.phaseThree.aggregationBatch,
      deliveryId: ids.deliveries.accepted,
      quantity: '75.5000',
      unit: 'KG',
    },
  });

  const transformations = [
    {
      id: ids.phaseThree.split,
      number: 'TR-KIS-2026-001',
      type: 'SPLIT' as const,
      inputs: [
        {
          id: '00000000-0000-4000-8000-000000001101',
          batchId: ids.phaseThree.aggregationBatch,
          quantity: '75.5000',
        },
      ],
      outputs: [
        {
          id: '00000000-0000-4000-8000-000000001111',
          batchId: ids.phaseThree.splitBatchA,
          quantity: '40.0000',
        },
        {
          id: '00000000-0000-4000-8000-000000001112',
          batchId: ids.phaseThree.splitBatchB,
          quantity: '35.5000',
        },
      ],
    },
    {
      id: ids.phaseThree.merge,
      number: 'TR-KIS-2026-002',
      type: 'MERGE' as const,
      inputs: [
        {
          id: '00000000-0000-4000-8000-000000001102',
          batchId: ids.phaseThree.splitBatchA,
          quantity: '40.0000',
        },
        {
          id: '00000000-0000-4000-8000-000000001103',
          batchId: ids.phaseThree.splitBatchB,
          quantity: '35.5000',
        },
      ],
      outputs: [
        {
          id: '00000000-0000-4000-8000-000000001113',
          batchId: ids.phaseThree.mergedBatch,
          quantity: '75.5000',
        },
      ],
    },
    {
      id: ids.phaseThree.transformation,
      number: 'TR-KIS-2026-003',
      type: 'TRANSFORMATION' as const,
      inputs: [
        {
          id: '00000000-0000-4000-8000-000000001104',
          batchId: ids.phaseThree.mergedBatch,
          quantity: '75.5000',
        },
      ],
      outputs: [
        {
          id: '00000000-0000-4000-8000-000000001114',
          batchId: ids.phaseThree.transformedBatch,
          quantity: '68.0000',
        },
      ],
    },
  ];
  for (const transformation of transformations) {
    await database.batchTransformation.upsert({
      where: { id: transformation.id },
      update: { status: 'COMPLETED' },
      create: {
        id: transformation.id,
        organizationId: ids.cooperative,
        transformationNumber: transformation.number,
        type: transformation.type,
        status: 'COMPLETED',
        completedByUserId: ids.cooperativeAdmin,
        completedAt: new Date('2026-07-18T12:00:00.000Z'),
      },
    });
    for (const input of transformation.inputs)
      await database.batchTransformationInput.upsert({
        where: { id: input.id },
        update: { quantity: input.quantity },
        create: { ...input, transformationId: transformation.id, unit: 'KG' },
      });
    for (const output of transformation.outputs)
      await database.batchTransformationOutput.upsert({
        where: { id: output.id },
        update: { quantity: output.quantity },
        create: { ...output, transformationId: transformation.id, unit: 'KG' },
      });
  }

  await database.cooperativeLot.upsert({
    where: { id: ids.phaseThree.lot },
    update: { status: 'APPROVED', quantity: '68.0000' },
    create: {
      id: ids.phaseThree.lot,
      publicId: 'lot1_local_export_2026',
      lotNumber: 'LOT-KIS-2026-001',
      organizationId: ids.cooperative,
      commodityId: ids.coffee,
      commodityFormId: ids.coffeeForms.parchment,
      storageLocationId: ids.storageLocation,
      status: 'APPROVED',
      quantity: '68.0000',
      quantityUnit: 'KG',
      createdByUserId: ids.cooperativeAdmin,
    },
  });
  await database.cooperativeLotContribution.upsert({
    where: { id: ids.phaseThree.lotContribution },
    update: { quantity: '68.0000' },
    create: {
      id: ids.phaseThree.lotContribution,
      lotId: ids.phaseThree.lot,
      batchId: ids.phaseThree.transformedBatch,
      quantity: '68.0000',
      unit: 'KG',
    },
  });
  await database.qualityInspection.upsert({
    where: { id: ids.phaseThree.inspection },
    update: { status: 'PASSED' },
    create: {
      id: ids.phaseThree.inspection,
      organizationId: ids.cooperative,
      lotId: ids.phaseThree.lot,
      status: 'PASSED',
      inspectorUserId: ids.cooperativeAdmin,
      inspectedAt: new Date('2026-07-18T13:00:00.000Z'),
      notes: 'Local Phase 3 export quality fixture',
    },
  });
  await database.qualityInspectionMeasurement.upsert({
    where: { id: ids.phaseThree.inspectionMeasurement },
    update: { decimalValue: '11.500000' },
    create: {
      id: ids.phaseThree.inspectionMeasurement,
      inspectionId: ids.phaseThree.inspection,
      qualityAttributeDefinitionId: ids.qualityDefinitions.moisture,
      decimalValue: '11.500000',
    },
  });
  await database.custodyTransfer.upsert({
    where: { id: ids.phaseThree.transfer },
    update: { status: 'RECEIVED' },
    create: {
      id: ids.phaseThree.transfer,
      transferNumber: 'CT-KIS-2026-001',
      lotId: ids.phaseThree.lot,
      fromOrganizationId: ids.cooperative,
      toOrganizationId: ids.recipientOrganization,
      originLocationId: ids.storageLocation,
      status: 'RECEIVED',
      quantity: '68.0000',
      quantityUnit: 'KG',
      initiatedByUserId: ids.cooperativeAdmin,
      dispatchedAt: new Date('2026-07-18T14:00:00.000Z'),
      receivedByUserId: ids.cooperativeAdmin,
      receivedAt: new Date('2026-07-18T18:00:00.000Z'),
    },
  });
  await database.traceabilityPublication.upsert({
    where: { id: ids.phaseThree.publication },
    update: { status: 'PUBLISHED', revokedAt: null },
    create: {
      id: ids.phaseThree.publication,
      organizationId: ids.cooperative,
      lotId: ids.phaseThree.lot,
      publicId: 'tr1_local_export_2026',
      status: 'PUBLISHED',
      publishedClaims: {
        originDistrict: 'Kasese',
        harvestSeason: '2026 main crop',
        processingSummary: 'Hand-sorted cherry processed to parchment at the cooperative.',
      },
      publishedAt: new Date('2026-07-18T13:30:00.000Z'),
      actorUserId: ids.cooperativeAdmin,
    },
  });

  const ledgerEntries = [
    {
      id: '00000000-0000-4000-8000-000000001201',
      entryType: 'DELIVERY_CONTRIBUTION' as const,
      sourceType: 'DELIVERY' as const,
      sourceId: ids.deliveries.accepted,
      destinationType: 'BATCH' as const,
      destinationId: ids.phaseThree.aggregationBatch,
      quantity: '75.5000',
      referenceType: 'FarmerBatchContribution',
      referenceId: ids.phaseThree.contribution,
      commodityFormId: ids.coffeeForms.cherry,
    },
    ...transformations.flatMap((transformation) => [
      ...transformation.inputs.map((input) => ({
        id: input.id.replace('11', '12'),
        entryType: 'TRANSFORMATION_INPUT' as const,
        sourceType: 'BATCH' as const,
        sourceId: input.batchId,
        destinationType: null,
        destinationId: null,
        quantity: input.quantity,
        referenceType: 'BatchTransformationInput',
        referenceId: input.id,
        commodityFormId: phaseThreeBatches.find((batch) => batch.id === input.batchId)!
          .commodityFormId,
      })),
      ...transformation.outputs.map((output) => ({
        id: output.id.replace('11', '13'),
        entryType: 'TRANSFORMATION_OUTPUT' as const,
        sourceType: null,
        sourceId: null,
        destinationType: 'BATCH' as const,
        destinationId: output.batchId,
        quantity: output.quantity,
        referenceType: 'BatchTransformationOutput',
        referenceId: output.id,
        commodityFormId: phaseThreeBatches.find((batch) => batch.id === output.batchId)!
          .commodityFormId,
      })),
    ]),
    {
      id: '00000000-0000-4000-8000-000000001299',
      entryType: 'LOT_ALLOCATION' as const,
      sourceType: 'BATCH' as const,
      sourceId: ids.phaseThree.transformedBatch,
      destinationType: 'LOT' as const,
      destinationId: ids.phaseThree.lot,
      quantity: '68.0000',
      referenceType: 'CooperativeLotContribution',
      referenceId: ids.phaseThree.lotContribution,
      commodityFormId: ids.coffeeForms.parchment,
    },
  ];
  await database.inventoryLedgerEntry.createMany({
    data: ledgerEntries.map((entry) => ({
      ...entry,
      organizationId: ids.cooperative,
      commodityId: ids.coffee,
      unit: 'KG' as const,
    })),
    skipDuplicates: true,
  });

  const outboxEvents = [
    {
      id: '00000000-0000-4000-8000-000000000e01',
      aggregateId: ids.deliveries.accepted,
      eventType: 'delivery.accepted',
      payload: { deliveryId: ids.deliveries.accepted, organizationId: ids.cooperative, version: 1 },
    },
    {
      id: '00000000-0000-4000-8000-000000000e03',
      aggregateId: ids.phaseThree.lot,
      eventType: 'LOT_TRACEABILITY_PUBLISHED',
      payload: {
        lotId: ids.phaseThree.lot,
        organizationId: ids.cooperative,
        publicId: 'tr1_local_export_2026',
      },
    },
    {
      id: '00000000-0000-4000-8000-000000000e02',
      aggregateId: ids.correctionRequest,
      eventType: 'delivery.correction.approved',
      payload: {
        correctionRequestId: ids.correctionRequest,
        originalDeliveryId: ids.deliveries.correctionOriginal,
        replacementDeliveryId: ids.deliveries.correctionReplacement,
        organizationId: ids.cooperative,
      },
    },
  ];
  for (const event of outboxEvents) {
    await database.outboxEvent.upsert({
      where: { id: event.id },
      update: { payload: event.payload },
      create: {
        ...event,
        aggregateType: 'Delivery',
        schemaVersion: '1.0',
        status: 'PENDING',
      },
    });
  }

  const seededLot = await database.cooperativeLot.findUniqueOrThrow({
    where: { id: ids.phaseThree.lot },
    include: {
      commodity: { select: { code: true } },
      commodityForm: { select: { code: true } },
      contributions: { orderBy: { batchId: 'asc' } },
      inspections: {
        where: { status: 'PASSED' },
        orderBy: { inspectedAt: 'desc' },
        take: 1,
        include: { measurements: { include: { qualityAttributeDefinition: true } } },
      },
    },
  });
  const qualityFacts = seededLot.inspections[0]?.measurements
    .map((measurement) => ({
      code: measurement.qualityAttributeDefinition.code,
      value:
        measurement.decimalValue?.toString() ??
        measurement.integerValue?.toString() ??
        measurement.textValue ??
        measurement.enumValue ??
        measurement.booleanValue?.toString() ??
        null,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const phaseFourStates = [
    'PENDING',
    'SUBMITTED',
    'CONFIRMED',
    'RETRYABLE_FAILURE',
    'PERMANENT_FAILURE',
    'MISMATCH',
    'SUPERSEDED',
    'CONFIRMED',
  ] as const;
  const phaseFourEvents = phaseFourStates.map((status, index) => {
    const position = index + 1;
    const suffix = String(position).padStart(2, '0');
    const eventId = `00000000-0000-4000-8000-0000000020${suffix}`;
    const traceabilityEventId = `00000000-0000-4000-8000-0000000021${suffix}`;
    const anchorId = `00000000-0000-4000-8000-0000000022${suffix}`;
    const canonicalPayload = {
      schemaVersion: '1.0',
      eventId,
      eventType: 'LOT_CREATED',
      organizationId: seededLot.organizationId,
      lotId: seededLot.id,
      lotPublicId: seededLot.publicId,
      commodityCode: seededLot.commodity.code,
      commodityFormCode: seededLot.commodityForm.code,
      quantity: seededLot.quantity.toFixed(4),
      quantityUnit: seededLot.quantityUnit,
      status: seededLot.status,
      parentEventHashes: seededLot.contributions
        .map((item) => hashPayload({ batchId: item.batchId, quantity: item.quantity.toFixed(4) }))
        .sort(),
      qualitySummaryHash: qualityFacts ? hashPayload(qualityFacts) : null,
    };
    return {
      status,
      position,
      eventId,
      traceabilityEventId,
      anchorId,
      canonicalPayload,
      canonicalPayloadHash: hashPayload(canonicalPayload),
    };
  });
  await database.outboxEvent.createMany({
    data: phaseFourEvents.map((event) => ({
      id: event.eventId,
      aggregateType: 'CooperativeLot',
      aggregateId: seededLot.id,
      eventType: 'COOPERATIVE_LOT_CREATED',
      schemaVersion: '1.0',
      payload: { organizationId: ids.cooperative, seedState: event.status },
      status: 'PROCESSED' as const,
      processedAt: new Date('2026-07-18T14:00:00.000Z'),
    })),
    skipDuplicates: true,
  });
  await database.traceabilityEvent.createMany({
    data: phaseFourEvents.map((event, index) => ({
      id: event.traceabilityEventId,
      organizationId: ids.cooperative,
      outboxEventId: event.eventId,
      entityType: 'LOT',
      entityId: seededLot.id,
      eventType: 'LOT_CREATED',
      schemaVersion: '1.0',
      canonicalPayload: event.canonicalPayload,
      canonicalPayloadHash: event.canonicalPayloadHash,
      previousEventHash: index === 0 ? null : phaseFourEvents[index - 1]!.canonicalPayloadHash,
      chainPosition: event.position,
      occurredAt: new Date(`2026-07-18T14:${String(event.position).padStart(2, '0')}:00.000Z`),
    })),
    skipDuplicates: true,
  });
  await database.hederaAnchor.createMany({
    data: phaseFourEvents.map((event, index) => {
      const hasSubmission = ['SUBMITTED', 'CONFIRMED', 'MISMATCH', 'SUPERSEDED'].includes(
        event.status,
      );
      const hasConsensus = ['CONFIRMED', 'MISMATCH', 'SUPERSEDED'].includes(event.status);
      return {
        id: event.anchorId,
        anchorEventId: event.eventId,
        traceabilityEventId: event.traceabilityEventId,
        organizationId: ids.cooperative,
        entityType: 'LOT',
        entityId: seededLot.id,
        eventType: 'LOT_CREATED',
        schemaVersion: '1.0',
        canonicalPayloadHash: event.canonicalPayloadHash,
        previousEventHash: index === 0 ? null : phaseFourEvents[index - 1]!.canonicalPayloadHash,
        privacyReferenceVersion: 'v1',
        provider: 'MOCK' as const,
        network: 'LOCAL' as const,
        topicId: hasSubmission ? '0.0.424242' : null,
        status: event.status,
        submissionTransactionId: hasSubmission ? `mock-transaction-seed-${event.position}` : null,
        submissionTransactionHash: hasSubmission
          ? `mock-transaction-hash-seed-${event.position}`
          : null,
        topicSequenceNumber: hasConsensus ? BigInt(100 + event.position) : null,
        consensusTimestamp: hasConsensus ? `1752847${event.position}.000000000` : null,
        runningHash: hasConsensus ? `mock-running-hash-${event.position}` : null,
        runningHashVersion: hasConsensus ? BigInt(3) : null,
        submittedAt: hasSubmission ? new Date('2026-07-18T14:30:00.000Z') : null,
        confirmedAt: hasConsensus ? new Date('2026-07-18T14:31:00.000Z') : null,
        supersedesAnchorId: index === 7 ? phaseFourEvents[6]!.anchorId : null,
        lastErrorCode:
          event.status === 'RETRYABLE_FAILURE'
            ? 'HEDERA_SUBMISSION_RETRYABLE'
            : event.status === 'PERMANENT_FAILURE'
              ? 'HEDERA_SUBMISSION_PERMANENT_FAILURE'
              : event.status === 'MISMATCH'
                ? 'HEDERA_MESSAGE_MISMATCH'
                : null,
        lastErrorMessage:
          event.status === 'RETRYABLE_FAILURE'
            ? 'Seeded transient provider outage'
            : event.status === 'PERMANENT_FAILURE'
              ? 'Seeded invalid topic configuration'
              : event.status === 'MISMATCH'
                ? 'Seeded Mirror message hash mismatch'
                : null,
      };
    }),
    skipDuplicates: true,
  });
  await database.hederaAnchorAttempt.createMany({
    data: phaseFourEvents.slice(1).map((event) => ({
      id: `00000000-0000-4000-8000-0000000023${String(event.position).padStart(2, '0')}`,
      anchorId: event.anchorId,
      attemptNumber: 1,
      operation: 'SUBMIT' as const,
      status:
        event.status === 'RETRYABLE_FAILURE' || event.status === 'PERMANENT_FAILURE'
          ? ('FAILED' as const)
          : ('SUCCEEDED' as const),
      provider: 'MOCK' as const,
      network: 'LOCAL' as const,
      startedAt: new Date('2026-07-18T14:29:00.000Z'),
      completedAt: new Date('2026-07-18T14:30:00.000Z'),
      transactionId:
        event.status === 'SUBMITTED' || event.status === 'CONFIRMED'
          ? `mock-transaction-seed-${event.position}`
          : null,
      errorCode:
        event.status === 'RETRYABLE_FAILURE'
          ? 'HEDERA_SUBMISSION_RETRYABLE'
          : event.status === 'PERMANENT_FAILURE'
            ? 'HEDERA_SUBMISSION_PERMANENT_FAILURE'
            : null,
      errorCategory: event.status.includes('FAILURE') ? 'SEEDED_FAILURE' : null,
      errorMessage: event.status.includes('FAILURE') ? 'Seeded operational example' : null,
      metadata: { seeded: true },
    })),
    skipDuplicates: true,
  });
  await database.anchorVerification.createMany({
    data: phaseFourEvents
      .filter((event) => ['CONFIRMED', 'MISMATCH', 'SUPERSEDED'].includes(event.status))
      .map((event) => ({
        id: `00000000-0000-4000-8000-0000000024${String(event.position).padStart(2, '0')}`,
        anchorId: event.anchorId,
        verificationType: 'AUTOMATIC' as const,
        status:
          event.status === 'MISMATCH'
            ? ('MISMATCH' as const)
            : event.status === 'SUPERSEDED'
              ? ('SUPERSEDED' as const)
              : ('VERIFIED' as const),
        calculatedPayloadHash: event.canonicalPayloadHash,
        expectedPayloadHash: event.canonicalPayloadHash,
        mirrorPayloadHash:
          event.status === 'MISMATCH' ? `sha256:${'f'.repeat(64)}` : event.canonicalPayloadHash,
        chainStatus: 'VALID' as const,
        verifiedAt: new Date('2026-07-18T14:32:00.000Z'),
        details: { seeded: true },
      })),
    skipDuplicates: true,
  });
  await database.hederaTopicCheckpoint.upsert({
    where: {
      provider_network_topicId: { provider: 'MOCK', network: 'LOCAL', topicId: '0.0.424242' },
    },
    update: { checkedAt: new Date('2026-07-18T14:35:00.000Z') },
    create: {
      provider: 'MOCK',
      network: 'LOCAL',
      topicId: '0.0.424242',
      lastSequenceNumber: BigInt(108),
      lastConsensusTimestamp: '17528478.000000000',
      checkedAt: new Date('2026-07-18T14:35:00.000Z'),
    },
  });

  await database.marketplaceListing.upsert({
    where: { id: ids.phaseFive.listing },
    update: {
      status: 'PARTIALLY_RESERVED',
      availableQuantity: '38.0000',
      expiresAt: new Date('2027-12-31T23:59:59.000Z'),
    },
    create: {
      id: ids.phaseFive.listing,
      publicId: 'lst1_local_parchment_2026',
      listingNumber: 'LST-KIS-2026-001',
      sellerOrganizationId: ids.cooperative,
      lotId: ids.phaseThree.lot,
      status: 'PARTIALLY_RESERVED',
      title: 'Rwenzori washed parchment coffee',
      description: 'Quality-approved cooperative lot available to verified buyers.',
      listedQuantity: '68.0000',
      availableQuantity: '38.0000',
      currency: 'UGX',
      pricingMethod: 'NEGOTIABLE',
      askingUnitPriceMinor: 1_250_000n,
      minimumOfferUnitPriceMinor: 1_100_000n,
      minimumOfferQuantity: '10.0000',
      allowPartialQuantity: true,
      visibility: 'PUBLIC_BUYERS',
      publishedAt: new Date('2026-07-19T08:00:00.000Z'),
      expiresAt: new Date('2027-12-31T23:59:59.000Z'),
      createdByUserId: ids.cooperativeAdmin,
      updatedByUserId: ids.cooperativeAdmin,
    },
  });
  await database.marketplaceListingVersion.createMany({
    data: [
      {
        id: ids.phaseFive.listingVersion,
        listingId: ids.phaseFive.listing,
        version: 1,
        status: 'PUBLISHED',
        title: 'Rwenzori washed parchment coffee',
        description: 'Quality-approved cooperative lot available to verified buyers.',
        listedQuantity: '68.0000',
        quantityUnit: 'KG',
        currency: 'UGX',
        pricingMethod: 'NEGOTIABLE',
        askingUnitPriceMinor: 1_250_000n,
        minimumOfferQuantity: '10.0000',
        allowPartialQuantity: true,
        visibility: 'PUBLIC_BUYERS',
        expiresAt: new Date('2027-12-31T23:59:59.000Z'),
        recordedByUserId: ids.cooperativeAdmin,
      },
    ],
    skipDuplicates: true,
  });
  await database.listingInvitation.upsert({
    where: { id: ids.phaseFive.invitation },
    update: { status: 'VIEWED', viewedAt: new Date('2026-07-19T09:00:00.000Z') },
    create: {
      id: ids.phaseFive.invitation,
      listingId: ids.phaseFive.listing,
      buyerOrganizationId: ids.recipientOrganization,
      status: 'VIEWED',
      invitedByUserId: ids.cooperativeAdmin,
      viewedAt: new Date('2026-07-19T09:00:00.000Z'),
      expiresAt: new Date('2027-12-31T23:59:59.000Z'),
    },
  });
  await database.offer.upsert({
    where: { id: ids.phaseFive.submittedOffer },
    update: { status: 'SUBMITTED', validUntil: new Date('2027-12-31T23:59:59.000Z') },
    create: {
      id: ids.phaseFive.submittedOffer,
      publicId: 'ofr1_local_submitted_2026',
      offerNumber: 'OFF-KCE-2026-001',
      listingId: ids.phaseFive.listing,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      roundNumber: 1,
      status: 'SUBMITTED',
      quantity: '15.0000',
      unitPriceMinor: 1_150_000n,
      currency: 'UGX',
      totalAmountMinor: 17_250_000n,
      deliveryTerm: 'Buyer pickup at cooperative warehouse',
      validUntil: new Date('2027-12-31T23:59:59.000Z'),
      submittedByUserId: ids.buyerUser,
    },
  });
  await database.offer.upsert({
    where: { id: ids.phaseFive.acceptedOffer },
    update: { status: 'ACCEPTED' },
    create: {
      id: ids.phaseFive.acceptedOffer,
      publicId: 'ofr1_local_accepted_2026',
      offerNumber: 'OFF-KCE-2026-002',
      listingId: ids.phaseFive.listing,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      roundNumber: 1,
      status: 'ACCEPTED',
      quantity: '30.0000',
      unitPriceMinor: 1_200_000n,
      currency: 'UGX',
      totalAmountMinor: 36_000_000n,
      deliveryTerm: 'Delivered to buyer warehouse',
      validUntil: new Date('2027-12-31T23:59:59.000Z'),
      submittedByUserId: ids.buyerUser,
      respondedByUserId: ids.cooperativeAdmin,
      respondedAt: new Date('2026-07-19T10:00:00.000Z'),
    },
  });
  await database.lotReservation.upsert({
    where: { id: ids.phaseFive.reservation },
    update: { status: 'CONTRACTED' },
    create: {
      id: ids.phaseFive.reservation,
      reservationNumber: 'RSV-KIS-2026-001',
      lotId: ids.phaseThree.lot,
      listingId: ids.phaseFive.listing,
      offerId: ids.phaseFive.acceptedOffer,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      quantity: '30.0000',
      status: 'CONTRACTED',
      expiresAt: new Date('2027-12-31T23:59:59.000Z'),
    },
  });
  await database.salesContract.upsert({
    where: { id: ids.phaseFive.contract },
    update: { status: 'ACTIVE' },
    create: {
      id: ids.phaseFive.contract,
      publicId: 'ctr1_local_active_2026',
      contractNumber: 'CTR-KIS-2026-001',
      listingId: ids.phaseFive.listing,
      offerId: ids.phaseFive.acceptedOffer,
      reservationId: ids.phaseFive.reservation,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      lotId: ids.phaseThree.lot,
      status: 'ACTIVE',
      quantity: '30.0000',
      unitPriceMinor: 1_200_000n,
      currency: 'UGX',
      totalAmountMinor: 36_000_000n,
      deliveryTerm: 'Delivered to buyer warehouse',
      paymentTerms: 'Payment and settlement are outside Phase 5.',
      qualityTerms: {
        sourceInspectionId: ids.phaseThree.inspection,
        maximumMoisture: '12.500000',
      },
      sellerApprovedByUserId: ids.cooperativeAdmin,
      sellerApprovedAt: new Date('2026-07-19T10:30:00.000Z'),
      buyerApprovedByUserId: ids.buyerUser,
      buyerApprovedAt: new Date('2026-07-19T11:00:00.000Z'),
      activatedAt: new Date('2026-07-19T11:00:00.000Z'),
    },
  });
  await database.salesOrder.upsert({
    where: { id: ids.phaseFive.order },
    update: { status: 'PENDING_FULFILLMENT' },
    create: {
      id: ids.phaseFive.order,
      publicId: 'ord1_local_pending_2026',
      orderNumber: 'ORD-KIS-2026-001',
      contractId: ids.phaseFive.contract,
      reservationId: ids.phaseFive.reservation,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      lotId: ids.phaseThree.lot,
      status: 'PENDING_FULFILLMENT',
      quantity: '30.0000',
      unitPriceMinor: 1_200_000n,
      currency: 'UGX',
      totalAmountMinor: 36_000_000n,
      fulfillmentMethod: 'Cooperative-arranged custody transfer',
      expectedDispatchAt: new Date('2026-07-21T08:00:00.000Z'),
    },
  });
  await database.orderStatusEvent.createMany({
    data: [
      {
        id: ids.phaseFive.orderStatusEvent,
        orderId: ids.phaseFive.order,
        toStatus: 'PENDING_FULFILLMENT',
        reasonCode: 'ORDER_CREATED',
        actorUserId: ids.cooperativeAdmin,
        actorOrganizationId: ids.cooperative,
        occurredAt: new Date('2026-07-19T11:05:00.000Z'),
        metadata: { seeded: true },
      },
    ],
    skipDuplicates: true,
  });
  await database.traceabilityShare.upsert({
    where: { id: ids.phaseFive.share },
    update: { status: 'ACTIVE', expiresAt: new Date('2027-12-31T23:59:59.000Z') },
    create: {
      id: ids.phaseFive.share,
      publicId: 'shr1_local_buyer_2026',
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      listingId: ids.phaseFive.listing,
      contractId: ids.phaseFive.contract,
      lotId: ids.phaseThree.lot,
      status: 'ACTIVE',
      scopes: ['LOT_SUMMARY', 'QUALITY_DETAILS', 'CUSTODY_DETAILS', 'TRACEABILITY_LINEAGE'],
      expiresAt: new Date('2027-12-31T23:59:59.000Z'),
      createdByUserId: ids.cooperativeAdmin,
    },
  });

  await database.marketplaceListing.upsert({
    where: { id: ids.phaseSix.listing },
    update: { status: 'CLOSED', availableQuantity: '0.0000' },
    create: {
      id: ids.phaseSix.listing,
      publicId: 'lst1_local_settled_2026',
      listingNumber: 'LST-KIS-2026-SETTLED',
      sellerOrganizationId: ids.cooperative,
      lotId: ids.phaseThree.lot,
      status: 'CLOSED',
      title: 'Historical settled parchment sale',
      listedQuantity: '30.0000',
      availableQuantity: '0.0000',
      currency: 'UGX',
      pricingMethod: 'FIXED_PRICE',
      askingUnitPriceMinor: 1_200_000n,
      allowPartialQuantity: false,
      visibility: 'PRIVATE',
      publishedAt: new Date('2026-07-01T08:00:00.000Z'),
      closedAt: new Date('2026-07-10T08:00:00.000Z'),
      createdByUserId: ids.cooperativeAdmin,
      updatedByUserId: ids.cooperativeAdmin,
    },
  });
  await database.offer.upsert({
    where: { id: ids.phaseSix.offer },
    update: { status: 'ACCEPTED' },
    create: {
      id: ids.phaseSix.offer,
      publicId: 'ofr1_local_settled_2026',
      offerNumber: 'OFF-KCE-2026-SETTLED',
      listingId: ids.phaseSix.listing,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      status: 'ACCEPTED',
      quantity: '30.0000',
      unitPriceMinor: 1_200_000n,
      currency: 'UGX',
      totalAmountMinor: 36_000_000n,
      deliveryTerm: 'Delivered to buyer warehouse',
      validUntil: new Date('2026-07-31T23:59:59.000Z'),
      submittedByUserId: ids.buyerUser,
      respondedByUserId: ids.cooperativeAdmin,
      respondedAt: new Date('2026-07-02T09:00:00.000Z'),
    },
  });
  await database.lotReservation.upsert({
    where: { id: ids.phaseSix.reservation },
    update: { status: 'CONSUMED' },
    create: {
      id: ids.phaseSix.reservation,
      reservationNumber: 'RSV-KIS-2026-SETTLED',
      lotId: ids.phaseThree.lot,
      listingId: ids.phaseSix.listing,
      offerId: ids.phaseSix.offer,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      quantity: '30.0000',
      status: 'CONSUMED',
      expiresAt: new Date('2026-07-31T23:59:59.000Z'),
      consumedAt: new Date('2026-07-10T08:00:00.000Z'),
    },
  });
  await database.salesContract.upsert({
    where: { id: ids.phaseSix.contract },
    update: { status: 'FULFILLED' },
    create: {
      id: ids.phaseSix.contract,
      publicId: 'ctr1_local_settled_2026',
      contractNumber: 'CTR-KIS-2026-SETTLED',
      listingId: ids.phaseSix.listing,
      offerId: ids.phaseSix.offer,
      reservationId: ids.phaseSix.reservation,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      lotId: ids.phaseThree.lot,
      status: 'FULFILLED',
      quantity: '30.0000',
      unitPriceMinor: 1_200_000n,
      currency: 'UGX',
      totalAmountMinor: 36_000_000n,
      deliveryTerm: 'Delivered to buyer warehouse',
      paymentTerms: 'External receipt followed by cooperative settlement.',
      qualityTerms: { sourceInspectionId: ids.phaseThree.inspection },
      sellerApprovedByUserId: ids.cooperativeAdmin,
      sellerApprovedAt: new Date('2026-07-02T10:00:00.000Z'),
      buyerApprovedByUserId: ids.buyerUser,
      buyerApprovedAt: new Date('2026-07-02T11:00:00.000Z'),
      activatedAt: new Date('2026-07-02T11:00:00.000Z'),
    },
  });
  await database.salesOrder.upsert({
    where: { id: ids.phaseSix.order },
    update: { status: 'COMPLETED' },
    create: {
      id: ids.phaseSix.order,
      publicId: 'ord1_local_settled_2026',
      orderNumber: 'ORD-KIS-2026-SETTLED',
      contractId: ids.phaseSix.contract,
      reservationId: ids.phaseSix.reservation,
      sellerOrganizationId: ids.cooperative,
      buyerOrganizationId: ids.recipientOrganization,
      lotId: ids.phaseThree.lot,
      status: 'COMPLETED',
      quantity: '30.0000',
      unitPriceMinor: 1_200_000n,
      currency: 'UGX',
      totalAmountMinor: 36_000_000n,
      fulfillmentMethod: 'Cooperative-arranged custody transfer',
      dispatchedAt: new Date('2026-07-05T08:00:00.000Z'),
      receivedAt: new Date('2026-07-08T08:00:00.000Z'),
      completedAt: new Date('2026-07-10T08:00:00.000Z'),
    },
  });
  await database.buyerAcceptance.createMany({
    data: [
      {
        id: ids.phaseSix.acceptance,
        orderId: ids.phaseSix.order,
        decision: 'ACCEPTED',
        acceptedQuantity: '30.0000',
        rejectedQuantity: '0.0000',
        decidedByUserId: ids.buyerUser,
        decidedAt: new Date('2026-07-10T07:30:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });
  await database.saleProceedsRecord.createMany({
    data: [
      {
        id: ids.phaseSix.proceeds,
        publicId: 'prc1_local_verified_2026',
        proceedsNumber: 'PRC-KIS-2026-001',
        organizationId: ids.cooperative,
        orderId: ids.phaseSix.order,
        contractId: ids.phaseSix.contract,
        buyerOrganizationId: ids.recipientOrganization,
        status: 'VERIFIED',
        currency: 'UGX',
        expectedAmountMinor: 36_000_000n,
        recordedAmountMinor: 36_000_000n,
        source: 'BANK_STATEMENT',
        externalReference: 'BANK-SEED-2026-001',
        valueDate: new Date('2026-07-11T00:00:00.000Z'),
        recordedByUserId: ids.financeOfficer,
        verifiedByUserId: ids.cooperativeAdmin,
        verifiedAt: new Date('2026-07-11T10:00:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });
  await database.deductionPolicy.createMany({
    data: [
      {
        id: ids.phaseSix.policy,
        organizationId: ids.cooperative,
        code: 'COOP-SERVICE-1PCT',
        name: 'Cooperative service contribution',
        description: 'One percent contribution approved for the seeded settlement.',
        type: 'PERCENTAGE',
        basis: 'GROSS_ENTITLEMENT',
        value: '1.00000000',
        priority: 100,
        status: 'ACTIVE',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        policyVersion: 1,
        createdByUserId: ids.financeOfficer,
        approvedByUserId: ids.cooperativeAdmin,
        approvedAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });
  await database.settlementRun.createMany({
    data: [
      {
        id: ids.phaseSix.settlement,
        publicId: 'stl1_local_approved_2026',
        settlementNumber: 'STL-KIS-2026-001',
        organizationId: ids.cooperative,
        status: 'APPROVED',
        currency: 'UGX',
        calculationVersion: 'lineage-proportional-v1',
        roundingPolicyVersion: 'largest-remainder-v1',
        sourceTotalMinor: 36_000_000n,
        grossAllocatedMinor: 36_000_000n,
        deductionsTotalMinor: 360_000n,
        netSettlementTotalMinor: 35_640_000n,
        lineageSnapshotHash: 'f'.repeat(64),
        calculationSnapshot: { seeded: true, lotId: ids.phaseThree.lot },
        calculatedAt: new Date('2026-07-12T08:00:00.000Z'),
        calculatedByUserId: ids.financeOfficer,
        submittedForApprovalAt: new Date('2026-07-12T09:00:00.000Z'),
        submittedByUserId: ids.financeOfficer,
        approvedAt: new Date('2026-07-12T10:00:00.000Z'),
        approvedByUserId: ids.cooperativeAdmin,
      },
    ],
    skipDuplicates: true,
  });
  await database.settlementRunOrder.createMany({
    data: [
      {
        id: ids.phaseSix.settlementOrder,
        settlementRunId: ids.phaseSix.settlement,
        orderId: ids.phaseSix.order,
        buyerAcceptanceId: ids.phaseSix.acceptance,
        saleProceedsRecordId: ids.phaseSix.proceeds,
        acceptedQuantity: '30.0000',
        allocatableAmountMinor: 36_000_000n,
        currency: 'UGX',
        sourceVersion: 1,
        acceptanceSourceVersion: 1,
      },
    ],
    skipDuplicates: true,
  });
  await database.settlementAllocation.createMany({
    data: [
      {
        id: ids.phaseSix.allocation,
        settlementRunId: ids.phaseSix.settlement,
        settlementRunOrderId: ids.phaseSix.settlementOrder,
        farmerId: ids.farmers[0],
        deliveryId: ids.deliveries.accepted,
        lotId: ids.phaseThree.lot,
        attributableQuantity: '30.0000',
        allocationRatioNumerator: 1n,
        allocationRatioDenominator: 1n,
        exactAmountRepresentation: '1/1',
        allocatedGrossAmountMinor: 36_000_000n,
        calculationMetadata: { algorithm: 'lineage-proportional-v1', seeded: true },
      },
    ],
    skipDuplicates: true,
  });
  await database.farmerSettlement.createMany({
    data: [
      {
        id: ids.phaseSix.farmerSettlement,
        publicId: 'fst1_local_paid_2026',
        farmerSettlementNumber: 'STL-KIS-2026-001-0001',
        settlementRunId: ids.phaseSix.settlement,
        organizationId: ids.cooperative,
        farmerId: ids.farmers[0],
        status: 'APPROVED',
        currency: 'UGX',
        grossEntitlementMinor: 36_000_000n,
        deductionsTotalMinor: 360_000n,
        netEntitlementMinor: 35_640_000n,
        statementVersion: 1,
        approvedAt: new Date('2026-07-12T10:00:00.000Z'),
        paymentStatus: 'PAID',
      },
    ],
    skipDuplicates: true,
  });
  await database.settlementDeduction.createMany({
    data: [
      {
        id: ids.phaseSix.deduction,
        farmerSettlementId: ids.phaseSix.farmerSettlement,
        deductionPolicyId: ids.phaseSix.policy,
        code: 'COOP-SERVICE-1PCT',
        description: 'Cooperative service contribution',
        basisAmountMinor: 36_000_000n,
        rate: '1.00000000',
        amountMinor: 360_000n,
        source: 'POLICY',
        approvedByUserId: ids.cooperativeAdmin,
      },
    ],
    skipDuplicates: true,
  });
  await database.settlementRunStatusEvent.createMany({
    data: [
      {
        id: ids.phaseSix.settlementStatus,
        settlementRunId: ids.phaseSix.settlement,
        fromStatus: 'PENDING_APPROVAL',
        toStatus: 'APPROVED',
        actorUserId: ids.cooperativeAdmin,
        actorOrganizationId: ids.cooperative,
        metadata: { seeded: true },
        occurredAt: new Date('2026-07-12T10:00:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });
  await database.farmerPaymentMethod.createMany({
    data: [
      {
        id: ids.phaseSix.paymentMethod,
        farmerId: ids.farmers[0],
        organizationId: ids.cooperative,
        type: 'MOBILE_MONEY',
        provider: 'manual',
        accountHolderName: 'Seeded Farmer',
        accountIdentifierEncrypted: 'v1.L78205SpPykV-ZLF.FCrxWXKsXmyd604ROGRf3g.Em8DkWLhuEZ7dFnR',
        accountIdentifierLast4: '3456',
        status: 'VERIFIED',
        isDefault: true,
        verifiedAt: new Date('2026-07-12T11:00:00.000Z'),
        verifiedByUserId: ids.cooperativeAdmin,
        createdByUserId: ids.financeOfficer,
      },
    ],
    skipDuplicates: true,
  });
  await database.farmerStatement.createMany({
    data: [
      {
        id: ids.phaseSix.statement,
        publicId: 'stm1_local_active_2026',
        statementNumber: 'STL-KIS-2026-001-0001-S1',
        farmerSettlementId: ids.phaseSix.farmerSettlement,
        version: 1,
        issuedAt: new Date('2026-07-12T12:00:00.000Z'),
        issuedByUserId: ids.financeOfficer,
        checksum: `sha256:${'e'.repeat(64)}`,
      },
    ],
    skipDuplicates: true,
  });
  await database.paymentInstruction.createMany({
    data: [
      {
        id: ids.phaseSix.paymentInstruction,
        publicId: 'pay1_local_completed_2026',
        instructionNumber: 'PAY-KIS-2026-001',
        organizationId: ids.cooperative,
        farmerSettlementId: ids.phaseSix.farmerSettlement,
        farmerId: ids.farmers[0],
        paymentMethodId: ids.phaseSix.paymentMethod,
        status: 'COMPLETED',
        currency: 'UGX',
        amountMinor: 35_640_000n,
        provider: 'manual',
        idempotencyKey: 'seed-payment-kis-2026-001',
        createdByUserId: ids.financeOfficer,
        approvedByUserId: ids.cooperativeAdmin,
        approvedAt: new Date('2026-07-13T08:00:00.000Z'),
        submittedAt: new Date('2026-07-13T09:00:00.000Z'),
        completedAt: new Date('2026-07-14T10:00:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });
  await database.paymentAttempt.createMany({
    data: [
      {
        id: ids.phaseSix.paymentAttempt,
        paymentInstructionId: ids.phaseSix.paymentInstruction,
        attemptNumber: 1,
        provider: 'manual',
        status: 'SUCCESSFUL',
        providerRequestReference: 'manual-seed-payment-kis-2026-001',
        submittedAt: new Date('2026-07-13T09:00:00.000Z'),
        confirmedAt: new Date('2026-07-14T10:00:00.000Z'),
        metadata: { seeded: true },
      },
    ],
    skipDuplicates: true,
  });
  await database.paymentReconciliation.createMany({
    data: [
      {
        id: ids.phaseSix.reconciliation,
        organizationId: ids.cooperative,
        paymentInstructionId: ids.phaseSix.paymentInstruction,
        paymentAttemptId: ids.phaseSix.paymentAttempt,
        source: 'MANUAL',
        externalReference: 'BANK-PAYOUT-SEED-2026-001',
        currency: 'UGX',
        amountMinor: 35_640_000n,
        valueDate: new Date('2026-07-14T00:00:00.000Z'),
        status: 'CONFIRMED',
        evidenceMetadata: {
          documentChecksum: 'd'.repeat(64),
          storageReference: 'seed-evidence-001',
        },
        matchedByUserId: ids.financeOfficer,
        reviewedByUserId: ids.cooperativeAdmin,
        reviewedAt: new Date('2026-07-14T10:00:00.000Z'),
        notes: 'Seeded evidence-backed manual reconciliation.',
      },
    ],
    skipDuplicates: true,
  });

  const readinessGates = [
    {
      id: ids.phaseSeven.securityGate,
      code: 'SECURITY_DEPENDENCY_REVIEW',
      name: 'Security and dependency review',
      description: 'Production dependency advisories and security controls require review.',
      category: 'SECURITY' as const,
      status: 'BLOCKED' as const,
      riskLevel: 'CRITICAL' as const,
      humanReviewRequired: false,
      notes: 'Blocked until critical and high production advisories are remediated or accepted.',
    },
    {
      id: ids.phaseSeven.legalGate,
      code: 'UGANDA_LEGAL_REVIEW',
      name: 'Uganda legal and regulatory review',
      description: 'Qualified counsel must review privacy, payments, records, and pilot terms.',
      category: 'LEGAL_REGULATORY' as const,
      status: 'BLOCKED' as const,
      riskLevel: 'CRITICAL' as const,
      humanReviewRequired: true,
      notes: 'Development placeholder only. This seed is not legal approval.',
    },
    {
      id: ids.phaseSeven.trainingGate,
      code: 'PILOT_OPERATOR_TRAINING',
      name: 'Pilot operator training',
      description: 'Named pilot operators must complete role-specific training and exercises.',
      category: 'TRAINING' as const,
      status: 'IN_PROGRESS' as const,
      riskLevel: 'HIGH' as const,
      humanReviewRequired: true,
      notes: 'No completion is inferred from development fixtures.',
    },
  ];
  for (const gate of readinessGates) {
    await database.pilotReadinessGate.upsert({
      where: { id: gate.id },
      update: {
        status: gate.status,
        riskLevel: gate.riskLevel,
        notes: gate.notes,
        evidence: { seeded: true, approval: false },
      },
      create: {
        ...gate,
        blocking: true,
        ownerUserId: ids.platformAdmin,
        evidence: { seeded: true, approval: false },
      },
    });
  }
  await database.pilotReadinessGateStatusEvent.createMany({
    data: [
      {
        id: ids.phaseSeven.securityGateEvent,
        readinessGateId: ids.phaseSeven.securityGate,
        toStatus: 'BLOCKED',
        actorUserId: ids.platformAdmin,
        evidence: { seeded: true, approval: false },
        riskNotes: 'Critical and high advisories require triage.',
      },
      {
        id: ids.phaseSeven.legalGateEvent,
        readinessGateId: ids.phaseSeven.legalGate,
        toStatus: 'BLOCKED',
        actorUserId: ids.platformAdmin,
        evidence: { seeded: true, approval: false },
        riskNotes: 'External counsel review has not been recorded.',
      },
      {
        id: ids.phaseSeven.trainingGateEvent,
        readinessGateId: ids.phaseSeven.trainingGate,
        toStatus: 'IN_PROGRESS',
        actorUserId: ids.platformAdmin,
        evidence: { seeded: true, approval: false },
      },
    ],
    skipDuplicates: true,
  });
  await database.dataRetentionPolicy.upsert({
    where: { id: ids.phaseSeven.retentionPolicy },
    update: { status: 'DRAFT' },
    create: {
      id: ids.phaseSeven.retentionPolicy,
      organizationId: ids.cooperative,
      dataCategory: 'OPERATIONAL_LOGS',
      retentionDays: 90,
      archiveAfterDays: 30,
      deletionMode: 'DELETE',
      status: 'DRAFT',
      policyVersion: 1,
      effectiveFrom: new Date('2026-07-20T00:00:00.000Z'),
      createdByUserId: ids.platformAdmin,
    },
  });
  await database.dataRetentionDryRun.createMany({
    data: [
      {
        id: ids.phaseSeven.retentionDryRun,
        dataRetentionPolicyId: ids.phaseSeven.retentionPolicy,
        policyVersion: 1,
        blockedByLegalHold: 0,
        immutableRecordsRetained: 12,
        report: { seeded: true, destructiveExecution: false, evaluatedRecords: 12 },
      },
    ],
    skipDuplicates: true,
  });
  await database.dataSubjectRequest.upsert({
    where: { id: ids.phaseSeven.privacyRequest },
    update: { status: 'IN_REVIEW' },
    create: {
      id: ids.phaseSeven.privacyRequest,
      publicId: 'dsr1_local_review_2026',
      organizationId: ids.cooperative,
      subjectType: 'FARMER',
      farmerId: ids.farmers[0],
      requestType: 'ACCESS',
      status: 'IN_REVIEW',
      identityVerifiedAt: new Date('2026-07-20T08:00:00.000Z'),
      assignedToUserId: ids.cooperativeAdmin,
      notes: 'Synthetic development privacy request.',
    },
  });
  await database.operationalIncident.upsert({
    where: { id: ids.phaseSeven.incident },
    update: { status: 'MONITORING' },
    create: {
      id: ids.phaseSeven.incident,
      incidentNumber: 'INC-LOCAL-2026-001',
      title: 'Synthetic Redis interruption exercise',
      description: 'Development-only degraded dependency exercise.',
      category: 'AVAILABILITY',
      severity: 'SEV3',
      status: 'MONITORING',
      organizationId: ids.cooperative,
      detectedAt: new Date('2026-07-20T09:00:00.000Z'),
      acknowledgedAt: new Date('2026-07-20T09:05:00.000Z'),
      ownerUserId: ids.platformAdmin,
      reportedByUserId: ids.cooperativeAdmin,
      impactSummary: 'Synthetic queue processing delay; PostgreSQL remained authoritative.',
    },
  });
  await database.backupVerificationRecord.upsert({
    where: { id: ids.phaseSeven.backup },
    update: { status: 'VERIFIED' },
    create: {
      id: ids.phaseSeven.backup,
      backupType: 'postgresql-logical-development',
      environment: 'development',
      backupReference: 'local-seed-backup-2026-07-20',
      startedAt: new Date('2026-07-20T06:00:00.000Z'),
      completedAt: new Date('2026-07-20T06:02:00.000Z'),
      status: 'VERIFIED',
      sizeBytes: 1024n,
      encrypted: false,
      restoreTestedAt: new Date('2026-07-20T06:15:00.000Z'),
      restoreStatus: 'PASSED',
      recoveryPointObjectiveMet: true,
      recoveryTimeObjectiveMet: true,
      verifiedByUserId: ids.platformAdmin,
      notes: 'Synthetic development evidence; not a production backup attestation.',
    },
  });
  await database.notificationDelivery.upsert({
    where: { id: ids.phaseSeven.notification },
    update: { status: 'DELIVERED' },
    create: {
      id: ids.phaseSeven.notification,
      organizationId: ids.cooperative,
      recipientType: 'FARMER',
      recipientReference: ids.farmers[0],
      channel: 'SMS',
      templateCode: 'PAYMENT_RECONCILED',
      templateVersion: 1,
      parameters: { amountMinor: '35640000', currency: 'UGX' },
      status: 'DELIVERED',
      provider: 'mock',
      providerReference: 'mock-local-notification-001',
      deduplicationKey: 'seed-payment-reconciled-001',
      attemptCount: 1,
      submittedAt: new Date('2026-07-20T10:00:00.000Z'),
      deliveredAt: new Date('2026-07-20T10:00:01.000Z'),
    },
  });
  await database.featureFlag.upsert({
    where: { id: ids.phaseSeven.featureFlag },
    update: { enabled: false, reason: 'Real providers remain disabled for development and CI.' },
    create: {
      id: ids.phaseSeven.featureFlag,
      key: 'providers.real-submission',
      scope: 'PLATFORM',
      enabled: false,
      highRisk: true,
      reason: 'Real providers remain disabled for development and CI.',
      changedByUserId: ids.platformAdmin,
    },
  });
  const pilotFixtures = [
    {
      id: ids.phaseEight.draftPilot,
      publicId: 'pilot_local_draft_2026',
      code: 'SYNTH-DRAFT-2026',
      name: 'Synthetic draft pilot',
      status: 'DRAFT' as const,
      district: 'Synthetic District A',
      plannedStartDate: new Date('2026-08-03T00:00:00.000Z'),
      plannedEndDate: new Date('2026-09-30T00:00:00.000Z'),
    },
    {
      id: ids.phaseEight.blockedPilot,
      publicId: 'pilot_local_blocked_2026',
      code: 'SYNTH-BLOCKED-2026',
      name: 'Synthetic blocked pilot',
      status: 'BLOCKED' as const,
      district: 'Synthetic District B',
      plannedStartDate: new Date('2026-08-10T00:00:00.000Z'),
      plannedEndDate: new Date('2026-10-09T00:00:00.000Z'),
    },
    {
      id: ids.phaseEight.supervisedPilot,
      publicId: 'pilot_local_supervised_2026',
      code: 'SYNTH-SUPERVISED-2026',
      name: 'Synthetic supervised-use pilot',
      status: 'SUPERVISED_LIVE_USE' as const,
      district: 'Synthetic District C',
      plannedStartDate: new Date('2026-07-20T00:00:00.000Z'),
      plannedEndDate: new Date('2026-09-18T00:00:00.000Z'),
    },
  ];
  for (const pilot of pilotFixtures) {
    await database.pilot.upsert({
      where: { id: pilot.id },
      update: { name: pilot.name, status: pilot.status },
      create: {
        ...pilot,
        organizationId: ids.cooperative,
        crop: 'COFFEE',
        region: 'Synthetic Central Region',
        targetFarmerCount: 25,
        targetAgentCount: 2,
        targetCollectionPointCount: 1,
        targetBuyerCount: 1,
        paymentMode: 'MOCK',
        hederaMode: 'MOCK',
        smsMode: 'MOCK',
        supportModel: 'Synthetic local support workflow; no real contacts or provider escalation.',
        environmentLabel: 'LOCAL SYNTHETIC PILOT',
        createdByUserId: ids.platformAdmin,
      },
    });
  }
  await database.pilotStatusEvent.createMany({
    data: [
      {
        id: ids.phaseEight.draftStatus,
        pilotId: ids.phaseEight.draftPilot,
        toStatus: 'DRAFT',
        actorUserId: ids.platformAdmin,
        evidence: { synthetic: true },
      },
      {
        id: ids.phaseEight.blockedStatus,
        pilotId: ids.phaseEight.blockedPilot,
        toStatus: 'BLOCKED',
        actorUserId: ids.platformAdmin,
        evidence: { synthetic: true, externalApproval: false },
        reason: 'Synthetic legal and provider blockers remain open.',
      },
      {
        id: ids.phaseEight.supervisedStatus,
        pilotId: ids.phaseEight.supervisedPilot,
        toStatus: 'SUPERVISED_LIVE_USE',
        actorUserId: ids.platformAdmin,
        evidence: { synthetic: true, fieldCompletionClaimed: false },
      },
    ],
    skipDuplicates: true,
  });
  await database.pilotConfiguration.upsert({
    where: { pilotId: ids.phaseEight.supervisedPilot },
    update: { offlineSnapshotLimit: 250, maxSynchronizationBatch: 50 },
    create: {
      id: ids.phaseEight.configuration,
      pilotId: ids.phaseEight.supervisedPilot,
      allowedCommodityFormIds: [ids.coffeeForms.cherry],
      enabledFeatureFlags: [],
      languages: ['en-UG', 'lg-UG'],
      supportHours: { timezone: 'Africa/Kampala', schedule: 'synthetic-not-committed' },
      baselinePeriodStart: new Date('2026-07-20T00:00:00.000Z'),
      baselinePeriodEnd: new Date('2026-07-26T00:00:00.000Z'),
      activeUsePeriodStart: new Date('2026-07-27T00:00:00.000Z'),
      activeUsePeriodEnd: new Date('2026-09-11T00:00:00.000Z'),
      evaluationPeriodStart: new Date('2026-09-12T00:00:00.000Z'),
      evaluationPeriodEnd: new Date('2026-09-18T00:00:00.000Z'),
      dataRetentionPolicyId: ids.phaseSeven.retentionPolicy,
      offlineSnapshotLimit: 250,
      maxSynchronizationBatch: 50,
      incidentContacts: [{ role: 'synthetic-platform-admin', userId: ids.platformAdmin }],
      escalationPolicy: { synthetic: true, realContactsConfigured: false },
      changedByUserId: ids.platformAdmin,
    },
  });
  const participants = [
    {
      id: ids.phaseEight.farmerParticipant,
      participantType: 'FARMER' as const,
      farmerId: ids.farmers[0],
      userId: null,
      organizationId: ids.cooperative,
      trainingRequired: false,
    },
    {
      id: ids.phaseEight.agentParticipant,
      participantType: 'COLLECTION_AGENT' as const,
      farmerId: null,
      userId: ids.collectionAgent,
      organizationId: ids.cooperative,
      trainingRequired: true,
    },
    {
      id: ids.phaseEight.adminParticipant,
      participantType: 'COOPERATIVE_ADMIN' as const,
      farmerId: null,
      userId: ids.cooperativeAdmin,
      organizationId: ids.cooperative,
      trainingRequired: true,
    },
    {
      id: ids.phaseEight.buyerParticipant,
      participantType: 'BUYER_USER' as const,
      farmerId: null,
      userId: ids.buyerUser,
      organizationId: ids.recipientOrganization,
      trainingRequired: true,
    },
  ];
  for (const participant of participants) {
    await database.pilotParticipant.upsert({
      where: { id: participant.id },
      update: { status: 'ENROLLED' },
      create: {
        ...participant,
        pilotId: ids.phaseEight.supervisedPilot,
        collectionPointId:
          participant.participantType === 'BUYER_USER' ? null : ids.collectionPoint,
        status: 'ENROLLED',
        consentVerifiedAt:
          participant.participantType === 'FARMER' ? new Date('2026-07-20T08:00:00.000Z') : null,
      },
    });
  }
  await database.pilotCollectionPoint.upsert({
    where: {
      pilotId_collectionPointId: {
        pilotId: ids.phaseEight.supervisedPilot,
        collectionPointId: ids.collectionPoint,
      },
    },
    update: { status: 'ACTIVE' },
    create: {
      id: ids.phaseEight.collectionPoint,
      pilotId: ids.phaseEight.supervisedPilot,
      collectionPointId: ids.collectionPoint,
      status: 'ACTIVE',
      activatedAt: new Date('2026-07-20T08:00:00.000Z'),
      readinessNotes: 'Synthetic local fixture only.',
    },
  });
  await database.pilotDeviceAssignment.upsert({
    where: { pilotId_deviceId: { pilotId: ids.phaseEight.supervisedPilot, deviceId: ids.device } },
    update: { status: 'ACTIVE' },
    create: {
      id: ids.phaseEight.deviceAssignment,
      pilotId: ids.phaseEight.supervisedPilot,
      deviceId: ids.device,
      assignedUserId: ids.collectionAgent,
      collectionPointId: ids.collectionPoint,
      status: 'ACTIVE',
      lastInspectionAt: new Date('2026-07-20T08:15:00.000Z'),
      conditionNotes: 'Synthetic device assignment.',
    },
  });
  await database.trainingModule.upsert({
    where: { id: ids.phaseEight.trainingModule },
    update: { status: 'DRAFT', reviewed: false },
    create: {
      id: ids.phaseEight.trainingModule,
      code: 'SYNTH_OFFLINE_COLLECTION',
      title: 'Synthetic offline collection practice',
      description: 'Development-only training content placeholder.',
      audience: 'COLLECTION_AGENT',
      language: 'en-UG',
      version: 1,
      status: 'DRAFT',
      contentReference: 'docs://synthetic/not-human-reviewed',
      estimatedMinutes: 30,
      requiresAssessment: true,
      passingScore: 80,
      reviewed: false,
    },
  });
  await database.trainingAssignment.upsert({
    where: {
      participantId_trainingModuleId: {
        participantId: ids.phaseEight.agentParticipant,
        trainingModuleId: ids.phaseEight.trainingModule,
      },
    },
    update: { status: 'ASSIGNED' },
    create: {
      id: ids.phaseEight.trainingAssignment,
      pilotId: ids.phaseEight.supervisedPilot,
      participantId: ids.phaseEight.agentParticipant,
      trainingModuleId: ids.phaseEight.trainingModule,
      status: 'ASSIGNED',
      notes: 'Synthetic assignment; does not represent completed field training.',
    },
  });
  await database.pilotMetricDefinition.upsert({
    where: { id: ids.phaseEight.metricDefinition },
    update: { active: true },
    create: {
      id: ids.phaseEight.metricDefinition,
      code: 'receipt_issue_seconds',
      name: 'Receipt issue time',
      description: 'Synthetic workflow duration measurement.',
      purpose: 'Exercise pilot metric review.',
      unit: 'seconds',
      dataSource: 'synthetic scripted workflow',
      calculation: 'median synthetic observation duration',
      population: 'synthetic transactions only',
      timeWindow: 'weekly',
      privacyClassification: 'INTERNAL',
      reviewOwner: 'platform-operations',
      target: '60',
      warningThreshold: '90',
      criticalThreshold: '120',
      metricVersion: 1,
    },
  });
  await database.pilotBaselineMetric.upsert({
    where: { id: ids.phaseEight.baseline },
    update: { decimalValue: '95.000000' },
    create: {
      id: ids.phaseEight.baseline,
      pilotId: ids.phaseEight.supervisedPilot,
      metricCode: 'receipt_issue_seconds',
      metricVersion: 1,
      valueType: 'DECIMAL',
      decimalValue: '95.000000',
      unit: 'seconds',
      measurementPeriodStart: new Date('2026-07-20T08:00:00.000Z'),
      measurementPeriodEnd: new Date('2026-07-20T09:00:00.000Z'),
      source: 'synthetic scripted baseline',
      evidenceReference: 'local://synthetic/baseline/receipt-issue',
      collectedByUserId: ids.cooperativeAdmin,
      verifiedByUserId: ids.platformAdmin,
      verifiedAt: new Date('2026-07-20T10:00:00.000Z'),
    },
  });
  await database.pilotMetricObservation.upsert({
    where: { id: ids.phaseEight.observation },
    update: { decimalValue: '72.000000' },
    create: {
      id: ids.phaseEight.observation,
      pilotId: ids.phaseEight.supervisedPilot,
      metricCode: 'receipt_issue_seconds',
      metricVersion: 1,
      periodStart: new Date('2026-07-27T08:00:00.000Z'),
      periodEnd: new Date('2026-07-27T09:00:00.000Z'),
      valueType: 'DECIMAL',
      decimalValue: '72.000000',
      unit: 'seconds',
      source: 'synthetic scripted workflow',
      calculationMetadata: { synthetic: true, sampleSize: 3 },
      generatedAutomatically: true,
      dataQuality: 'PARTIAL',
      reviewStatus: 'UNREVIEWED',
    },
  });
  await database.pilotFieldObservation.upsert({
    where: { id: ids.phaseEight.fieldObservation },
    update: { followUpRequired: true },
    create: {
      id: ids.phaseEight.fieldObservation,
      pilotId: ids.phaseEight.supervisedPilot,
      task: 'OFFLINE_DELIVERY_CAPTURE',
      outcome: 'SYNTHETIC_ASSISTED_COMPLETION',
      durationSeconds: 85,
      assistanceRequired: true,
      errorType: 'SIMULATED_CONNECTIVITY_LOSS',
      connectivityCondition: 'SIMULATED_OFFLINE',
      deviceType: 'LOCAL_TEST_DEVICE',
      language: 'en-UG',
      notes: 'Synthetic evidence only; no real participant observation.',
      severity: 'LOW',
      followUpRequired: true,
      observedByUserId: ids.platformAdmin,
      observedAt: new Date('2026-07-27T09:15:00.000Z'),
    },
  });
  await database.pilotFeedback.upsert({
    where: { id: ids.phaseEight.feedback },
    update: { status: 'TRIAGED' },
    create: {
      id: ids.phaseEight.feedback,
      pilotId: ids.phaseEight.supervisedPilot,
      respondentType: 'COLLECTION_AGENT',
      category: 'OFFLINE_SYNC',
      rating: 3,
      message: 'Synthetic feedback: retry state needed clearer wording.',
      language: 'en-UG',
      channel: 'ASSISTED',
      anonymous: true,
      consentToContact: false,
      status: 'TRIAGED',
      assignedToUserId: ids.cooperativeAdmin,
      submittedAt: new Date('2026-07-27T09:30:00.000Z'),
    },
  });
  await database.pilotSupportCase.upsert({
    where: { id: ids.phaseEight.supportCase },
    update: { status: 'IN_PROGRESS' },
    create: {
      id: ids.phaseEight.supportCase,
      caseNumber: 'SYNTH-SUP-2026-001',
      pilotId: ids.phaseEight.supervisedPilot,
      organizationId: ids.cooperative,
      participantId: ids.phaseEight.agentParticipant,
      category: 'OFFLINE_SYNC',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      title: 'Synthetic retry-state question',
      description: 'Development fixture; no real support request.',
      assignedToUserId: ids.cooperativeAdmin,
      openedAt: new Date('2026-07-27T09:35:00.000Z'),
      firstResponseAt: new Date('2026-07-27T09:40:00.000Z'),
    },
  });
  await database.pilotDecision.createMany({
    data: [
      {
        id: ids.phaseEight.decision,
        pilotId: ids.phaseEight.supervisedPilot,
        decision: 'CONDITIONAL_GO',
        decisionVersion: 1,
        summary: 'Synthetic unapproved recommendation for exercising evaluation views.',
        evidenceSnapshotHash: `sha256:${'0'.repeat(64)}`,
        strengths: ['Synthetic offline path exercised'],
        risks: ['No real field evidence', 'External approvals absent'],
        blockingIssues: ['Legal review not recorded', 'Training not human-approved'],
        conditions: ['Human review required before any real pilot'],
        decidedByUserId: ids.cooperativeAdmin,
        approvedByUserId: null,
        approvedAt: null,
        decidedAt: new Date('2026-07-28T10:00:00.000Z'),
        nextReviewAt: new Date('2026-08-04T10:00:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });
} finally {
  await database.$disconnect();
}
