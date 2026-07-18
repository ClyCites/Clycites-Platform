import type { z } from 'zod';
import type {
  collectionPointDetailSchema,
  collectionPointListItemSchema,
  consentRecordSchema,
  farmDetailSchema,
  farmerDetailSchema,
  farmerListItemSchema,
  organizationDetailSchema,
  organizationListItemSchema,
  organizationMembershipSchema,
  qrIdentitySchema,
} from '@clycites/contracts';

export type OrganizationListItem = z.infer<typeof organizationListItemSchema>;
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;
export type OrganizationMembership = z.infer<typeof organizationMembershipSchema>;
export type CollectionPointListItem = z.infer<typeof collectionPointListItemSchema>;
export type CollectionPointDetail = z.infer<typeof collectionPointDetailSchema>;
export type FarmerListItem = z.infer<typeof farmerListItemSchema>;
export type FarmerDetail = z.infer<typeof farmerDetailSchema>;
export type FarmDetail = z.infer<typeof farmDetailSchema>;
export type ConsentRecord = z.infer<typeof consentRecordSchema>;
export type QrIdentity = z.infer<typeof qrIdentitySchema>;
export type Paginated<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};
