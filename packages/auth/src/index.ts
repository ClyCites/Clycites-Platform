export const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  COOPERATIVE_ADMIN: 'COOPERATIVE_ADMIN',
  COLLECTION_AGENT: 'COLLECTION_AGENT',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  QUALITY_INSPECTOR: 'QUALITY_INSPECTOR',
  BUYER: 'BUYER',
  FARMER: 'FARMER',
} as const;

export const PERMISSIONS = {
  FARMER_READ: 'farmer.read',
  FARMER_CREATE: 'farmer.create',
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
}

export interface AuthenticatedPrincipal {
  subjectId: string;
  roles: readonly Role[];
  permissions: readonly Permission[];
  organization?: OrganizationContext;
}
