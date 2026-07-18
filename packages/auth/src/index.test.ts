import { describe, expect, it } from 'vitest';

import { PERMISSIONS, permissionsForRoles, ROLES } from './index.js';

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
});
