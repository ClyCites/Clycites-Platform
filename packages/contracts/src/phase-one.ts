import { z } from 'zod';

const trimmed = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();

export const normalizePhone = (value: string): string => {
  const compact = value.replace(/[\s()-]/g, '');
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('0')) return `+256${compact.slice(1)}`;
  if (compact.startsWith('256')) return `+${compact}`;
  return compact;
};

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid international phone number'));

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => value.trim().length >= 12, {
    message: 'Password must contain at least 12 non-whitespace characters',
  });

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');

export const decimalSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(
    z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/, 'Enter a positive decimal with up to 4 places'),
  );

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const dateSchema = z.iso.date();
const uuid = z.uuid();

export const userStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED']);
export const organizationTypeSchema = z.enum([
  'COOPERATIVE',
  'BUYER',
  'PROCESSOR',
  'EXPORTER',
  'LOGISTICS_PROVIDER',
]);
export const organizationStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']);
export const organizationRoleSchema = z.enum([
  'COOPERATIVE_ADMIN',
  'COLLECTION_AGENT',
  'FINANCE_OFFICER',
  'QUALITY_INSPECTOR',
  'BUYER',
  'VIEWER',
]);
export const membershipStatusSchema = z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED']);
export const collectionPointStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'CLOSED']);
export const farmerStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'DECEASED']);
export const genderSchema = z.enum(['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']);
export const areaUnitSchema = z.enum(['ACRE', 'HECTARE']);
export const farmStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export const qrIdentityStatusSchema = z.enum(['ACTIVE', 'REVOKED', 'REPLACED', 'EXPIRED']);
export const consentTypeSchema = z.enum([
  'DATA_PROCESSING',
  'SMS_NOTIFICATIONS',
  'TRACEABILITY',
  'MARKETPLACE_VISIBILITY',
]);
export const consentStatusSchema = z.enum(['GRANTED', 'WITHDRAWN']);
export const consentCaptureMethodSchema = z.enum([
  'DIGITAL_SIGNATURE',
  'CHECKBOX',
  'PAPER_FORM',
  'VERBAL_WITNESSED',
]);

export const organizationContextSchema = z.object({
  organizationId: uuid,
  organizationName: trimmed(200),
  role: organizationRoleSchema,
  permissions: z.array(z.string().min(1)),
});

export const currentUserSchema = z.object({
  id: uuid,
  username: trimmed(40).nullable(),
  email: emailSchema.nullable(),
  phone: phoneSchema.nullable(),
  firstName: trimmed(100),
  lastName: trimmed(100),
  status: userStatusSchema,
  platformRole: z.literal('PLATFORM_ADMIN').nullable(),
  organizations: z.array(organizationContextSchema),
});

export const loginRequestSchema = z
  .object({
    identifier: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(128),
    deviceName: optionalText(160),
  })
  .strict();
export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: currentUserSchema,
});
export const refreshResponseSchema = loginResponseSchema;

export const createUserSchema = z
  .object({
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordSchema,
    firstName: trimmed(100),
    lastName: trimmed(100),
    platformRole: z.literal('PLATFORM_ADMIN').optional(),
  })
  .strict();
export const updateUserStatusSchema = z.object({ status: userStatusSchema }).strict();
export const userListItemSchema = currentUserSchema.omit({ organizations: true }).extend({
  createdAt: z.iso.datetime(),
});

const organizationFields = {
  name: trimmed(200),
  slug: slugSchema,
  type: organizationTypeSchema,
  status: organizationStatusSchema,
  registrationNumber: nullableText(120),
  phone: phoneSchema.nullable(),
  email: emailSchema.nullable(),
  district: nullableText(120),
  subCounty: nullableText(120),
  address: nullableText(500),
};
export const createOrganizationSchema = z
  .object({
    ...organizationFields,
    status: organizationStatusSchema.default('ACTIVE'),
    initialAdministratorUserId: uuid.optional(),
  })
  .strict();
export const updateOrganizationSchema = z.object(organizationFields).partial().strict();
export const organizationListItemSchema = z.object({
  id: uuid,
  name: trimmed(200),
  slug: slugSchema,
  type: organizationTypeSchema,
  status: organizationStatusSchema,
  district: nullableText(120),
});
export const organizationDetailSchema = organizationListItemSchema.extend({
  registrationNumber: nullableText(120),
  phone: phoneSchema.nullable(),
  email: emailSchema.nullable(),
  subCounty: nullableText(120),
  address: nullableText(500),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createOrganizationMembershipSchema = z
  .object({
    userId: uuid,
    role: organizationRoleSchema,
    status: membershipStatusSchema.default('ACTIVE'),
  })
  .strict();
export const updateOrganizationMembershipSchema = z
  .object({ role: organizationRoleSchema.optional(), status: membershipStatusSchema.optional() })
  .strict()
  .refine(
    (value) => value.role !== undefined || value.status !== undefined,
    'Provide a role or status',
  );
export const organizationMembershipSchema = z.object({
  id: uuid,
  userId: uuid,
  role: organizationRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
  user: z.object({
    firstName: trimmed(100),
    lastName: trimmed(100),
    email: emailSchema.nullable(),
  }),
});

const collectionPointFields = {
  name: trimmed(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9-]+$/),
  status: collectionPointStatusSchema,
  district: trimmed(120),
  subCounty: nullableText(120),
  parish: nullableText(120),
  village: nullableText(120),
  latitude: decimalSchema.nullable(),
  longitude: decimalSchema.nullable(),
  timezone: trimmed(80),
};
export const createCollectionPointSchema = z
  .object({
    ...collectionPointFields,
    status: collectionPointStatusSchema.default('ACTIVE'),
    timezone: z.string().default('Africa/Kampala'),
  })
  .strict();
export const updateCollectionPointSchema = z.object(collectionPointFields).partial().strict();
export const collectionPointListItemSchema = z.object({
  id: uuid,
  name: trimmed(200),
  code: trimmed(40),
  status: collectionPointStatusSchema,
  district: trimmed(120),
  subCounty: nullableText(120),
});
export const collectionPointDetailSchema = collectionPointListItemSchema.extend({
  parish: nullableText(120),
  village: nullableText(120),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  timezone: trimmed(80),
});

export const createFarmSchema = z
  .object({
    name: trimmed(200),
    district: trimmed(120),
    subCounty: optionalText(120),
    parish: optionalText(120),
    village: optionalText(120),
    latitude: decimalSchema.optional(),
    longitude: decimalSchema.optional(),
    totalArea: decimalSchema,
    areaUnit: areaUnitSchema,
    ownershipType: optionalText(80),
    waterSource: optionalText(120),
  })
  .strict();
export const updateFarmSchema = createFarmSchema.partial().strict();
export const updateFarmStatusSchema = z.object({ status: farmStatusSchema }).strict();
export const farmDetailSchema = z.object({
  id: uuid,
  farmerId: uuid,
  name: trimmed(200),
  district: trimmed(120),
  subCounty: nullableText(120),
  parish: nullableText(120),
  village: nullableText(120),
  totalArea: z.string(),
  areaUnit: areaUnitSchema,
  ownershipType: nullableText(80),
  waterSource: nullableText(120),
  status: farmStatusSchema,
});

export const grantConsentSchema = z
  .object({
    consentType: consentTypeSchema,
    policyVersion: trimmed(40),
    captureMethod: consentCaptureMethodSchema,
    notes: optionalText(1000),
  })
  .strict();
export const withdrawConsentSchema = z.object({ notes: optionalText(1000) }).strict();
export const consentRecordSchema = z.object({
  id: uuid,
  consentType: consentTypeSchema,
  policyVersion: trimmed(40),
  status: consentStatusSchema,
  captureMethod: consentCaptureMethodSchema,
  capturedAt: z.iso.datetime(),
  withdrawnAt: z.iso.datetime().nullable(),
  notes: nullableText(1000),
});

const farmerProfileFields = {
  firstName: trimmed(100),
  middleName: optionalText(100),
  lastName: trimmed(100),
  preferredName: optionalText(100),
  gender: genderSchema.optional(),
  dateOfBirth: dateSchema.optional(),
  primaryPhone: phoneSchema.optional(),
  alternativePhone: phoneSchema.optional(),
  email: emailSchema.optional(),
  district: trimmed(120),
  subCounty: optionalText(120),
  parish: optionalText(120),
  village: optionalText(120),
};
export const createFarmerSchema = z
  .object({
    ...farmerProfileFields,
    farmerNumber: trimmed(40),
    membershipNumber: optionalText(80),
    registeredAtCollectionPointId: uuid.optional(),
    initialFarm: createFarmSchema.optional(),
    initialConsents: z.array(grantConsentSchema).max(8).optional(),
    issueQrIdentity: z.boolean().default(false),
  })
  .strict();
export const updateFarmerSchema = z.object(farmerProfileFields).partial().strict();
export const updateFarmerStatusSchema = z.object({ status: farmerStatusSchema }).strict();
export const farmerListItemSchema = z.object({
  id: uuid,
  farmerNumber: trimmed(40),
  displayName: trimmed(302),
  district: trimmed(120),
  village: nullableText(120),
  status: farmerStatusSchema,
  membershipNumber: nullableText(80),
});
export const farmerDetailSchema = farmerListItemSchema.extend({
  firstName: trimmed(100),
  middleName: nullableText(100),
  lastName: trimmed(100),
  preferredName: nullableText(100),
  gender: genderSchema.nullable(),
  dateOfBirth: dateSchema.nullable(),
  primaryPhone: phoneSchema.nullable(),
  alternativePhone: phoneSchema.nullable(),
  email: emailSchema.nullable(),
  subCounty: nullableText(120),
  parish: nullableText(120),
});

export const issueQrIdentitySchema = z.object({ expiresAt: z.iso.datetime().optional() }).strict();
export const qrIdentitySchema = z.object({
  id: uuid,
  publicId: trimmed(128),
  status: qrIdentityStatusSchema,
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  payload: z.url(),
});
export const qrLookupResponseSchema = z.object({
  farmerId: uuid,
  farmerNumber: trimmed(40),
  displayName: trimmed(302),
  membershipNumber: nullableText(80),
  status: farmerStatusSchema,
  district: trimmed(120),
  village: nullableText(120),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const paginatedDataSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      totalItems: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  });

export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string().min(1),
  code: z.string().min(1),
});

export type CurrentUser = z.infer<typeof currentUserSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUserStatus = z.infer<typeof updateUserStatusSchema>;
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type CreateOrganizationMembership = z.infer<typeof createOrganizationMembershipSchema>;
export type UpdateOrganizationMembership = z.infer<typeof updateOrganizationMembershipSchema>;
export type CreateCollectionPoint = z.infer<typeof createCollectionPointSchema>;
export type UpdateCollectionPoint = z.infer<typeof updateCollectionPointSchema>;
export type CreateFarmer = z.infer<typeof createFarmerSchema>;
export type UpdateFarmer = z.infer<typeof updateFarmerSchema>;
export type UpdateFarmerStatus = z.infer<typeof updateFarmerStatusSchema>;
export type CreateFarm = z.infer<typeof createFarmSchema>;
export type UpdateFarm = z.infer<typeof updateFarmSchema>;
export type UpdateFarmStatus = z.infer<typeof updateFarmStatusSchema>;
export type GrantConsent = z.infer<typeof grantConsentSchema>;
export type WithdrawConsent = z.infer<typeof withdrawConsentSchema>;
export type IssueQrIdentity = z.infer<typeof issueQrIdentitySchema>;
