export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  COOPERATIVE_ADMIN: 'COOPERATIVE_ADMIN',
  COLLECTION_AGENT: 'COLLECTION_AGENT',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  QUALITY_INSPECTOR: 'QUALITY_INSPECTOR',
  BUYER: 'BUYER',
  FARMER: 'FARMER',
  VIEWER: 'VIEWER',
} as const;

export const PERMISSIONS = {
  ORGANIZATION_READ: 'organization.read',
  ORGANIZATION_CREATE: 'organization.create',
  ORGANIZATION_UPDATE: 'organization.update',
  ORGANIZATION_MEMBERS_READ: 'organization.members.read',
  ORGANIZATION_MEMBERS_INVITE: 'organization.members.invite',
  ORGANIZATION_MEMBERS_UPDATE: 'organization.members.update',
  COLLECTION_POINT_READ: 'collection-point.read',
  COLLECTION_POINT_CREATE: 'collection-point.create',
  COLLECTION_POINT_UPDATE: 'collection-point.update',
  COLLECTION_POINT_CLOSE: 'collection-point.close',
  FARMER_READ: 'farmer.read',
  FARMER_CREATE: 'farmer.create',
  FARMER_UPDATE: 'farmer.update',
  FARMER_SUSPEND: 'farmer.suspend',
  FARMER_QR_ISSUE: 'farmer.qr.issue',
  FARMER_QR_REVOKE: 'farmer.qr.revoke',
  FARMER_CONSENT_RECORD: 'farmer.consent.record',
  FARM_READ: 'farm.read',
  FARM_CREATE: 'farm.create',
  FARM_UPDATE: 'farm.update',
  FARM_ARCHIVE: 'farm.archive',
  DELIVERY_RECORD: 'delivery.record',
  DELIVERY_CONFIRM: 'delivery.confirm',
  DELIVERY_CORRECT: 'delivery.correct',
  QUALITY_INSPECT: 'quality.inspect',
  LOT_CREATE: 'lot.create',
  LOT_TRANSFER: 'lot.transfer',
  SETTLEMENT_CALCULATE: 'settlement.calculate',
  SETTLEMENT_APPROVE: 'settlement.approve',
  PAYMENT_RECONCILE: 'payment.reconcile',
  DISPUTE_RESOLVE: 'dispute.resolve',
  ANCHOR_RETRY: 'anchor.retry',
  AUDIT_READ: 'audit.read',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface OrganizationContext {
  organizationId: string;
  organizationName?: string;
  role?: Role;
}

export interface AuthenticatedPrincipal {
  subjectId: string;
  roles: readonly Role[];
  permissions: readonly Permission[];
  organization?: OrganizationContext;
  organizations?: readonly OrganizationContext[];
}

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [ROLES.PLATFORM_ADMIN]: ALL_PERMISSIONS,
  [ROLES.COOPERATIVE_ADMIN]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.ORGANIZATION_UPDATE,
    PERMISSIONS.ORGANIZATION_MEMBERS_READ,
    PERMISSIONS.ORGANIZATION_MEMBERS_INVITE,
    PERMISSIONS.ORGANIZATION_MEMBERS_UPDATE,
    PERMISSIONS.COLLECTION_POINT_READ,
    PERMISSIONS.COLLECTION_POINT_CREATE,
    PERMISSIONS.COLLECTION_POINT_UPDATE,
    PERMISSIONS.COLLECTION_POINT_CLOSE,
    PERMISSIONS.FARMER_READ,
    PERMISSIONS.FARMER_CREATE,
    PERMISSIONS.FARMER_UPDATE,
    PERMISSIONS.FARMER_SUSPEND,
    PERMISSIONS.FARMER_QR_ISSUE,
    PERMISSIONS.FARMER_QR_REVOKE,
    PERMISSIONS.FARMER_CONSENT_RECORD,
    PERMISSIONS.FARM_READ,
    PERMISSIONS.FARM_CREATE,
    PERMISSIONS.FARM_UPDATE,
    PERMISSIONS.FARM_ARCHIVE,
    PERMISSIONS.AUDIT_READ,
  ],
  [ROLES.COLLECTION_AGENT]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.COLLECTION_POINT_READ,
    PERMISSIONS.FARMER_READ,
    PERMISSIONS.FARMER_CREATE,
    PERMISSIONS.FARMER_UPDATE,
    PERMISSIONS.FARMER_CONSENT_RECORD,
    PERMISSIONS.FARM_READ,
    PERMISSIONS.FARM_CREATE,
    PERMISSIONS.FARM_UPDATE,
  ],
  [ROLES.FINANCE_OFFICER]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.FARMER_READ,
    PERMISSIONS.SETTLEMENT_CALCULATE,
    PERMISSIONS.SETTLEMENT_APPROVE,
    PERMISSIONS.PAYMENT_RECONCILE,
  ],
  [ROLES.QUALITY_INSPECTOR]: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.FARMER_READ,
    PERMISSIONS.FARM_READ,
    PERMISSIONS.QUALITY_INSPECT,
  ],
  [ROLES.BUYER]: [],
  [ROLES.FARMER]: [],
  [ROLES.VIEWER]: [PERMISSIONS.ORGANIZATION_READ, PERMISSIONS.COLLECTION_POINT_READ],
};

export const permissionsForRoles = (roles: readonly Role[]): Permission[] => [
  ...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role])),
];

export const hasPermission = (principal: AuthenticatedPrincipal, permission: Permission): boolean =>
  principal.permissions.includes(permission);
