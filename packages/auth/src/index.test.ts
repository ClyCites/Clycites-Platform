import { describe, expect, it } from 'vitest';

import {
  isPermissionCode,
  PERMISSION_CODES,
  PERMISSIONS,
  permissionsForRoles,
  resolveEffectivePermissions,
  ROLES,
} from './index.js';

describe('role permissions', () => {
  it('grants cooperative administrators Phase 1 management permissions', () => {
    const permissions = permissionsForRoles([ROLES.COOPERATIVE_ADMIN]);

    expect(permissions).toContain(PERMISSIONS.ORGANIZATION_MEMBERS_UPDATE);
    expect(permissions).toContain(PERMISSIONS.FARMER_QR_ISSUE);
    expect(permissions).toContain(PERMISSIONS.AUDIT_READ);
  });

  it('does not grant buyers private farmer access', () => {
    expect(permissionsForRoles([ROLES.BUYER])).not.toContain(PERMISSIONS.FARMER_READ);
  });

  it('grants collection agents the device-bound offline collection workflow', () => {
    const permissions = permissionsForRoles([ROLES.COLLECTION_AGENT]);

    expect(permissions).toContain(PERMISSIONS.COLLECTION_SESSION_OPEN);
    expect(permissions).toContain(PERMISSIONS.COLLECTION_SNAPSHOT_DOWNLOAD);
    expect(permissions).toContain(PERMISSIONS.DELIVERY_RECORD);
    expect(permissions).toContain(PERMISSIONS.DELIVERY_CONFIRM);
    expect(permissions).toContain(PERMISSIONS.OFFLINE_SYNC);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_CORRECTION_REVIEW);
  });

  it('keeps cooperative delivery mutation outside platform administration', () => {
    const permissions = permissionsForRoles([ROLES.PLATFORM_ADMIN]);

    expect(permissions).toContain(PERMISSIONS.COMMODITY_MANAGE);
    expect(permissions).toContain(PERMISSIONS.DELIVERY_READ);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_RECORD);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_ACCEPT);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_CORRECTION_REVIEW);
  });

  it('allows cooperative administrators to review corrections without recording deliveries', () => {
    const permissions = permissionsForRoles([ROLES.COOPERATIVE_ADMIN]);

    expect(permissions).toContain(PERMISSIONS.DELIVERY_CORRECTION_REVIEW);
    expect(permissions).not.toContain(PERMISSIONS.DELIVERY_RECORD);
  });

  it('deduplicates permissions for users with multiple roles', () => {
    const permissions = permissionsForRoles([ROLES.COOPERATIVE_ADMIN, ROLES.COLLECTION_AGENT]);

    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it('grants cooperative administrators the complete Phase 3 workflow', () => {
    const permissions = permissionsForRoles([ROLES.COOPERATIVE_ADMIN]);

    expect(permissions).toContain(PERMISSIONS.BATCH_TRANSFORM);
    expect(permissions).toContain(PERMISSIONS.LOT_APPROVE);
    expect(permissions).toContain(PERMISSIONS.QUALITY_INSPECT);
    expect(permissions).toContain(PERMISSIONS.CUSTODY_TRANSFER_INITIATE);
    expect(permissions).toContain(PERMISSIONS.TRACEABILITY_PUBLISH);
  });

  it('allows buyers to receive custody without private farmer access', () => {
    const permissions = permissionsForRoles([ROLES.BUYER]);

    expect(permissions).toContain(PERMISSIONS.CUSTODY_TRANSFER_RECEIVE);
    expect(permissions).not.toContain(PERMISSIONS.FARMER_READ);
    expect(permissions).not.toContain(PERMISSIONS.BATCH_CREATE);
  });

  it('grants finance officers the granular Phase 6 workflow', () => {
    const permissions = permissionsForRoles([ROLES.FINANCE_OFFICER]);

    expect(permissions).toContain(PERMISSIONS.SALE_PROCEEDS_RECORD);
    expect(permissions).toContain(PERMISSIONS.SALE_PROCEEDS_VERIFY);
    expect(permissions).toContain(PERMISSIONS.SETTLEMENT_CALCULATE);
    expect(permissions).toContain(PERMISSIONS.SETTLEMENT_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PAYMENT_INSTRUCTION_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PAYMENT_RECONCILIATION_CONFIRM);
  });

  it('keeps financial mutation outside buyers and collection agents', () => {
    for (const role of [ROLES.BUYER, ROLES.COLLECTION_AGENT]) {
      const permissions = permissionsForRoles([role]);

      expect(permissions).not.toContain(PERMISSIONS.SALE_PROCEEDS_READ);
      expect(permissions).not.toContain(PERMISSIONS.SETTLEMENT_READ);
      expect(permissions).not.toContain(PERMISSIONS.PAYMENT_INSTRUCTION_READ);
    }
  });

  it('does not make platform administrators organization payers', () => {
    const permissions = permissionsForRoles([ROLES.PLATFORM_ADMIN]);

    expect(permissions).not.toContain(PERMISSIONS.SALE_PROCEEDS_RECORD);
    expect(permissions).not.toContain(PERMISSIONS.SETTLEMENT_APPROVE);
    expect(permissions).not.toContain(PERMISSIONS.PAYMENT_INSTRUCTION_SUBMIT);
  });

  it('reserves controlled-pilot governance for platform administrators', () => {
    const permissions = permissionsForRoles([ROLES.PLATFORM_ADMIN]);

    expect(permissions).toContain(PERMISSIONS.PILOT_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PILOT_ACTIVATE);
    expect(permissions).toContain(PERMISSIONS.TRAINING_WAIVE);
    expect(permissions).toContain(PERMISSIONS.PILOT_DECISION_APPROVE);
    expect(permissions).toContain(PERMISSIONS.PILOT_PREFLIGHT_RUN);
  });

  it('limits cooperative administrators to scoped pilot operations', () => {
    const permissions = permissionsForRoles([ROLES.COOPERATIVE_ADMIN]);

    expect(permissions).toContain(PERMISSIONS.PILOT_PARTICIPANT_ENROLL);
    expect(permissions).toContain(PERMISSIONS.TRAINING_COMPLETE);
    expect(permissions).toContain(PERMISSIONS.SUPPORT_CASE_RESOLVE);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_APPROVE);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_ACTIVATE);
    expect(permissions).not.toContain(PERMISSIONS.TRAINING_WAIVE);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_DECISION_CREATE);
  });

  it('keeps buyers outside pilot administration', () => {
    const permissions = permissionsForRoles([ROLES.BUYER]);

    expect(permissions).not.toContain(PERMISSIONS.PILOT_READ);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_PARTICIPANT_READ);
    expect(permissions).not.toContain(PERMISSIONS.PILOT_METRIC_READ);
    expect(permissions).not.toContain(PERMISSIONS.SUPPORT_CASE_READ);
  });
});

describe('tenant dashboard permissions', () => {
  it('grants cooperative administrators the full dashboard permission set', () => {
    const permissions = permissionsForRoles([ROLES.COOPERATIVE_ADMIN]);

    expect(permissions).toContain(PERMISSIONS.ANALYTICS_READ);
    expect(permissions).toContain(PERMISSIONS.BRANDING_MANAGE);
    expect(permissions).toContain(PERMISSIONS.REPORT_MANAGE);
  });

  it('keeps viewers read-only within the dashboard', () => {
    const permissions = permissionsForRoles([ROLES.VIEWER]);

    expect(permissions).toContain(PERMISSIONS.ANALYTICS_READ);
    expect(permissions).not.toContain(PERMISSIONS.BRANDING_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.REPORT_MANAGE);
  });
});

describe('isPermissionCode', () => {
  it('recognizes every code in the catalog', () => {
    for (const code of PERMISSION_CODES) {
      expect(isPermissionCode(code)).toBe(true);
    }
  });

  it('rejects unknown codes', () => {
    expect(isPermissionCode('report.delete-everything')).toBe(false);
    expect(isPermissionCode('')).toBe(false);
  });
});

describe('resolveEffectivePermissions', () => {
  it('unions base role permissions with recognized custom-role codes', () => {
    const permissions = resolveEffectivePermissions(
      [ROLES.VIEWER],
      [PERMISSIONS.REPORT_MANAGE, PERMISSIONS.BRANDING_MANAGE],
    );

    expect(permissions).toContain(PERMISSIONS.ANALYTICS_READ);
    expect(permissions).toContain(PERMISSIONS.REPORT_MANAGE);
    expect(permissions).toContain(PERMISSIONS.BRANDING_MANAGE);
  });

  it('ignores unknown custom-role codes so stale roles cannot widen access', () => {
    const permissions = resolveEffectivePermissions(
      [ROLES.VIEWER],
      ['report.delete-everything', 'org.take-over'],
    );

    expect(permissions).toEqual(permissionsForRoles([ROLES.VIEWER]));
  });

  it('deduplicates permissions granted by both the base role and a custom role', () => {
    const permissions = resolveEffectivePermissions(
      [ROLES.VIEWER],
      [PERMISSIONS.ANALYTICS_READ],
    );

    expect(new Set(permissions).size).toBe(permissions.length);
  });

  it('returns only base role permissions when no custom codes are supplied', () => {
    expect(resolveEffectivePermissions([ROLES.VIEWER])).toEqual(
      permissionsForRoles([ROLES.VIEWER]),
    );
  });
});
