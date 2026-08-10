import { z } from 'zod';

const localAccessTokenSecret = 'local-only-access-token-secret-change-me';
const localAccessTokenKeys = [{ kid: 'local-v1', secret: localAccessTokenSecret }];
const localDeviceTokenPepper = 'local-only-device-token-pepper-change-me';
const localIdentifierHashPepper = 'local-only-identifier-hash-pepper-change-me';
const localRefreshTokenPepper = 'local-only-refresh-token-pepper-change-me';
const localCredentialTokenPepper = 'local-only-credential-token-pepper-change-me';
const localMfaTokenPepper = 'local-only-mfa-token-pepper-change-me';
const localMfaEncryptionKey = 'BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=';
const localHederaReferenceSecret = 'local-only-hedera-reference-secret-change-me';
const localPaymentEncryptionKey = 'bG9jYWwtb25seS1wYXltZW50LWtleS0zMi1ieXRlcyE=';

const environmentBoolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const accessTokenKeys = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  },
  z
    .array(
      z.object({
        kid: z.string().regex(/^[A-Za-z0-9._-]+$/),
        secret: z.string().min(32),
      }),
    )
    .min(1)
    .refine((keys) => new Set(keys.map(({ kid }) => kid)).size === keys.length, {
      message: 'Access-token key ids must be unique',
    }),
);

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
    OFFLINE_SYNC_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(30),
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
    AUTH_ACCESS_TOKEN_KEYS: accessTokenKeys.default(localAccessTokenKeys),
    AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
    AUTH_JWT_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(300).default(120),
    AUTH_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    AUTH_DEVICE_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    AUTH_DEVICE_TOKEN_PEPPER: z.string().min(32).default(localDeviceTokenPepper),
    AUTH_LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(20).default(5),
    AUTH_LOGIN_LOCKOUT_BASE_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
    AUTH_LOGIN_LOCKOUT_MAX_SECONDS: z.coerce.number().int().min(1).max(86_400).default(3600),
    AUTH_IDENTIFIER_HASH_PEPPER: z.string().min(32).default(localIdentifierHashPepper),
    AUTH_IDENTIFIER_COOLDOWN_DAYS: z.coerce.number().int().min(1).max(730).default(180),
    AUTH_REFRESH_TOKEN_PEPPER: z.string().min(32).default(localRefreshTokenPepper),
    AUTH_CREDENTIAL_TOKEN_PEPPER: z.string().min(32).default(localCredentialTokenPepper),
    AUTH_MFA_TOKEN_PEPPER: z.string().min(32).default(localMfaTokenPepper),
    AUTH_MFA_ENCRYPTION_KEY_BASE64: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'MFA encryption key must decode to exactly 32 bytes',
      })
      .default(localMfaEncryptionKey),
    AUTH_MFA_CHALLENGE_TTL_MINUTES: z.coerce.number().int().min(1).max(15).default(5),
    AUTH_MFA_CHALLENGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    AUTH_INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    AUTH_INVITATION_MAX_PER_INVITER_DAY: z.coerce.number().int().min(1).max(500).default(50),
    AUTH_FARMER_RESET_MAX_PER_STAFF_DAY: z.coerce.number().int().min(1).max(100).default(20),
    AUTH_PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    AUTH_EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(24),
    AUTH_REQUIRE_VERIFIED_EMAIL: environmentBoolean,
    AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default('clycites_refresh'),
    AUTH_REFRESH_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_REFRESH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    QR_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
    LOCATION_FLAG_DISTANCE_METERS: z.coerce.number().int().min(100).max(100_000).default(500),
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
      environment.AUTH_ACCESS_TOKEN_KEYS.some(({ secret }) => secret === localAccessTokenSecret)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_ACCESS_TOKEN_KEYS'],
        message: 'Production access-token keys must be configured',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_DEVICE_TOKEN_PEPPER === localDeviceTokenPepper
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_DEVICE_TOKEN_PEPPER'],
        message: 'A production device-token pepper must be configured',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_MFA_TOKEN_PEPPER === localMfaTokenPepper
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MFA_TOKEN_PEPPER'],
        message: 'A production MFA token pepper must be configured',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_MFA_ENCRYPTION_KEY_BASE64 === localMfaEncryptionKey
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MFA_ENCRYPTION_KEY_BASE64'],
        message: 'A production MFA encryption key must be configured',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_IDENTIFIER_HASH_PEPPER === localIdentifierHashPepper
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_IDENTIFIER_HASH_PEPPER'],
        message: 'A production identifier-hash pepper must be configured',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_REFRESH_TOKEN_PEPPER === localRefreshTokenPepper
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_TOKEN_PEPPER'],
        message: 'A production refresh-token pepper must be configured',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.AUTH_CREDENTIAL_TOKEN_PEPPER === localCredentialTokenPepper
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_CREDENTIAL_TOKEN_PEPPER'],
        message: 'A production credential-token pepper must be configured',
      });
    }
    if (
      environment.AUTH_REFRESH_COOKIE_SAME_SITE === 'none' &&
      !environment.AUTH_REFRESH_COOKIE_SECURE
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_COOKIE_SECURE'],
        message: 'SameSite=None refresh cookies must be secure',
      });
    }
    if (environment.AUTH_LOGIN_LOCKOUT_MAX_SECONDS < environment.AUTH_LOGIN_LOCKOUT_BASE_SECONDS) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_LOGIN_LOCKOUT_MAX_SECONDS'],
        message: 'Maximum login lockout must not be shorter than the base lockout',
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
