import { z } from 'zod';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const trimmed = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => trimmed(maximum).optional();
const nullableText = (maximum: number) => trimmed(maximum).nullable();

export const preciseQuantitySchema = z
  .string()
  .regex(
    /^(?=.*[1-9])\d{1,14}(?:\.\d{1,4})?$/,
    'Enter a quantity greater than zero with up to 4 decimal places',
  );
export const nonNegativeDecimalSchema = z
  .string()
  .regex(/^\d{1,14}(?:\.\d{1,6})?$/, 'Enter a non-negative decimal with up to 6 decimal places');
export const moneyMinorSchema = z
  .string()
  .regex(/^\d{1,30}$/, 'Use a non-negative minor-unit decimal string');
export const signedMoneyMinorSchema = z
  .string()
  .regex(/^-?\d{1,30}$/, 'Use a signed minor-unit decimal string');

export const commodityStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const quantityUnitSchema = z.enum(['KG']);
export const qualityDataTypeSchema = z.enum(['DECIMAL', 'INTEGER', 'TEXT', 'ENUM', 'BOOLEAN']);
export const configurationStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const deviceStatusSchema = z.enum(['ACTIVE', 'REVOKED', 'LOST', 'REPLACED']);
export const collectionSessionStatusSchema = z.enum(['OPEN', 'CLOSED', 'SUSPENDED']);
export const weighingInstrumentStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'RETIRED']);
export const instrumentFlagReasonSchema = z.enum([
  'INSTRUMENT_NOT_RECORDED',
  'INSTRUMENT_NOT_REGISTERED',
  'INSTRUMENT_INACTIVE',
  'CALIBRATION_LAPSED',
]);
export const deliveryStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'PENDING_CONFIRMATION',
  'ACCEPTED',
  'CORRECTION_PENDING',
  'CORRECTED',
  'REJECTED',
  'CANCELLED',
]);
export const deliverySourceSchema = z.enum(['ONLINE', 'OFFLINE_SYNC']);
export const priceSourceSchema = z.enum(['COLLECTION_POINT', 'CONTRACT', 'MANUAL_OVERRIDE']);
export const confirmationMethodSchema = z.enum([
  'VERBAL_WITNESSED',
  'PRINTED_RECEIPT_ACKNOWLEDGEMENT',
]);
export const confirmationStatusSchema = z.enum(['CONFIRMED', 'DECLINED']);
export const receiptStatusSchema = z.enum(['ACTIVE', 'SUPERSEDED', 'VOID']);
export const correctionStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export const correctionReasonCodeSchema = z.enum([
  'WEIGHT_ENTRY_ERROR',
  'WRONG_FARMER',
  'WRONG_COMMODITY_FORM',
  'QUALITY_ENTRY_ERROR',
  'PRICE_ENTRY_ERROR',
  'DUPLICATE_DELIVERY',
  'OTHER',
]);
export const offlineOperationStatusSchema = z.enum([
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'REJECTED',
  'CONFLICT',
]);

export const commodityFormSchema = z.object({
  id: uuid,
  commodityId: uuid,
  code: trimmed(40),
  name: trimmed(120),
  description: nullableText(500),
  defaultUnit: quantityUnitSchema,
  status: commodityStatusSchema,
});

export const commoditySchema = z.object({
  id: uuid,
  code: trimmed(40),
  name: trimmed(120),
  description: nullableText(500),
  status: commodityStatusSchema,
  forms: z.array(commodityFormSchema).optional(),
});

const qualityDefinitionFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_]+$/),
  name: trimmed(120),
  description: nullableText(500),
  dataType: qualityDataTypeSchema,
  unit: nullableText(32),
  required: z.boolean(),
  minimumValue: nonNegativeDecimalSchema.nullable(),
  maximumValue: nonNegativeDecimalSchema.nullable(),
  allowedValues: z.array(trimmed(120)).min(1).max(30).nullable(),
  displayOrder: z.number().int().min(0).max(1000),
  status: configurationStatusSchema,
};

export const qualityDefinitionInputSchema = z
  .object(qualityDefinitionFields)
  .strict()
  .superRefine((value, context) => {
    if (value.dataType === 'ENUM' && !value.allowedValues) {
      context.addIssue({
        code: 'custom',
        path: ['allowedValues'],
        message: 'Enum attributes require allowed values',
      });
    }
    if (value.dataType !== 'ENUM' && value.allowedValues) {
      context.addIssue({
        code: 'custom',
        path: ['allowedValues'],
        message: 'Allowed values are valid only for enum attributes',
      });
    }
    if (
      !['DECIMAL', 'INTEGER'].includes(value.dataType) &&
      (value.minimumValue || value.maximumValue)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['minimumValue'],
        message: 'Only numeric attributes may define ranges',
      });
    }
    if (
      value.minimumValue &&
      value.maximumValue &&
      Number(value.minimumValue) > Number(value.maximumValue)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maximumValue'],
        message: 'Maximum must be greater than or equal to minimum',
      });
    }
  });

export const qualityDefinitionSchema = z.object({
  id: uuid,
  commodityFormId: uuid,
  organizationId: uuid.nullable(),
  ...qualityDefinitionFields,
});

export const updateQualityConfigurationSchema = z
  .object({ definitions: z.array(qualityDefinitionInputSchema).min(1).max(30) })
  .strict();

export const registerDeviceSchema = z
  .object({ assignedUserId: uuid, name: trimmed(160), platform: trimmed(80) })
  .strict();
export const registeredDeviceSchema = z.object({
  id: uuid,
  organizationId: uuid,
  assignedUserId: uuid,
  devicePublicId: trimmed(128),
  name: trimmed(160),
  platform: trimmed(80),
  status: deviceStatusSchema,
  lastSeenAt: timestamp.nullable(),
  registeredAt: timestamp,
  revokedAt: timestamp.nullable(),
});

const locationReadingSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().int().min(0).max(100_000),
  })
  .strict();

export const openCollectionSessionSchema = z
  .object({
    collectionPointId: uuid,
    deviceId: uuid,
    businessDate: z.iso.date(),
    location: locationReadingSchema.optional(),
    notes: optionalText(1000),
  })
  .strict();
export const closeCollectionSessionSchema = z
  .object({ location: locationReadingSchema.optional(), notes: optionalText(1000) })
  .strict();
export const collectionSessionSchema = z.object({
  id: uuid,
  organizationId: uuid,
  collectionPointId: uuid,
  agentUserId: uuid,
  deviceId: uuid,
  businessDate: z.iso.date(),
  status: collectionSessionStatusSchema,
  openedAt: timestamp,
  openedLatitude: z.string().nullable(),
  openedLongitude: z.string().nullable(),
  openedAccuracyMeters: z.number().int().nullable(),
  openedDistanceMeters: z.number().int().nullable(),
  openedLocationFlagged: z.boolean(),
  closedAt: timestamp.nullable(),
  closedLatitude: z.string().nullable(),
  closedLongitude: z.string().nullable(),
  closedAccuracyMeters: z.number().int().nullable(),
  closedDistanceMeters: z.number().int().nullable(),
  closedLocationFlagged: z.boolean(),
  notes: nullableText(1000),
});

export const directWeightSchema = z
  .object({
    mode: z.literal('DIRECT_NET'),
    netQuantity: preciseQuantitySchema,
    unit: quantityUnitSchema,
    captureMethod: z.literal('MANUAL'),
    instrumentId: uuid.optional(),
  })
  .strict();
export const grossTareWeightSchema = z
  .object({
    mode: z.literal('GROSS_TARE'),
    grossQuantity: preciseQuantitySchema,
    tareQuantity: nonNegativeDecimalSchema.default('0'),
    unit: quantityUnitSchema,
    captureMethod: z.literal('MANUAL'),
    clientNetQuantity: preciseQuantitySchema.optional(),
    instrumentId: uuid.optional(),
  })
  .strict();
export const deliveryWeightSchema = z.discriminatedUnion('mode', [
  directWeightSchema,
  grossTareWeightSchema,
]);

export const deliveryPricingInputSchema = z
  .object({
    unitPriceMinor: moneyMinorSchema,
    currency: z.literal('UGX'),
    adjustmentAmountMinor: signedMoneyMinorSchema.default('0'),
    priceSource: priceSourceSchema,
    priceReference: optionalText(160),
    overrideReason: optionalText(500),
    clientGrossAmountMinor: moneyMinorSchema.optional(),
    clientNetAmountMinor: moneyMinorSchema.optional(),
  })
  .strict()
  .refine((value) => value.priceSource !== 'MANUAL_OVERRIDE' || value.overrideReason, {
    path: ['overrideReason'],
    message: 'Manual price overrides require a reason',
  });

const qualityValueBase = {
  qualityAttributeDefinitionId: uuid,
  capturedAt: timestamp,
  notes: optionalText(500),
};
export const qualityValueSchema = z.discriminatedUnion('dataType', [
  z
    .object({
      ...qualityValueBase,
      dataType: z.literal('DECIMAL'),
      value: nonNegativeDecimalSchema,
    })
    .strict(),
  z
    .object({ ...qualityValueBase, dataType: z.literal('INTEGER'), value: z.number().int() })
    .strict(),
  z.object({ ...qualityValueBase, dataType: z.literal('TEXT'), value: trimmed(500) }).strict(),
  z.object({ ...qualityValueBase, dataType: z.literal('ENUM'), value: trimmed(120) }).strict(),
  z.object({ ...qualityValueBase, dataType: z.literal('BOOLEAN'), value: z.boolean() }).strict(),
]);

export const deliveryConfirmationInputSchema = z
  .object({
    method: confirmationMethodSchema,
    status: confirmationStatusSchema,
    confirmedByName: optionalText(200),
    confirmationReference: optionalText(160),
    confirmedAt: timestamp,
  })
  .strict();

export const confirmDeliverySchema = z
  .object({
    lockVersion: z.number().int().positive(),
    confirmation: deliveryConfirmationInputSchema,
  })
  .strict();

export const createDeliverySchema = z
  .object({
    clientEntityId: uuid,
    deviceId: uuid,
    collectionSessionId: uuid,
    collectionPointId: uuid,
    farmerId: uuid,
    farmId: uuid.optional(),
    commodityId: uuid,
    commodityFormId: uuid,
    clientCreatedAt: timestamp,
    weight: deliveryWeightSchema,
    pricing: deliveryPricingInputSchema,
    qualityMeasurements: z.array(qualityValueSchema).max(30),
    confirmation: deliveryConfirmationInputSchema.optional(),
    notes: optionalText(1000),
    submit: z.boolean().default(true),
    accept: z.boolean().default(false),
  })
  .strict();

export const deliveryVersionCommandSchema = z
  .object({ lockVersion: z.number().int().positive() })
  .strict();
export const reweighDeliverySchema = z
  .object({
    lockVersion: z.number().int().positive(),
    capturedAt: timestamp,
    weight: deliveryWeightSchema,
  })
  .strict();
export const rejectDeliverySchema = z
  .object({ lockVersion: z.number().int().positive(), reason: trimmed(1000) })
  .strict();

export const deliveryMeasurementSchema = z.object({
  id: uuid,
  grossQuantity: z.string().nullable(),
  tareQuantity: z.string().nullable(),
  netQuantity: z.string(),
  unit: quantityUnitSchema,
  captureMethod: z.enum(['MANUAL', 'DEVICE_IMPORT']),
  reportedInstrumentId: uuid.nullable(),
  instrumentId: uuid.nullable(),
  instrumentFlagged: z.boolean(),
  instrumentFlagReason: instrumentFlagReasonSchema.nullable(),
  version: z.number().int().positive(),
  supersedesMeasurementId: uuid.nullable(),
});
export const deliveryPricingSchema = z.object({
  unitPriceMinor: moneyMinorSchema,
  currency: z.literal('UGX'),
  quantity: z.string(),
  quantityUnit: quantityUnitSchema,
  grossAmountMinor: moneyMinorSchema,
  adjustmentAmountMinor: signedMoneyMinorSchema,
  netAmountMinor: moneyMinorSchema,
  priceSource: priceSourceSchema,
  priceReference: z.string().nullable(),
});
export const deliveryQualityMeasurementSchema = z.object({
  qualityAttributeDefinitionId: uuid,
  code: trimmed(60),
  name: trimmed(120),
  dataType: qualityDataTypeSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
  unit: z.string().nullable(),
});
export const deliveryConfirmationSchema = z.object({
  id: uuid,
  method: confirmationMethodSchema,
  status: confirmationStatusSchema,
  confirmedByName: z.string().nullable(),
  confirmedAt: timestamp,
  witnessUserId: uuid.nullable(),
});

export const deliveryCorrectionSummarySchema = z.object({
  id: uuid,
  reasonCode: correctionReasonCodeSchema,
  reason: trimmed(1000),
  status: correctionStatusSchema,
  requestedByUserId: uuid,
  reviewedByUserId: uuid.nullable(),
  reviewedAt: timestamp.nullable(),
  reviewNotes: z.string().nullable(),
  replacementDeliveryVersionId: uuid.nullable(),
  createdAt: timestamp,
});

export const deliveryListItemSchema = z.object({
  id: uuid,
  publicId: trimmed(128),
  deliveryNumber: trimmed(80),
  version: z.number().int().positive(),
  lockVersion: z.number().int().positive(),
  status: deliveryStatusSchema,
  source: deliverySourceSchema,
  farmerId: uuid,
  farmerDisplayName: trimmed(302),
  farmerNumber: trimmed(40),
  commodityName: trimmed(120),
  commodityFormName: trimmed(120),
  netQuantity: z.string(),
  netAmountMinor: moneyMinorSchema,
  currency: z.literal('UGX'),
  serverReceivedAt: timestamp,
  clientClockFlagged: z.boolean(),
});

export const deliveryDetailSchema = deliveryListItemSchema.extend({
  organizationId: uuid,
  collectionPointId: uuid,
  collectionPointName: trimmed(200),
  collectionSessionId: uuid,
  farmId: uuid.nullable(),
  farmName: z.string().nullable(),
  commodityId: uuid,
  commodityFormId: uuid,
  clientCreatedAt: timestamp,
  acceptedAt: timestamp.nullable(),
  confirmedAt: timestamp.nullable(),
  confirmationMethod: confirmationMethodSchema.nullable(),
  notes: z.string().nullable(),
  measurement: deliveryMeasurementSchema,
  pricing: deliveryPricingSchema,
  qualityMeasurements: z.array(deliveryQualityMeasurementSchema),
  confirmations: z.array(deliveryConfirmationSchema),
  correctionRequests: z.array(deliveryCorrectionSummarySchema),
  supersedesDeliveryId: uuid.nullable(),
});

export const receiptSchema = z.object({
  id: uuid,
  deliveryId: uuid,
  receiptNumber: trimmed(80),
  version: z.number().int().positive(),
  status: receiptStatusSchema,
  issuedAt: timestamp,
  checksum: trimmed(128),
  shortVerificationCode: trimmed(24),
  reprintCount: z.number().int().nonnegative(),
  isReprint: z.boolean(),
  supersededById: uuid.nullable(),
  statement: z.literal(
    'This is a collection receipt and is not necessarily proof of final payment.',
  ),
  delivery: deliveryDetailSchema,
  cooperativeName: trimmed(200),
  agentName: trimmed(202),
  verificationUrl: z.url(),
});

const correctionChangesSchema = z
  .object({
    farmerId: uuid.optional(),
    farmId: uuid.nullable().optional(),
    commodityFormId: uuid.optional(),
    weight: deliveryWeightSchema.optional(),
    pricing: deliveryPricingInputSchema.optional(),
    qualityMeasurements: z.array(qualityValueSchema).max(30).optional(),
    notes: optionalText(1000),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one proposed change is required');

export const requestDeliveryCorrectionSchema = z
  .object({
    reasonCode: correctionReasonCodeSchema,
    reason: trimmed(1000),
    proposedChanges: correctionChangesSchema,
  })
  .strict();
export const reviewDeliveryCorrectionSchema = z
  .object({ reviewNotes: optionalText(1000) })
  .strict();
export const deliveryCorrectionSchema = z.object({
  id: uuid,
  deliveryId: uuid,
  requestedByUserId: uuid,
  reasonCode: correctionReasonCodeSchema,
  reason: trimmed(1000),
  proposedChanges: correctionChangesSchema,
  status: correctionStatusSchema,
  reviewedByUserId: uuid.nullable(),
  reviewedAt: timestamp.nullable(),
  reviewNotes: z.string().nullable(),
  replacementDeliveryVersionId: uuid.nullable(),
  createdAt: timestamp,
});

const offlineOperationBase = {
  clientOperationId: uuid,
  clientEntityId: uuid,
  clientCreatedAt: timestamp,
  baseVersion: z.number().int().positive().nullable(),
};
export const offlineOperationRequestSchema = z.discriminatedUnion('operationType', [
  z
    .object({
      ...offlineOperationBase,
      operationType: z.literal('CREATE_DELIVERY'),
      payload: createDeliverySchema,
    })
    .strict(),
  z
    .object({
      ...offlineOperationBase,
      operationType: z.literal('CONFIRM_DELIVERY'),
      payload: z
        .object({ deliveryId: uuid, confirmation: deliveryConfirmationInputSchema })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...offlineOperationBase,
      operationType: z.literal('SUBMIT_DELIVERY'),
      payload: z.object({ deliveryId: uuid, lockVersion: z.number().int().positive() }).strict(),
    })
    .strict(),
  z
    .object({
      ...offlineOperationBase,
      operationType: z.literal('REQUEST_DELIVERY_CORRECTION'),
      payload: z.object({ deliveryId: uuid, correction: requestDeliveryCorrectionSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...offlineOperationBase,
      operationType: z.literal('CREATE_BATCH'),
      payload: z
        .object({
          commodityId: uuid,
          commodityFormId: uuid,
          storageLocationId: uuid.optional(),
          batchNumber: trimmed(80),
          clientBatchId: uuid,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...offlineOperationBase,
      operationType: z.literal('ADD_BATCH_CONTRIBUTION'),
      payload: z
        .object({
          batchId: uuid,
          deliveryId: uuid,
          quantity: preciseQuantitySchema,
          unit: quantityUnitSchema,
        })
        .strict(),
    })
    .strict(),
]);
export const offlineSyncBatchSchema = z
  .object({
    deviceId: uuid,
    operations: z
      .array(offlineOperationRequestSchema)
      .min(1)
      .max(250, 'Maximum 250 operations per request; split remaining operations into another page'),
  })
  .strict();
export const offlineOperationResultSchema = z.object({
  clientOperationId: uuid,
  status: offlineOperationStatusSchema,
  serverEntityId: uuid.nullable(),
  serverVersion: z.number().int().positive().nullable(),
  error: z.object({ code: trimmed(120), message: trimmed(500) }).nullable(),
});
export const offlineSyncResponseSchema = z.object({
  operations: z.array(offlineOperationResultSchema),
  serverTime: timestamp,
  nextSnapshotCursor: trimmed(256),
});

export const collectionSnapshotQuerySchema = z.object({
  collectionPointId: uuid,
  deviceId: uuid,
  collectionSessionId: uuid,
  updatedSince: timestamp.optional(),
});
export const collectionSnapshotSchema = z.object({
  organizationId: uuid,
  collectionPoint: z.object({
    id: uuid,
    name: trimmed(200),
    code: trimmed(40),
    status: z.enum(['ACTIVE', 'INACTIVE', 'CLOSED']),
  }),
  farmers: z.array(
    z.object({
      id: uuid,
      farmerNumber: trimmed(40),
      displayName: trimmed(302),
      membershipId: uuid,
      membershipNumber: z.string().nullable(),
      membershipStatus: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT']),
      updatedAt: timestamp,
    }),
  ),
  qrIdentities: z.array(
    z.object({
      publicId: trimmed(128),
      farmerId: uuid,
      status: z.enum(['ACTIVE', 'REVOKED', 'REPLACED', 'EXPIRED']),
      updatedAt: timestamp,
    }),
  ),
  farms: z.array(
    z.object({
      id: uuid,
      farmerId: uuid,
      name: trimmed(200),
      district: trimmed(120),
      village: z.string().nullable(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
      updatedAt: timestamp,
    }),
  ),
  commodities: z.array(commoditySchema),
  qualityDefinitions: z.array(qualityDefinitionSchema),
  tombstones: z.array(
    z.object({
      entityType: z.enum([
        'FARMER_MEMBERSHIP',
        'QR_IDENTITY',
        'FARM',
        'COMMODITY_FORM',
        'QUALITY_DEFINITION',
      ]),
      entityId: z.string(),
      status: trimmed(40),
      updatedAt: timestamp,
    }),
  ),
  serverTime: timestamp,
  dataVersion: trimmed(64),
  nextCursor: trimmed(256),
});

export const deliveryCursorSchema = z
  .string()
  .regex(
    /^\d{13}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'Use a cursor returned by a previous delivery page',
  );

export const deliveryListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  cursor: deliveryCursorSchema.optional(),
  status: deliveryStatusSchema.optional(),
  collectionPointId: uuid.optional(),
  farmerId: uuid.optional(),
  from: timestamp.optional(),
  to: timestamp.optional(),
});

export const phaseTwoErrorCodeSchema = z.enum([
  'DEVICE_REVOKED',
  'COLLECTION_SESSION_CLOSED',
  'COLLECTION_SESSION_SUSPENDED',
  'FARMER_MEMBERSHIP_INACTIVE',
  'QR_IDENTITY_INVALID',
  'COMMODITY_FORM_INACTIVE',
  'QUALITY_MEASUREMENT_REQUIRED',
  'QUALITY_MEASUREMENT_OUT_OF_RANGE',
  'INVALID_WEIGHT',
  'INVALID_PRICE',
  'INVALID_DELIVERY_STATE_TRANSITION',
  'DELIVERY_VERSION_CONFLICT',
  'CORRECTION_SELF_APPROVAL_FORBIDDEN',
  'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
  'OFFLINE_OPERATION_UNSUPPORTED',
  'OFFLINE_BATCH_TOO_LARGE',
  'SERVER_CALCULATION_MISMATCH',
]);

export type QualityDefinitionInput = z.infer<typeof qualityDefinitionInputSchema>;
export type UpdateQualityConfiguration = z.infer<typeof updateQualityConfigurationSchema>;
export type RegisterDevice = z.infer<typeof registerDeviceSchema>;
export type OpenCollectionSession = z.infer<typeof openCollectionSessionSchema>;
export type CloseCollectionSession = z.infer<typeof closeCollectionSessionSchema>;
export type DeliveryWeight = z.infer<typeof deliveryWeightSchema>;
export type DeliveryPricingInput = z.infer<typeof deliveryPricingInputSchema>;
export type QualityValue = z.infer<typeof qualityValueSchema>;
export type DeliveryConfirmationInput = z.infer<typeof deliveryConfirmationInputSchema>;
export type ConfirmDelivery = z.infer<typeof confirmDeliverySchema>;
export type CreateDelivery = z.infer<typeof createDeliverySchema>;
export type DeliveryVersionCommand = z.infer<typeof deliveryVersionCommandSchema>;
export type ReweighDelivery = z.infer<typeof reweighDeliverySchema>;
export type RejectDelivery = z.infer<typeof rejectDeliverySchema>;
export type RequestDeliveryCorrection = z.infer<typeof requestDeliveryCorrectionSchema>;
export type ReviewDeliveryCorrection = z.infer<typeof reviewDeliveryCorrectionSchema>;
export type OfflineOperationRequest = z.infer<typeof offlineOperationRequestSchema>;
export type OfflineSyncBatch = z.infer<typeof offlineSyncBatchSchema>;
export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;
