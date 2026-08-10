import { describe, expect, it } from 'vitest';

import {
  can,
  canAccessOwnFarmerRecord,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type AuthenticatedPrincipal,
} from './index.js';

describe('scoped permissions', () => {
  it('does not carry cooperative administrator permissions into another organization', () => {
    const principal: AuthenticatedPrincipal = {
      subjectId: 'user-1',
      sessionId: 'session-1',
      memberships: new Map([
        ['organization-a', ROLES.COOPERATIVE_ADMIN],
        ['organization-b', ROLES.BUYER],
      ]),
    };

    expect(can(principal, PERMISSIONS.PILOT_PARTICIPANT_ENROLL, 'organization-a')).toBe(true);
    expect(can(principal, PERMISSIONS.PILOT_PARTICIPANT_ENROLL, 'organization-b')).toBe(false);
  });

  it('keeps farmer-self permissions on the subject axis only', () => {
    const farmerPrincipal: AuthenticatedPrincipal = {
      subjectId: 'user-1',
      sessionId: 'session-1',
      farmerId: 'farmer-1',
      platformRole: ROLES.PLATFORM_ADMIN,
      memberships: new Map([['organization-a', ROLES.COOPERATIVE_ADMIN]]),
    };

    expect(
      canAccessOwnFarmerRecord(farmerPrincipal, PERMISSIONS.FARMER_SELF_DELIVERY_READ, 'farmer-1'),
    ).toBe(true);
    expect(
      canAccessOwnFarmerRecord(farmerPrincipal, PERMISSIONS.FARMER_SELF_DELIVERY_READ, 'farmer-2'),
    ).toBe(false);
    expect(can(farmerPrincipal, PERMISSIONS.FARMER_SELF_DELIVERY_READ, 'organization-a')).toBe(
      false,
    );
  });
});

describe('role permissions', () => {
  it('grants farmer-self permissions only to the farmer role', () => {
    const selfPermissions = Object.values(PERMISSIONS).filter((permission) =>
      permission.startsWith('farmer-self.'),
    );

    expect(selfPermissions).toHaveLength(9);
    for (const role of Object.values(ROLES)) {
      if (role === ROLES.FARMER) continue;
      expect(ROLE_PERMISSIONS[role]).not.toEqual(expect.arrayContaining(selfPermissions));
    }
    expect(ROLE_PERMISSIONS[ROLES.FARMER]).toEqual(expect.arrayContaining(selfPermissions));
  });

  it('grants cooperative administrators Phase 1 management permissions', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.COOPERATIVE_ADMIN];

    expect(permissions).toContain(PERMISSIONS.ORGANIZATION_MEMBERS_UPDATE);
    expect(permissions).toContain(PERMISSIONS.FARMER_QR_ISSUE);
    expect(permissions).toContain(PERMISSIONS.AUDIT_READ);
  });

  it('does not grant buyers private farmer access', () => {
    expect(ROLE_PERMISSIONS[ROLES.BUYER]).not.toContain(PERMISSIONS.FARMER_READ);
  });

  it('grants collection agents the device-bound offline collection workflow', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.COLLECTION_AGENT];

    expect(permissions).toContain(PERMISSIONS.COLLECTION_SESSION_OPEN);
    expect(permissions).toContain(PERMISSIONS.COLLECTION_SNAPSHOT_DOWNLOAD);
    expect(permissions).toContain(PERMISSIONS.DELIVERY_RECORD);
    expect(permissions).toContain(PERMISSIONS.DELIVERY_CONFIRM);
    expect(permissions).toContain(PERMISSIONS.OFFLINE_SYNC);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_CORRECTION_REVIEW);
  });

  it('keeps cooperative delivery mutation outside platform administration', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.PLATFORM_ADMIN];

    expect(permissions).toContain(PERMISSIONS.COMMODITY_MANAGE);
    expect(permissions).toContain(PERMISSIONS.DELIVERY_READ);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_RECORD);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_ACCEPT);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_CORRECTION_REVIEW);
  });

  it('allows cooperative administrators to review corrections without recording deliveries', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.COOPERATIVE_ADMIN];

    expect(permissions).toContain(PERMISSIONS.DELIVERY_CORRECTION_REVIEW);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_RECORD);
  });

  it('grants cooperative administrators the complete Phase 3 workflow', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.COOPERATIVE_ADMIN];

    expect(permissions).toContain(PERMISSIONS.BATCH_TRANSFORM);
    expect(permissions).toContain(PERMISSIONS.LOT_APPROVE);
    expect(permissions).toContain(PERMISSIONS.QUALITY_INSPECT);
    expect(permissions).toContain(PERMISSIONS.CUSTODY_TRANSFER_INITIATE);
    expect(permissions).toContain(PERMISSIONS.TRACEABILITY_PUBLISH);
  });

  it('allows buyers to receive custody without private farmer access', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.BUYER];

    expect(permissions).toContain(PERMISSIONS.CUSTODY_TRANSFER_RECEIVE);
    expect(permissions).not.toContain(PERMISSIONS.FARMER_READ);
    expect(permissions).not.toContain(PERMISSIONS.BATCH_CREATE);
  });

  it('grants finance officers the granular Phase 6 workflow', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.FINANCE_OFFICER];

    expect(permissions).toContain(PERMISSIONS.SALE_PROCEEDS_RECORD);
    expect(permissions).toContain(PERMISSIONS.SALE_PROCEEDS_VERIFY);
    expect(permissions).toContain(PERMISSIONS.SETTLEMENT_CALCULATE);
    expect(permissions).toContain(PERMISSIONS.SETTLEMENT_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PAYMENT_INSTRUCTION_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PAYMENT_RECONCILIATION_CONFIRM);
  });

  it('keeps financial mutation outside buyers and collection agents', () => {
    for (const role of [ROLES.BUYER, ROLES.COLLECTION_AGENT]) {
      const permissions = ROLE_PERMISSIONS[role];

      expect(permissions).not.toContain(PERMISSIONS.SALE_PROCEEDS_READ);
      expect(permissions).not.toContain(PERMISSIONS.SETTLEMENT_READ);
      expect(permissions).not.toContain(PERMISSIONS.PAYMENT_INSTRUCTION_READ);
    }
  });

  it('does not make platform administrators organization payers', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.PLATFORM_ADMIN];

    expect(permissions).not.toContain(PERMISSIONS.SALE_PROCEEDS_RECORD);
    expect(permissions).not.toContain(PERMISSIONS.SETTLEMENT_APPROVE);
    expect(permissions).not.toContain(PERMISSIONS.PAYMENT_INSTRUCTION_SUBMIT);
  });

  it('reserves controlled-pilot governance for platform administrators', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.PLATFORM_ADMIN];

    expect(permissions).toContain(PERMISSIONS.PILOT_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PILOT_ACTIVATE);
    expect(permissions).toContain(PERMISSIONS.TRAINING_WAIVE);
    expect(permissions).toContain(PERMISSIONS.PILOT_DECISION_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PILOT_PREFLIGHT_RUN);
  });

  it('limits cooperative administrators to scoped pilot operations', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.COOPERATIVE_ADMIN];

    expect(permissions).toContain(PERMISSIONS.PILOT_PARTICIPANT_ENROLL);
    expect(permissions).toContain(PERMISSIONS.TRAINING_COMPLETE);
    expect(permissions).toContain(PERMISSIONS.SUPPORT_CASE_RESOLVE);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_APPROVE);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_ACTIVATE);
    expect(permissions).not.toContain(PERMISSIONS.TRAINING_WAIVE);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_DECISION_CREATE);
  });

  it('keeps buyers outside pilot administration', () => {
    const permissions = ROLE_PERMISSIONS[ROLES.BUYER];

    expect(permissions).not.toContain(PERMISSIONS.PILOT_READ);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_PARTICIPANT_READ);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_METRIC_READ);
    expect(permissions).not.toContain(PERMISSIONS.SUPPORT_CASE_READ);
  });
});
