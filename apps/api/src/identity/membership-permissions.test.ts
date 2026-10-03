import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '@clycites/auth';
import { describe, expect, it } from 'vitest';
import { membershipPermissions } from './membership-permissions.js';

describe('membership permission resolution', () => {
  const base = { organizationId: 'org-a', role: ROLES.VIEWER };
  const assignment = (organizationId: string, status: string) => ({
    customRole: {
      organizationId,
      status,
      permissions: [
        { permissionCode: PERMISSIONS.DEVICE_REGISTER },
        { permissionCode: 'unknown.permission' },
      ],
    },
  });
  it('adds active roles only in the membership organization', () =>
    expect(
      membershipPermissions({ ...base, customRoleAssignments: [assignment('org-a', 'ACTIVE')] }),
    ).toContain(PERMISSIONS.DEVICE_REGISTER));
  it('ignores cross-tenant, inactive and unknown grants', () => {
    const permissions = membershipPermissions({
      ...base,
      customRoleAssignments: [assignment('org-b', 'ACTIVE'), assignment('org-a', 'INACTIVE')],
    });
    expect(permissions).toEqual(ROLE_PERMISSIONS[ROLES.VIEWER]);
    expect(permissions).not.toContain('unknown.permission');
  });
});
