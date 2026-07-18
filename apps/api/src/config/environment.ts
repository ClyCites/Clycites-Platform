import { z } from 'zod';

const localAccessTokenSecret = 'local-only-access-token-secret-change-me';

export const apiEnvironmentSchema = z
  .object({
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
    AUTH_ACCESS_TOKEN_SECRET: z.string().min(32).default(localAccessTokenSecret),
    AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    AUTH_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default('clycites_refresh'),
    QR_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_ACCESS_TOKEN_SECRET === localAccessTokenSecret
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_ACCESS_TOKEN_SECRET'],
        message: 'A production access-token secret must be configured',
      });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export const validateEnvironment = (environment: Record<string, unknown>): ApiEnvironment => {
  const result = apiEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid API environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
};
