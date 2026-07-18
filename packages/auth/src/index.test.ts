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

  it('deduplicates permissions for users with multiple roles', () => {
    const permissions = permissionsForRoles([ROLES.COOPERATIVE_ADMIN, ROLES.COLLECTION_AGENT]);

    expect(new Set(permissions).size).toBe(permissions.length);
  });
});
