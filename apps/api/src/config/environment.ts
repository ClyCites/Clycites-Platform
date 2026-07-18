import { z } from 'zod';

export const apiEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().min(1).default('0.1.0'),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().max(65_535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BUILD_SHA: z.string().min(1).default('local'),
  ENQUEUE_FOUNDATION_CHECK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export const validateEnvironment = (environment: Record<string, unknown>): ApiEnvironment => {
  const result = apiEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid API environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
};
