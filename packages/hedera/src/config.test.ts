import { describe, expect, it } from 'vitest';

import { parseHederaEnvironment } from './config.js';

const referenceSecret = 'test-reference-secret-with-at-least-32-bytes';

describe('Hedera environment configuration', () => {
  it('supports local mock operation without Hedera credentials', () => {
    expect(parseHederaEnvironment({ HEDERA_REFERENCE_SECRET: referenceSecret })).toMatchObject({
      HEDERA_PROVIDER: 'mock',
      HEDERA_NETWORK: 'local',
      HEDERA_SUBMISSION_ENABLED: false,
    });
  });

  it('requires credentials and an exchange rate for explicitly enabled SDK submission', () => {
    expect(() =>
      parseHederaEnvironment({
        HEDERA_PROVIDER: 'sdk',
        HEDERA_NETWORK: 'testnet',
        HEDERA_SUBMISSION_ENABLED: 'true',
        HEDERA_REFERENCE_SECRET: referenceSecret,
      }),
    ).toThrow(/HEDERA_OPERATOR_ID/);
  });

  it('requires a separate mainnet acknowledgement policy', () => {
    expect(() =>
      parseHederaEnvironment({
        HEDERA_PROVIDER: 'sdk',
        HEDERA_NETWORK: 'mainnet',
        HEDERA_CONFIRMATION_ENABLED: 'true',
        HEDERA_MIRROR_NODE_URL: 'https://mainnet-public.mirrornode.hedera.com',
        HEDERA_REFERENCE_SECRET: referenceSecret,
      }),
    ).toThrow(/Mainnet/);
  });

  it('never includes a supplied private key in validation errors', () => {
    const privateKey = 'private-key-must-never-appear';
    try {
      parseHederaEnvironment({
        HEDERA_PROVIDER: 'sdk',
        HEDERA_NETWORK: 'local',
        HEDERA_OPERATOR_KEY: privateKey,
        HEDERA_REFERENCE_SECRET: referenceSecret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(privateKey);
    }
  });
});
