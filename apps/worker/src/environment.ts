import { z } from 'zod';

export const workerEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().max(65_535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const validateEnvironment = (environment: Record<string, unknown>): WorkerEnvironment => {
  const result = workerEnvironmentSchema.safeParse(environment);
  if (!result.success)
    throw new Error(`Invalid worker environment: ${z.prettifyError(result.error)}`);
  return result.data;
};
