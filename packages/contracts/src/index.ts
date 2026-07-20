import { z } from 'zod';

export * from './phase-one.js';
export * from './phase-two.js';
export * from './phase-three.js';
export * from './phase-four.js';
export * from './phase-five.js';
export * from './phase-six.js';
export * from './phase-seven.js';
export * from './phase-eight.js';

export const uuidSchema = z.uuid();

export const apiMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: z.iso.datetime(),
});

export const apiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: apiMetaSchema,
  });

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    details: z.unknown().nullable(),
  }),
  meta: apiMetaSchema,
});

export const healthDataSchema = z.object({
  status: z.literal('ok'),
});

export const dependencyStatusSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().nonnegative().optional(),
  message: z.string().optional(),
});

export const readinessDataSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  dependencies: z.object({
    postgres: dependencyStatusSchema,
    redis: dependencyStatusSchema,
  }),
});

export const versionDataSchema = z.object({
  application: z.string().min(1),
  apiVersion: z.string().min(1),
  environment: z.string().min(1),
  version: z.string().min(1),
  buildSha: z.string().min(1),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export type ApiMeta = z.infer<typeof apiMetaSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthData = z.infer<typeof healthDataSchema>;
export type ReadinessData = z.infer<typeof readinessDataSchema>;
export type VersionData = z.infer<typeof versionDataSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type ApiSuccess<T> = { data: T; meta: ApiMeta };
