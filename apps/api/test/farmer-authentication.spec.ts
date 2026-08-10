import 'reflect-metadata';

import { createHmac } from 'node:crypto';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createDatabaseClient } from '@clycites/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

const database = createDatabaseClient();
const organizationId = '00000000-0000-4000-8000-000000000201';
const secondOrganizationId = '00000000-0000-4000-8000-000000000202';
const administratorId = '00000000-0000-4000-8000-000000000102';
const collectionAgentId = '00000000-0000-4000-8000-000000000103';
const farmerId = '00000000-0000-4000-8000-000000009601';
const farmId = '00000000-0000-4000-8000-000000009602';
const qrIdentityId = '00000000-0000-4000-8000-000000009603';
const otherFarmerDeliveryId = '00000000-0000-4000-8000-000000000a01';
const retiredFarmerId = '00000000-0000-4000-8000-000000009610';
const unsafeFarmerIds = [
  '00000000-0000-4000-8000-000000009611',
  '00000000-0000-4000-8000-000000009612',
];
const selfDeliveryIds = [
  '00000000-0000-4000-8000-000000009620',
  '00000000-0000-4000-8000-000000009621',
];
const secondCollectionPointId = '00000000-0000-4000-8000-000000009622';
const secondDeviceId = '00000000-0000-4000-8000-000000009623';
const secondCollectionSessionId = '00000000-0000-4000-8000-000000009624';
const farmerNumber = 'WP6-FARMER-0001';
const farmerEmail = 'wp6.farmer@clycites.local';
const farmerPhone = '+256772123456';
const staffPassword = process.env.SEED_STAFF_PASSWORD ?? 'ClyCites-local-2026!';
let currentFarmerPassword = 'harvest9';

describe.sequential('Farmer authentication API', () => {
  let app: INestApplication;
  let farmerUserId: string | undefined;
  let invitationId: string | undefined;
  let resetId: string | undefined;
  let retiredFarmerUserId: string | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    await database.farmer.create({
      data: {
        id: farmerId,
        farmerNumber,
        firstName: 'WP6',
        lastName: 'Farmer',
        primaryPhone: '0772123456',
        email: farmerEmail,
        district: 'Kasese',
        status: 'ACTIVE',
        registeredByUserId: administratorId,
        organizationMemberships: {
          create: { organizationId, status: 'ACTIVE', joinedAt: new Date() },
        },
      },
    });
  });

  afterAll(async () => {
    const user = await database.user.findUnique({
      where: { username: farmerNumber.toLowerCase() },
    });
    farmerUserId ??= user?.id;
    if (farmerUserId) {
      const sessions = await database.session.findMany({
        where: { userId: farmerUserId },
        select: { id: true },
      });
      await database.auditEvent.deleteMany({
        where: {
          OR: [
            { actorUserId: farmerUserId },
            { entityId: { in: sessions.map(({ id }) => id) } },
            ...(invitationId ? [{ entityId: invitationId }] : []),
          ],
        },
      });
      await database.session.deleteMany({ where: { userId: farmerUserId } });
      await database.userInvitation.deleteMany({ where: { userId: farmerUserId } });
      await database.notificationDelivery.deleteMany({
        where: { recipientReference: farmerUserId },
      });
    }
    if (resetId) {
      await database.auditEvent.deleteMany({ where: { entityId: resetId } });
      await database.farmerAccountReset.deleteMany({ where: { id: resetId } });
    }
    await database.dataSubjectRequest.deleteMany({ where: { farmerId } });
    await database.delivery.deleteMany({ where: { id: { in: selfDeliveryIds } } });
    await database.collectionSession.deleteMany({ where: { id: secondCollectionSessionId } });
    await database.registeredDevice.deleteMany({ where: { id: secondDeviceId } });
    await database.collectionPoint.deleteMany({ where: { id: secondCollectionPointId } });
    await database.farmerConsent.deleteMany({ where: { farmerId } });
    await database.farmerQrIdentity.deleteMany({ where: { farmerId } });
    await database.farm.deleteMany({ where: { farmerId } });
    if (farmerUserId) {
      await database.organizationMembership.deleteMany({ where: { userId: farmerUserId } });
    }
    await database.organizationMembership.deleteMany({
      where: { organizationId: secondOrganizationId, userId: collectionAgentId },
    });
    if (retiredFarmerUserId) {
      await database.auditEvent.deleteMany({ where: { actorUserId: retiredFarmerUserId } });
      await database.userInvitation.deleteMany({ where: { userId: retiredFarmerUserId } });
    }
    await database.retiredIdentifier.deleteMany({ where: { userId: administratorId } });
    await database.farmerOrganizationMembership.deleteMany({
      where: { farmerId: { in: [retiredFarmerId, ...unsafeFarmerIds] } },
    });
    await database.farmer.deleteMany({
      where: { id: { in: [retiredFarmerId, ...unsafeFarmerIds] } },
    });
    if (retiredFarmerUserId) {
      await database.user.deleteMany({ where: { id: retiredFarmerUserId } });
    }
    await database.farmerOrganizationMembership.deleteMany({ where: { farmerId } });
    await database.farmer.deleteMany({ where: { id: farmerId } });
    if (farmerUserId) await database.user.deleteMany({ where: { id: farmerUserId } });
    await app.close();
    await database.$disconnect();
  });

  it('provisions and activates a farmer without creating a staff membership', async () => {
    const administrator = await login('cooperative.admin@clycites.local', staffPassword);
    const provisioned = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/farmers/${farmerId}/account`)
      .set('authorization', `Bearer ${administrator.accessToken}`)
      .send({})
      .expect(201);

    invitationId = provisioned.body.data.id as string;
    const invitation = await database.userInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      include: { user: true },
    });
    farmerUserId = invitation.userId;
    expect(invitation.user).toMatchObject({
      username: farmerNumber.toLowerCase(),
      email: farmerEmail,
      phone: farmerPhone,
      status: 'INVITED',
      accountClass: 'FARMER',
      passwordHash: null,
    });
    expect(
      await database.organizationMembership.count({ where: { userId: invitation.userId } }),
    ).toBe(0);

    await request(app.getHttpServer())
      .post('/api/v1/auth/invitations/accept')
      .send({ token: provisioned.body.data.activationCode, password: currentFarmerPassword })
      .expect(200);
  });

  it.each([farmerNumber.toLowerCase(), farmerEmail, '0772123456', '+256772123456', '256772123456'])(
    'authenticates the same farmer with identifier %s',
    async (identifier) => {
      const authenticated = await login(identifier, currentFarmerPassword);
      expect(authenticated.user).toMatchObject({
        id: farmerUserId,
        username: farmerNumber.toLowerCase(),
        email: farmerEmail,
        phone: farmerPhone,
      });
    },
  );

  it('keeps every subject-scoped route bound to the farmer even for a dual-role admin', async () => {
    if (!farmerUserId) throw new Error('Farmer user was not provisioned');
    await database.organizationMembership.create({
      data: {
        organizationId,
        userId: farmerUserId,
        role: 'COOPERATIVE_ADMIN',
        status: 'ACTIVE',
        invitedByUserId: administratorId,
        joinedAt: new Date(),
      },
    });
    await database.organizationMembership.create({
      data: {
        organizationId: secondOrganizationId,
        userId: collectionAgentId,
        role: 'COLLECTION_AGENT',
        status: 'ACTIVE',
        invitedByUserId: administratorId,
        joinedAt: new Date(),
      },
    });
    const secondFarmerMembership = await database.farmerOrganizationMembership.create({
      data: {
        farmerId,
        organizationId: secondOrganizationId,
        membershipNumber: 'WP6-SECOND-ORG',
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    await database.collectionPoint.create({
      data: {
        id: secondCollectionPointId,
        organizationId: secondOrganizationId,
        name: 'WP6 Second Cooperative Point',
        code: 'WP6-SECOND',
        district: 'Kasese',
        latitude: '0.081000',
        longitude: '29.721000',
      },
    });
    await database.registeredDevice.create({
      data: {
        id: secondDeviceId,
        organizationId: secondOrganizationId,
        assignedUserId: collectionAgentId,
        devicePublicId: 'wp6-second-cooperative-device',
        name: 'WP6 second cooperative device',
        platform: 'WEB',
      },
    });
    await database.collectionSession.create({
      data: {
        id: secondCollectionSessionId,
        organizationId: secondOrganizationId,
        collectionPointId: secondCollectionPointId,
        agentUserId: collectionAgentId,
        deviceId: secondDeviceId,
        businessDate: new Date('2026-08-10T00:00:00.000Z'),
        status: 'OPEN',
      },
    });
    const firstFarmerMembership = await database.farmerOrganizationMembership.findUniqueOrThrow({
      where: { farmerId_organizationId: { farmerId, organizationId } },
    });
    await database.delivery.createMany({
      data: [
        {
          id: selfDeliveryIds[0]!,
          publicId: 'delivery_wp6_self_first_cooperative',
          deliveryNumber: 'WP6-SELF-ORG1',
          organizationId,
          collectionPointId: '00000000-0000-4000-8000-000000000301',
          collectionSessionId: '00000000-0000-4000-8000-000000000902',
          farmerId,
          farmerOrganizationMembershipId: firstFarmerMembership.id,
          commodityId: '00000000-0000-4000-8000-000000000801',
          commodityFormId: '00000000-0000-4000-8000-000000000811',
          status: 'ACCEPTED',
          source: 'ONLINE',
          clientCreatedAt: new Date(),
          createdByUserId: collectionAgentId,
        },
        {
          id: selfDeliveryIds[1]!,
          publicId: 'delivery_wp6_self_second_cooperative',
          deliveryNumber: 'WP6-SELF-ORG2',
          organizationId: secondOrganizationId,
          collectionPointId: secondCollectionPointId,
          collectionSessionId: secondCollectionSessionId,
          farmerId,
          farmerOrganizationMembershipId: secondFarmerMembership.id,
          commodityId: '00000000-0000-4000-8000-000000000801',
          commodityFormId: '00000000-0000-4000-8000-000000000811',
          status: 'ACCEPTED',
          source: 'ONLINE',
          clientCreatedAt: new Date(),
          createdByUserId: collectionAgentId,
        },
      ],
    });
    await database.farm.create({
      data: {
        id: farmId,
        farmerId,
        organizationId,
        name: 'WP6 Self-Service Farm',
        district: 'Kasese',
        latitude: '0.080000',
        longitude: '29.720000',
        locationMethod: 'DECLARED',
        totalArea: '1.5000',
        areaUnit: 'ACRE',
      },
    });
    await database.farmerQrIdentity.create({
      data: {
        id: qrIdentityId,
        farmerId,
        organizationId,
        publicId: 'fq1_wp6_self_service_identity_0001',
        issuedByUserId: administratorId,
      },
    });
    const [traceabilityConsent, settlementConsent] = await Promise.all([
      database.farmerConsent.create({
        data: {
          farmerId,
          organizationId,
          consentType: 'TRACEABILITY',
          policyVersion: 'wp6-v1',
          status: 'GRANTED',
          capturedByUserId: administratorId,
          captureMethod: 'VERBAL_WITNESSED',
        },
      }),
      database.farmerConsent.create({
        data: {
          farmerId,
          organizationId,
          consentType: 'SETTLEMENT_DEDUCTION',
          policyVersion: 'wp6-v1',
          status: 'GRANTED',
          capturedByUserId: administratorId,
          captureMethod: 'VERBAL_WITNESSED',
        },
      }),
    ]);

    const authenticated = await login(farmerEmail, currentFarmerPassword);
    const authorization = `Bearer ${authenticated.accessToken}`;
    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationId}/farmers`)
      .set('authorization', authorization)
      .expect(200);

    const profile = await request(app.getHttpServer())
      .get('/api/v1/me/profile')
      .set('authorization', authorization)
      .expect(200);
    expect(profile.body.data).toMatchObject({ id: farmerId, farmerNumber });
    expect(profile.body.data).not.toHaveProperty('registeredByUserId');

    const deliveries = await request(app.getHttpServer())
      .get('/api/v1/me/deliveries')
      .set('authorization', authorization)
      .expect(200);
    const deliveryData = deliveries.body.data as Array<{ organization: { id: string } }>;
    expect(deliveryData.map((delivery) => delivery.organization.id)).toEqual(
      expect.arrayContaining([organizationId, secondOrganizationId]),
    );
    expect(deliveryData).toHaveLength(2);
    await request(app.getHttpServer())
      .get(`/api/v1/me/deliveries/${otherFarmerDeliveryId}`)
      .set('authorization', authorization)
      .expect(404);
    for (const path of ['settlements', 'statements']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/${path}`)
        .set('authorization', authorization)
        .expect(200);
      expect(response.body.data).toEqual([]);
    }
    const farms = await request(app.getHttpServer())
      .get('/api/v1/me/farms')
      .set('authorization', authorization)
      .expect(200);
    const farmData = farms.body.data as Array<{ id: string }>;
    expect(farmData.map((farm) => farm.id)).toEqual([farmId]);
    const identities = await request(app.getHttpServer())
      .get('/api/v1/me/qr-identities')
      .set('authorization', authorization)
      .expect(200);
    const identityData = identities.body.data as Array<{ id: string }>;
    expect(identityData.map((identity) => identity.id)).toEqual([qrIdentityId]);
    const consents = await request(app.getHttpServer())
      .get('/api/v1/me/consents')
      .set('authorization', authorization)
      .expect(200);
    expect(consents.body.data).toHaveLength(2);

    await request(app.getHttpServer())
      .post(`/api/v1/me/consents/${traceabilityConsent.id}/withdraw`)
      .set('authorization', authorization)
      .send({})
      .expect(201);
    const withdrawal = await database.farmerConsent.findFirstOrThrow({
      where: {
        farmerId,
        consentType: 'TRACEABILITY',
        status: 'WITHDRAWN',
        captureMethod: 'SELF_SERVICE',
      },
    });
    expect(withdrawal.capturedByUserId).toBe(farmerUserId);
    await request(app.getHttpServer())
      .post(`/api/v1/me/consents/${settlementConsent.id}/withdraw`)
      .set('authorization', authorization)
      .send({})
      .expect(409);

    const privacy = await request(app.getHttpServer())
      .post('/api/v1/me/privacy-requests')
      .set('authorization', authorization)
      .send({ requestType: 'ACCESS', notes: 'WP6 access request' })
      .expect(201);
    expect(
      await database.dataSubjectRequest.findUniqueOrThrow({
        where: { id: privacy.body.data.id as string },
      }),
    ).toMatchObject({ farmerId, subjectType: 'FARMER' });
  });

  it('rejects unsafe usernames and enforces the retired-identifier cooldown', async () => {
    const administrator = await login('cooperative.admin@clycites.local', staffPassword);
    for (const [index, farmerNumberValue] of ['256772123456', 'admin'].entries()) {
      const unsafeFarmerId = unsafeFarmerIds[index];
      if (!unsafeFarmerId) throw new Error('Unsafe farmer fixture id missing');
      await database.farmer.create({
        data: {
          id: unsafeFarmerId,
          farmerNumber: farmerNumberValue,
          firstName: 'Unsafe',
          lastName: 'Username',
          district: 'Kasese',
          status: 'ACTIVE',
          registeredByUserId: administratorId,
          organizationMemberships: {
            create: { organizationId, status: 'ACTIVE', joinedAt: new Date() },
          },
        },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${organizationId}/farmers/${unsafeFarmerId}/account`)
        .set('authorization', `Bearer ${administrator.accessToken}`)
        .send({})
        .expect(400);
    }

    const retiredUsername = 'wp6-retired-0002';
    await database.farmer.create({
      data: {
        id: retiredFarmerId,
        farmerNumber: retiredUsername.toUpperCase(),
        firstName: 'Retired',
        lastName: 'Identifier',
        district: 'Kasese',
        status: 'ACTIVE',
        registeredByUserId: administratorId,
        organizationMemberships: {
          create: { organizationId, status: 'ACTIVE', joinedAt: new Date() },
        },
      },
    });
    const valueHash = createHmac(
      'sha256',
      process.env.AUTH_IDENTIFIER_HASH_PEPPER ?? 'local-only-identifier-hash-pepper-change-me',
    )
      .update(`username:${retiredUsername}`)
      .digest('hex');
    const retired = await database.retiredIdentifier.create({
      data: {
        kind: 'USERNAME',
        valueHash,
        userId: administratorId,
        claimableAt: new Date(Date.now() + 86_400_000),
      },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/farmers/${retiredFarmerId}/account`)
      .set('authorization', `Bearer ${administrator.accessToken}`)
      .send({})
      .expect(409);
    await database.retiredIdentifier.update({
      where: { id: retired.id },
      data: { claimableAt: new Date(Date.now() - 1_000) },
    });
    const provisioned = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/farmers/${retiredFarmerId}/account`)
      .set('authorization', `Bearer ${administrator.accessToken}`)
      .send({})
      .expect(201);
    const invitation = await database.userInvitation.findUniqueOrThrow({
      where: { id: provisioned.body.data.id as string },
    });
    retiredFarmerUserId = invitation.userId;
  });

  it('does not create email recovery for an unverified farmer email', async () => {
    if (!farmerUserId) throw new Error('Farmer user was not provisioned');
    expect(await database.passwordReset.count({ where: { userId: farmerUserId } })).toBe(0);
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: farmerEmail })
      .expect(202);
    expect(await database.passwordReset.count({ where: { userId: farmerUserId } })).toBe(0);
  });

  it('enforces and completes staff-assisted reset without exposing the password to staff', async () => {
    const administrator = await login('cooperative.admin@clycites.local', staffPassword);
    const collectionAgent = await login('collection.agent@clycites.local', staffPassword);
    if (!farmerUserId) throw new Error('Farmer user was not provisioned');

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/farmers/${farmerId}/account-reset`)
      .set('authorization', `Bearer ${collectionAgent.accessToken}`)
      .send({})
      .expect(403);

    const initiated = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${organizationId}/farmers/${farmerId}/account-reset`)
      .set('authorization', `Bearer ${administrator.accessToken}`)
      .send({})
      .expect(201);
    resetId = initiated.body.data.id as string;
    const resetCode = initiated.body.data.resetCode as string;
    const storedReset = await database.farmerAccountReset.findUniqueOrThrow({
      where: { id: resetId },
    });
    expect(storedReset.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedReset.codeHash).not.toBe(resetCode);

    const newPassword = 'coffee2026';
    await request(app.getHttpServer())
      .post('/api/v1/auth/farmer-account-reset/redeem')
      .send({ code: resetCode, password: newPassword })
      .expect(200);
    expect(await database.session.count({ where: { userId: farmerUserId, revokedAt: null } })).toBe(
      0,
    );
    expect(
      await database.auditEvent.count({
        where: {
          entityId: resetId,
          action: { in: ['FARMER_ACCOUNT_RESET_INITIATED', 'FARMER_ACCOUNT_RESET_REDEEMED'] },
        },
      }),
    ).toBe(2);
    const notification = await database.notificationDelivery.findFirstOrThrow({
      where: { recipientReference: farmerUserId, templateCode: 'FARMER_ACCOUNT_RESET' },
    });
    expect(notification).toMatchObject({ channel: 'IN_APP', status: 'DELIVERED' });

    await request(app.getHttpServer())
      .post('/api/v1/auth/farmer-account-reset/redeem')
      .send({ code: resetCode, password: newPassword })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: farmerEmail, password: currentFarmerPassword })
      .expect(401);
    await login(farmerEmail, newPassword);
    currentFarmerPassword = newPassword;
  });

  it.each(['DRAFT', 'SUSPENDED', 'INACTIVE'] as const)(
    'denies login while the farmer profile is %s',
    async (status) => {
      await database.farmer.update({ where: { id: farmerId }, data: { status } });
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: farmerNumber.toLowerCase(), password: currentFarmerPassword })
        .expect(403);
      await database.farmer.update({ where: { id: farmerId }, data: { status: 'ACTIVE' } });
    },
  );

  it('revokes every live session when a farmer transitions to DECEASED', async () => {
    const administrator = await login('cooperative.admin@clycites.local', staffPassword);
    if (!farmerUserId) throw new Error('Farmer user was not provisioned');
    expect(
      await database.session.count({ where: { userId: farmerUserId, revokedAt: null } }),
    ).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationId}/farmers/${farmerId}/status`)
      .set('authorization', `Bearer ${administrator.accessToken}`)
      .send({ status: 'DECEASED' })
      .expect(200);

    expect(await database.session.count({ where: { userId: farmerUserId, revokedAt: null } })).toBe(
      0,
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: farmerEmail, password: currentFarmerPassword })
      .expect(403);
  });

  async function login(identifier: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier, password })
      .expect(201);
    return response.body.data as {
      accessToken: string;
      user: { id: string; username: string | null; email: string | null; phone: string | null };
    };
  }
});
