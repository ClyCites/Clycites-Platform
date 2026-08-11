import { z } from 'zod';

const booleanEnvironmentValue = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const hederaEnvironmentSchema = z
  .object({
    HEDERA_PROVIDER: z.enum(['mock', 'sdk']).default('mock'),
    HEDERA_NETWORK: z.enum(['local', 'testnet', 'previewnet', 'mainnet']).default('local'),
    HEDERA_OPERATOR_ID: z.string().trim().optional(),
    HEDERA_OPERATOR_KEY: z.string().trim().optional(),
    HEDERA_TOPIC_ID: z.string().trim().optional(),
    HEDERA_MIRROR_NODE_URL: z.url().optional(),
    HEDERA_SUBMISSION_ENABLED: booleanEnvironmentValue,
    HEDERA_CONFIRMATION_ENABLED: booleanEnvironmentValue,
    HEDERA_MAX_TRANSACTION_FEE_USD: z.coerce.number().positive().default(1),
    HEDERA_USD_PER_HBAR: z.coerce.number().positive().optional(),
    HEDERA_CONFIRMATION_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(120),
    HEDERA_CONFIRMATION_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(5),
    HEDERA_REFERENCE_SECRET: z.string().min(32),
    HEDERA_REFERENCE_SECRET_VERSION: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .default('v1'),
    HEDERA_MAINNET_ACKNOWLEDGEMENT: z.string().optional(),
  })
  .superRefine((config, context) => {
    if (config.HEDERA_PROVIDER === 'mock' && config.HEDERA_NETWORK !== 'local') {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_NETWORK'],
        message: 'The mock provider must use the local network',
      });
    }
    if (config.HEDERA_PROVIDER === 'sdk' && config.HEDERA_NETWORK === 'local') {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_NETWORK'],
        message: 'The SDK provider requires testnet, previewnet, or mainnet',
      });
    }
    if (config.HEDERA_SUBMISSION_ENABLED && config.HEDERA_PROVIDER === 'sdk') {
      for (const field of [
        'HEDERA_OPERATOR_ID',
        'HEDERA_OPERATOR_KEY',
        'HEDERA_TOPIC_ID',
        'HEDERA_USD_PER_HBAR',
      ] as const) {
        if (!config[field]) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required when Hedera SDK submission is enabled`,
          });
        }
      }
    }
    if (config.HEDERA_SUBMISSION_ENABLED && !config.HEDERA_CONFIRMATION_ENABLED) {
      // Submission without reconciliation cannot recover an anchor whose outcome is unknown.
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_CONFIRMATION_ENABLED'],
        message: 'HEDERA_CONFIRMATION_ENABLED is required when submission is enabled',
      });
    }
    if (config.HEDERA_CONFIRMATION_ENABLED && !config.HEDERA_MIRROR_NODE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_MIRROR_NODE_URL'],
        message: 'HEDERA_MIRROR_NODE_URL is required when confirmation is enabled',
      });
    }
    if (
      config.HEDERA_NETWORK === 'mainnet' &&
      (config.HEDERA_SUBMISSION_ENABLED || config.HEDERA_CONFIRMATION_ENABLED) &&
      config.HEDERA_MAINNET_ACKNOWLEDGEMENT !== 'I_UNDERSTAND_MAINNET_CHARGES'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['HEDERA_MAINNET_ACKNOWLEDGEMENT'],
        message: 'Mainnet requires the explicit production acknowledgement policy',
      });
    }
  });

export type HederaEnvironment = z.infer<typeof hederaEnvironmentSchema>;

export const parseHederaEnvironment = (environment: Record<string, unknown>): HederaEnvironment => {
  const result = hederaEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const safeIssues = result.error.issues.map(({ code, message, path }) => ({
      code,
      message,
      path,
    }));
    throw new Error(`Invalid Hedera configuration: ${JSON.stringify(safeIssues)}`);
  }
  return result.data;
};

export const DEFAULT_MIRROR_NODE_URLS = {
  testnet: 'https://testnet.mirrornode.hedera.com',
  previewnet: 'https://previewnet.mirrornode.hedera.com',
  mainnet: 'https://mainnet-public.mirrornode.hedera.com',
} as const;
