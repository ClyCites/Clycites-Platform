import { resolveEffectivePermissions, type Role } from '@clycites/auth';

type MembershipWithRoles = {
  organizationId: string;
  role: Role;
  customRoleAssignments: readonly {
    customRole: {
      organizationId: string;
      status: string;
      permissions: readonly { permissionCode: string }[];
    };
  }[];
};

/** The same role union applies to login, ordinary API guards, and dashboard guards. */
export function membershipPermissions(membership: MembershipWithRoles) {
  return resolveEffectivePermissions(
    [membership.role],
    membership.customRoleAssignments
      .filter(
        ({ customRole }) =>
          customRole.status === 'ACTIVE' && customRole.organizationId === membership.organizationId,
      )
      .flatMap(({ customRole }) =>
        customRole.permissions.map(({ permissionCode }) => permissionCode),
      ),
  );
}
