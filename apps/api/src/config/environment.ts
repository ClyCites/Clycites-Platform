import { z } from 'zod';

const localAccessTokenSecret = 'local-only-access-token-secret-change-me';
const localHederaReferenceSecret = 'local-only-hedera-reference-secret-change-me';

const environmentBoolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

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
    HEDERA_PROVIDER: z.enum(['mock', 'sdk']).default('mock'),
    HEDERA_NETWORK: z.enum(['local', 'testnet', 'previewnet', 'mainnet']).default('local'),
    HEDERA_OPERATOR_ID: z.string().trim().optional(),
    HEDERA_OPERATOR_KEY: z.string().trim().optional(),
    HEDERA_TOPIC_ID: z.string().trim().optional(),
    HEDERA_MIRROR_NODE_URL: z.string().url().optional(),
    HEDERA_SUBMISSION_ENABLED: environmentBoolean,
    HEDERA_CONFIRMATION_ENABLED: environmentBoolean,
    HEDERA_MAX_TRANSACTION_FEE_USD: z.coerce.number().positive().default(1),
    HEDERA_USD_PER_HBAR: z.coerce.number().positive().optional(),
    HEDERA_CONFIRMATION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
    HEDERA_CONFIRMATION_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(5),
    HEDERA_REFERENCE_SECRET: z.string().min(32).default(localHederaReferenceSecret),
    HEDERA_REFERENCE_SECRET_VERSION: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .default('v1'),
    HEDERA_MAINNET_ACKNOWLEDGEMENT: z.string().optional(),
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
    if (environment.HEDERA_PROVIDER === 'mock' && environment.HEDERA_NETWORK !== 'local') {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_NETWORK'],
        message: 'The mock Hedera provider must use the local network',
      });
    }
    if (environment.HEDERA_PROVIDER === 'sdk' && environment.HEDERA_NETWORK === 'local') {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_NETWORK'],
        message: 'The SDK Hedera provider requires a Hedera network',
      });
    }
    if (environment.HEDERA_SUBMISSION_ENABLED && environment.HEDERA_PROVIDER === 'sdk') {
      for (const field of [
        'HEDERA_OPERATOR_ID',
        'HEDERA_OPERATOR_KEY',
        'HEDERA_TOPIC_ID',
        'HEDERA_USD_PER_HBAR',
      ] as const) {
        if (!environment[field]) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when Hedera submission is enabled`,
          });
        }
      }
    }
    if (environment.HEDERA_CONFIRMATION_ENABLED && !environment.HEDERA_MIRROR_NODE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_MIRROR_NODE_URL'],
        message: 'A Mirror Node URL is required when confirmation is enabled',
      });
    }
    if (
      environment.HEDERA_NETWORK === 'mainnet' &&
      (environment.HEDERA_SUBMISSION_ENABLED || environment.HEDERA_CONFIRMATION_ENABLED) &&
      environment.HEDERA_MAINNET_ACKNOWLEDGEMENT !== 'I_UNDERSTAND_MAINNET_CHARGES'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_MAINNET_ACKNOWLEDGEMENT'],
        message: 'Mainnet requires explicit startup acknowledgement',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.HEDERA_REFERENCE_SECRET === localHederaReferenceSecret
    ) {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_REFERENCE_SECRET'],
        message: 'A production Hedera reference secret must be configured',
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
