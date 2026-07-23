import { z } from 'zod';

const localAccessTokenSecret = 'local-only-access-token-secret-change-me';
const localHederaReferenceSecret = 'local-only-hedera-reference-secret-change-me';
const localPaymentEncryptionKey = 'bG9jYWwtb25seS1wYXltZW50LWtleS0zMi1ieXRlcyE=';

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
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    API_DOCS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    DATABASE_URL: z.string().min(1),
    REDIS_HOST: z.string().min(1).default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().max(65_535).default(6379),
    REDIS_PASSWORD: z.string().optional(),
    S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3).default('clycites-local'),
    S3_ACCESS_KEY: z.string().min(1).default('clycites'),
    S3_SECRET_KEY: z.string().min(8).default('clycites_local_only'),
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
    AUTH_REFRESH_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_REFRESH_COOKIE_SAME_SITE: z.enum(['lax', 'strict']).default('lax'),
    QR_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
    PAYMENT_ENCRYPTION_KEY_BASE64: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'Payment encryption key must decode to exactly 32 bytes',
      })
      .default(localPaymentEncryptionKey),
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
    if (environment.NODE_ENV === 'production' && !environment.WEB_ORIGIN.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: 'Production web origin must use HTTPS',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.S3_ENDPOINT.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message: 'Production object storage must use HTTPS',
      });
    }
    if (environment.NODE_ENV === 'production' && environment.API_DOCS_ENABLED) {
      context.addIssue({
        code: 'custom',
        path: ['API_DOCS_ENABLED'],
        message: 'Production API documentation must be explicitly disabled',
      });
    }
    if (environment.NODE_ENV === 'production' && !environment.AUTH_REFRESH_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_COOKIE_SECURE'],
        message: 'Production refresh cookies must be secure',
      });
    }
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
    if (
      environment.NODE_ENV === 'production' &&
      environment.PAYMENT_ENCRYPTION_KEY_BASE64 === localPaymentEncryptionKey
    ) {
      context.addIssue({
        code: 'custom',
        path: ['PAYMENT_ENCRYPTION_KEY_BASE64'],
        message: 'A production payment encryption key must be configured',
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
  const normalized = Object.fromEntries(
    Object.entries(environment).filter(([, value]) => value !== ''),
  );
  const result = apiEnvironmentSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(`Invalid API environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
};
