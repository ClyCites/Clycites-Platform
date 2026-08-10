import { z } from 'zod';

import { preciseQuantitySchema, quantityUnitSchema } from './phase-two.js';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const trimmed = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => trimmed(maximum).optional();

export const produceBatchStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'SEALED',
  'CONSUMED',
  'CANCELLED',
]);
export const batchOperationTypeSchema = z.enum(['AGGREGATION', 'SPLIT', 'MERGE', 'TRANSFORMATION']);
export const cooperativeLotStatusSchema = z.enum([
  'DRAFT',
  'READY',
  'APPROVED',
  'CLOSED',
  'CANCELLED',
]);
export const qualityInspectionStatusSchema = z.enum(['DRAFT', 'PASSED', 'FAILED']);
export const custodyTransferStatusSchema = z.enum([
  'DRAFT',
  'DISPATCHED',
  'RECEIVED',
  'REJECTED',
  'CANCELLED',
]);

export const createStorageLocationSchema = z
  .object({ code: trimmed(40), name: trimmed(160), description: optionalText(500) })
  .strict();

export const createBatchSchema = z
  .object({
    commodityId: uuid,
    commodityFormId: uuid,
    storageLocationId: uuid.optional(),
    batchNumber: trimmed(80),
    clientBatchId: uuid.optional(),
  })
  .strict();

export const addBatchContributionSchema = z
  .object({ deliveryId: uuid, quantity: preciseQuantitySchema, unit: quantityUnitSchema })
  .strict();

const transformationMeasurementProvenance = {
  captureMethod: z.enum(['MANUAL', 'DEVICE_IMPORT']).optional(),
  instrumentId: uuid.optional(),
};

export const transformationLossReasonSchema = z.enum([
  'WATER_LOSS',
  'PULP_REMOVAL',
  'HULLING_BYPRODUCT',
  'SORTING_REJECT',
  'SHRINKAGE',
  'SPILLAGE',
  'OTHER',
]);

export const batchTransformationInputSchema = z
  .object({
    batchId: uuid,
    quantity: preciseQuantitySchema,
    unit: quantityUnitSchema,
    ...transformationMeasurementProvenance,
  })
  .strict();
export const batchTransformationOutputSchema = z
  .object({
    batchNumber: trimmed(80),
    commodityId: uuid,
    commodityFormId: uuid,
    storageLocationId: uuid.optional(),
    quantity: preciseQuantitySchema,
    unit: quantityUnitSchema,
    ...transformationMeasurementProvenance,
  })
  .strict();
export const createBatchTransformationSchema = z
  .object({
    transformationNumber: trimmed(80),
    type: z.enum(['SPLIT', 'MERGE', 'TRANSFORMATION']),
    description: optionalText(1000),
    inputs: z.array(batchTransformationInputSchema).min(1).max(100),
    outputs: z.array(batchTransformationOutputSchema).min(1).max(100),
    lossReason: transformationLossReasonSchema.optional(),
    lossNote: optionalText(500),
    lossQuantity: preciseQuantitySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === 'SPLIT' && value.inputs.length !== 1) {
      context.addIssue({ code: 'custom', path: ['inputs'], message: 'A split has one input' });
    }
    if (value.type === 'MERGE' && value.inputs.length < 2) {
      context.addIssue({
        code: 'custom',
        path: ['inputs'],
        message: 'A merge has multiple inputs',
      });
    }
    if (value.lossReason === 'OTHER' && !value.lossNote) {
      context.addIssue({
        code: 'custom',
        path: ['lossNote'],
        message: 'A loss reason of OTHER must describe where the mass went',
      });
    }
    if (!value.lossReason && value.lossNote) {
      context.addIssue({
        code: 'custom',
        path: ['lossReason'],
        message: 'A loss note requires a loss reason',
      });
    }
  });

export const supersedeBatchTransformationSchema = z
  .object({ reason: trimmed(500), replacement: createBatchTransformationSchema })
  .strict();

export const createCooperativeLotSchema = z
  .object({
    lotNumber: trimmed(80),
    commodityId: uuid,
    commodityFormId: uuid,
    storageLocationId: uuid.optional(),
    contributions: z
      .array(z.object({ batchId: uuid, quantity: preciseQuantitySchema }).strict())
      .min(1)
      .max(100),
  })
  .strict();

const inspectionValueBase = { qualityAttributeDefinitionId: uuid };
export const inspectionValueSchema = z.discriminatedUnion('dataType', [
  z.object({
    ...inspectionValueBase,
    dataType: z.literal('DECIMAL'),
    value: preciseQuantitySchema,
  }),
  z.object({ ...inspectionValueBase, dataType: z.literal('INTEGER'), value: z.number().int() }),
  z.object({ ...inspectionValueBase, dataType: z.literal('TEXT'), value: trimmed(500) }),
  z.object({ ...inspectionValueBase, dataType: z.literal('ENUM'), value: trimmed(120) }),
  z.object({ ...inspectionValueBase, dataType: z.literal('BOOLEAN'), value: z.boolean() }),
]);
export const createQualityInspectionSchema = z
  .object({
    status: z.enum(['PASSED', 'FAILED']),
    inspectedAt: timestamp,
    notes: optionalText(1000),
    measurements: z.array(inspectionValueSchema).min(1).max(30),
  })
  .strict();

export const createCustodyTransferSchema = z
  .object({
    transferNumber: trimmed(80),
    toOrganizationId: uuid,
    originLocationId: uuid.optional(),
    destinationLocationId: uuid.optional(),
    quantity: preciseQuantitySchema,
    unit: quantityUnitSchema,
    notes: optionalText(1000),
  })
  .strict();
export const receiveCustodyTransferSchema = z
  .object({ accepted: z.boolean(), notes: optionalText(1000) })
  .strict();

export const publishTraceabilitySchema = z
  .object({
    originDistrict: trimmed(120),
    harvestSeason: trimmed(80),
    processingSummary: trimmed(500),
  })
  .strict();

export const availabilitySchema = z.object({
  totalQuantity: preciseQuantitySchema.or(z.literal('0')),
  allocatedQuantity: preciseQuantitySchema.or(z.literal('0')),
  availableQuantity: preciseQuantitySchema.or(z.literal('0')),
  unit: quantityUnitSchema,
});

export const publicLotTraceabilitySchema = z.object({
  publicId: trimmed(128),
  lotNumber: trimmed(80),
  organizationName: trimmed(200),
  commodity: trimmed(120),
  commodityForm: trimmed(120),
  quantity: preciseQuantitySchema,
  unit: quantityUnitSchema,
  status: z.literal('APPROVED'),
  originDistrict: trimmed(120),
  harvestSeason: trimmed(80),
  processingSummary: trimmed(500),
  quality: z.array(
    z.object({ name: trimmed(120), value: z.string(), unit: z.string().nullable() }),
  ),
  custody: z.array(
    z.object({
      fromOrganization: trimmed(200),
      toOrganization: trimmed(200),
      dispatchedAt: timestamp,
      receivedAt: timestamp.nullable(),
      status: z.enum(['DISPATCHED', 'RECEIVED']),
    }),
  ),
  publishedAt: timestamp,
});

export const PHASE_THREE_ERROR_CODES = {
  SOURCE_NOT_ACCEPTED: 'SOURCE_NOT_ACCEPTED',
  SOURCE_ALREADY_ALLOCATED: 'SOURCE_ALREADY_ALLOCATED',
  INSUFFICIENT_AVAILABLE_QUANTITY: 'INSUFFICIENT_AVAILABLE_QUANTITY',
  COMMODITY_MISMATCH: 'COMMODITY_MISMATCH',
  INVALID_BATCH_STATE: 'INVALID_BATCH_STATE',
  INVALID_LOT_STATE: 'INVALID_LOT_STATE',
  QUALITY_INSPECTION_REQUIRED: 'QUALITY_INSPECTION_REQUIRED',
  CUSTODY_TRANSFER_CONFLICT: 'CUSTODY_TRANSFER_CONFLICT',
  TRACEABILITY_NOT_PUBLISHED: 'TRACEABILITY_NOT_PUBLISHED',
  TRANSFORMATION_MASS_GAIN_FORBIDDEN: 'TRANSFORMATION_MASS_GAIN_FORBIDDEN',
  TRANSFORMATION_LOSS_REASON_REQUIRED: 'TRANSFORMATION_LOSS_REASON_REQUIRED',
  TRANSFORMATION_LOSS_QUANTITY_MISMATCH: 'TRANSFORMATION_LOSS_QUANTITY_MISMATCH',
  TRANSFORMATION_ALREADY_SUPERSEDED: 'TRANSFORMATION_ALREADY_SUPERSEDED',
  TRANSFORMATION_OUTPUT_NOT_REVERSIBLE: 'TRANSFORMATION_OUTPUT_NOT_REVERSIBLE',
} as const;

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type CreateStorageLocationInput = z.infer<typeof createStorageLocationSchema>;
export type AddBatchContributionInput = z.infer<typeof addBatchContributionSchema>;
export type CreateBatchTransformationInput = z.infer<typeof createBatchTransformationSchema>;
export type SupersedeBatchTransformationInput = z.infer<
  typeof supersedeBatchTransformationSchema
>;
export type CreateCooperativeLotInput = z.infer<typeof createCooperativeLotSchema>;
export type CreateQualityInspectionInput = z.infer<typeof createQualityInspectionSchema>;
export type CreateCustodyTransferInput = z.infer<typeof createCustodyTransferSchema>;
export type PublishTraceabilityInput = z.infer<typeof publishTraceabilitySchema>;
export type PublicLotTraceability = z.infer<typeof publicLotTraceabilitySchema>;
