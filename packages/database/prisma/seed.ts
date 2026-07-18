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
    await database.deliveryMeasurement.upsert({
      where: { deliveryId_measurementType: { deliveryId: delivery.id, measurementType: 'WEIGHT' } },
      update: { netQuantity: delivery.netQuantity },
      create: {
        deliveryId: delivery.id,
        measurementType: 'WEIGHT',
        netQuantity: delivery.netQuantity,
        unit: 'KG',
        captureMethod: 'MANUAL',
        capturedByUserId: ids.collectionAgent,
        capturedAt: delivery.clientCreatedAt,
      },
    });
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

  const outboxEvents = [
    {
      id: '00000000-0000-4000-8000-000000000e01',
      aggregateId: ids.deliveries.accepted,
      eventType: 'delivery.accepted',
      payload: { deliveryId: ids.deliveries.accepted, organizationId: ids.cooperative, version: 1 },
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
} finally {
  await database.$disconnect();
}
