import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.js';

const productionEnvironment = () => ({
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://pilot.clycites.example',
  DATABASE_URL: 'postgresql://service:secret@postgres.example:5432/clycites?sslmode=require',
  S3_ENDPOINT: 'https://objects.clycites.example',
  AUTH_ACCESS_TOKEN_KEYS: JSON.stringify([
    { kid: 'production-v1', secret: 'production-access-token-secret-with-32-characters' },
  ]),
  AUTH_DEVICE_TOKEN_PEPPER: 'production-device-token-pepper-with-32-characters',
  AUTH_IDENTIFIER_HASH_PEPPER: 'production-identifier-hash-pepper-with-32-characters',
  AUTH_REFRESH_TOKEN_PEPPER: 'production-refresh-token-pepper-with-32-characters',
  AUTH_CREDENTIAL_TOKEN_PEPPER: 'production-credential-token-pepper-with-32-characters',
  AUTH_MFA_TOKEN_PEPPER: 'production-mfa-token-pepper-with-at-least-32-characters',
  AUTH_MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 8).toString('base64'),
  AUTH_REFRESH_COOKIE_SECURE: 'true',
  API_DOCS_ENABLED: 'false',
  PAYMENT_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  HEDERA_PROVIDER: 'mock',
  HEDERA_NETWORK: 'local',
  HEDERA_REFERENCE_SECRET: 'production-hedera-reference-secret-with-32-characters',
});

describe('API Hedera key custody', () => {
  it('refuses to boot when a Hedera operator key is present in the API environment', () => {
    // The API never signs a Hedera transaction. If the key is reachable from the API process, an
    // API compromise becomes a ledger-identity compromise, so this is a startup failure rather
    // than an ignored variable.
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/clycites',
        HEDERA_OPERATOR_KEY: '302e020100300506032b657004220420aaaa',
      }),
    ).toThrow(/HEDERA_OPERATOR_KEY/);
  });

  it('does not echo the operator key in the failure it raises', () => {
    const operatorKey = 'operator-key-that-must-never-be-logged';
    try {
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/clycites',
        HEDERA_OPERATOR_KEY: operatorKey,
      });
      expect.unreachable('the API must refuse a Hedera operator key');
    } catch (error) {
      expect(String(error)).not.toContain(operatorKey);
    }
  });

  it('still boots when the operator key is absent', () => {
    expect(
      validateEnvironment({ DATABASE_URL: 'postgresql://localhost/clycites' }).HEDERA_PROVIDER,
    ).toBe('mock');
  });

  it('refuses submission without confirmation, which would strand an interrupted submit', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/clycites',
        HEDERA_PROVIDER: 'sdk',
        HEDERA_NETWORK: 'testnet',
        HEDERA_OPERATOR_ID: '0.0.1234',
        HEDERA_TOPIC_ID: '0.0.5678',
        HEDERA_USD_PER_HBAR: '0.10',
        HEDERA_SUBMISSION_ENABLED: 'true',
        HEDERA_CONFIRMATION_ENABLED: 'false',
      }),
    ).toThrow(/HEDERA_CONFIRMATION_ENABLED/);
  });

  it('requires the mainnet acknowledgement before mainnet confirmation can start', () => {
    const mainnet = {
      DATABASE_URL: 'postgresql://localhost/clycites',
      HEDERA_PROVIDER: 'sdk',
      HEDERA_NETWORK: 'mainnet',
      HEDERA_CONFIRMATION_ENABLED: 'true',
      HEDERA_MIRROR_NODE_URL: 'https://mainnet-public.mirrornode.hedera.com',
    };
    expect(() => validateEnvironment(mainnet)).toThrow(/acknowledgement/);
    expect(
      validateEnvironment({
        ...mainnet,
        HEDERA_MAINNET_ACKNOWLEDGEMENT: 'I_UNDERSTAND_MAINNET_CHARGES',
      }).HEDERA_NETWORK,
    ).toBe('mainnet');
  });
});

describe('API environment security policy', () => {
  it('keeps verified-email login enforcement disabled by default and accepts opt-in', () => {
    expect(
      validateEnvironment({ DATABASE_URL: 'postgresql://localhost/clycites' })
        .AUTH_REQUIRE_VERIFIED_EMAIL,
    ).toBe(false);
    expect(
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/clycites',
        AUTH_REQUIRE_VERIFIED_EMAIL: 'true',
      }).AUTH_REQUIRE_VERIFIED_EMAIL,
    ).toBe(true);
  });
  it('accepts an explicitly hardened production configuration', () => {
    const environment = validateEnvironment(productionEnvironment());

    expect(environment.WEB_ORIGIN).toBe('https://pilot.clycites.example');
    expect(environment.AUTH_REFRESH_COOKIE_SECURE).toBe(true);
    expect(environment.API_DOCS_ENABLED).toBe(false);
  });

  it.each([
    ['WEB_ORIGIN', 'http://pilot.clycites.example'],
    ['AUTH_REFRESH_COOKIE_SECURE', 'false'],
    ['API_DOCS_ENABLED', 'true'],
  ])('rejects an insecure production %s', (field, value) => {
    expect(() => validateEnvironment({ ...productionEnvironment(), [field]: value })).toThrow(
      'Invalid API environment',
    );
  });

  it('preserves local defaults for development', () => {
    const environment = validateEnvironment({ DATABASE_URL: 'postgresql://localhost/clycites' });

    expect(environment.API_DOCS_ENABLED).toBe(true);
    expect(environment.AUTH_REFRESH_COOKIE_SECURE).toBe(false);
    expect(environment.TRUST_PROXY_HOPS).toBe(0);
    expect(environment.AUTH_LOGIN_MAX_FAILURES).toBe(5);
    expect(environment.AUTH_LOGIN_LOCKOUT_BASE_SECONDS).toBe(60);
    expect(environment.AUTH_LOGIN_LOCKOUT_MAX_SECONDS).toBe(3600);
  });

  it('rejects the local identifier pepper in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        AUTH_IDENTIFIER_HASH_PEPPER: 'local-only-identifier-hash-pepper-change-me',
      }),
    ).toThrow('Invalid API environment');
  });

  it('rejects the local refresh-token pepper in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        AUTH_REFRESH_TOKEN_PEPPER: 'local-only-refresh-token-pepper-change-me',
      }),
    ).toThrow('Invalid API environment');
  });

  it('rejects the local credential-token pepper in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        AUTH_CREDENTIAL_TOKEN_PEPPER: 'local-only-credential-token-pepper-change-me',
      }),
    ).toThrow('Invalid API environment');
  });

  it('rejects SameSite=None when refresh cookies are not secure', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/clycites',
        AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
        AUTH_REFRESH_COOKIE_SECURE: 'false',
      }),
    ).toThrow('Invalid API environment');
  });

  it('accepts SameSite=None when refresh cookies are secure', () => {
    const environment = validateEnvironment({
      DATABASE_URL: 'postgresql://localhost/clycites',
      AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
      AUTH_REFRESH_COOKIE_SECURE: 'true',
    });

    expect(environment.AUTH_REFRESH_COOKIE_SAME_SITE).toBe('none');
  });
});
