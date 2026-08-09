import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      HEDERA_CONFIRMATION_ENABLED: 'false',
      HEDERA_NETWORK: 'local',
      HEDERA_PROVIDER: 'mock',
      HEDERA_SUBMISSION_ENABLED: 'false',
    },
    fileParallelism: false,
    globalSetup: ['./test/assert-database-history.ts'],
  },
});
