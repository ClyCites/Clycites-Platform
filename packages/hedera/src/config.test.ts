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

  it('accepts mainnet once the acknowledgement is present', () => {
    // The rejection above only proves the guard fires. This proves it is a guard and not a wall,
    // so that the rejection cannot be passed by a schema that rejects mainnet unconditionally.
    expect(
      parseHederaEnvironment({
        HEDERA_PROVIDER: 'sdk',
        HEDERA_NETWORK: 'mainnet',
        HEDERA_CONFIRMATION_ENABLED: 'true',
        HEDERA_MIRROR_NODE_URL: 'https://mainnet-public.mirrornode.hedera.com',
        HEDERA_MAINNET_ACKNOWLEDGEMENT: 'I_UNDERSTAND_MAINNET_CHARGES',
        HEDERA_REFERENCE_SECRET: referenceSecret,
      }),
    ).toMatchObject({ HEDERA_NETWORK: 'mainnet' });
  });

  it('refuses submission without confirmation, which would strand an interrupted submit', () => {
    expect(() =>
      parseHederaEnvironment({
        HEDERA_PROVIDER: 'sdk',
        HEDERA_NETWORK: 'testnet',
        HEDERA_SUBMISSION_ENABLED: 'true',
        HEDERA_OPERATOR_ID: '0.0.1234',
        HEDERA_OPERATOR_KEY: '302e020100300506032b657004220420'.padEnd(64, '0'),
        HEDERA_TOPIC_ID: '0.0.5678',
        HEDERA_USD_PER_HBAR: '0.10',
        HEDERA_REFERENCE_SECRET: referenceSecret,
      }),
    ).toThrow(/HEDERA_CONFIRMATION_ENABLED/);
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
