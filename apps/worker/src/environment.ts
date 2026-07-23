import { z } from 'zod';

export const workerEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    REDIS_HOST: z.string().min(1).default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().max(65_535).default(6379),
    REDIS_PASSWORD: z.string().optional(),
    S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3).default('clycites-local'),
    S3_ACCESS_KEY: z.string().min(1).default('clycites'),
    S3_SECRET_KEY: z.string().min(8).default('clycites_local_only'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().min(1),
    HEDERA_PROVIDER: z.enum(['mock', 'sdk']).default('mock'),
    HEDERA_NETWORK: z.enum(['local', 'testnet', 'previewnet', 'mainnet']).default('local'),
    HEDERA_OPERATOR_ID: z.string().trim().optional(),
    HEDERA_OPERATOR_KEY: z.string().trim().optional(),
    HEDERA_TOPIC_ID: z.string().trim().default('0.0.424242'),
    HEDERA_MIRROR_NODE_URL: z.string().url().optional(),
    HEDERA_SUBMISSION_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    HEDERA_CONFIRMATION_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    HEDERA_MAX_TRANSACTION_FEE_USD: z.coerce.number().positive().default(1),
    HEDERA_USD_PER_HBAR: z.coerce.number().positive().optional(),
    HEDERA_CONFIRMATION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
    HEDERA_CONFIRMATION_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(5),
    HEDERA_REFERENCE_SECRET: z
      .string()
      .min(32)
      .default('local-only-hedera-reference-secret-change-me'),
    HEDERA_REFERENCE_SECRET_VERSION: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .default('v1'),
    HEDERA_MAINNET_ACKNOWLEDGEMENT: z.string().optional(),
  })
  .superRefine((environment, context) => {
    if (environment.HEDERA_PROVIDER === 'mock' && environment.HEDERA_NETWORK !== 'local')
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_NETWORK'],
        message: 'Mock provider requires local network',
      });
    if (environment.HEDERA_PROVIDER === 'sdk' && environment.HEDERA_NETWORK === 'local')
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_NETWORK'],
        message: 'SDK provider requires a Hedera network',
      });
    if (environment.HEDERA_SUBMISSION_ENABLED && environment.HEDERA_PROVIDER === 'sdk') {
      for (const field of [
        'HEDERA_OPERATOR_ID',
        'HEDERA_OPERATOR_KEY',
        'HEDERA_USD_PER_HBAR',
      ] as const) {
        if (!environment[field])
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when submission is enabled`,
          });
      }
    }
    if (
      environment.HEDERA_CONFIRMATION_ENABLED &&
      environment.HEDERA_PROVIDER === 'sdk' &&
      !environment.HEDERA_MIRROR_NODE_URL
    )
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_MIRROR_NODE_URL'],
        message: 'Mirror Node URL is required when confirmation is enabled',
      });
    if (
      environment.HEDERA_NETWORK === 'mainnet' &&
      (environment.HEDERA_SUBMISSION_ENABLED || environment.HEDERA_CONFIRMATION_ENABLED) &&
      environment.HEDERA_MAINNET_ACKNOWLEDGEMENT !== 'I_UNDERSTAND_MAINNET_CHARGES'
    )
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_MAINNET_ACKNOWLEDGEMENT'],
        message: 'Mainnet requires explicit acknowledgement',
      });
  });

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const validateEnvironment = (environment: Record<string, unknown>): WorkerEnvironment => {
  const normalized = Object.fromEntries(
    Object.entries(environment).filter(([, value]) => value !== ''),
  );
  const result = workerEnvironmentSchema.safeParse(normalized);
  if (!result.success)
    throw new Error(`Invalid worker environment: ${z.prettifyError(result.error)}`);
  return result.data;
};
