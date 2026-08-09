import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.js';

const productionEnvironment = () => ({
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://pilot.clycites.example',
  DATABASE_URL: 'postgresql://service:secret@postgres.example:5432/clycites?sslmode=require',
  S3_ENDPOINT: 'https://objects.clycites.example',
  AUTH_ACCESS_TOKEN_SECRET: 'production-access-token-secret-with-32-characters',
  AUTH_IDENTIFIER_HASH_PEPPER: 'production-identifier-hash-pepper-with-32-characters',
  AUTH_REFRESH_TOKEN_PEPPER: 'production-refresh-token-pepper-with-32-characters',
  AUTH_REFRESH_COOKIE_SECURE: 'true',
  API_DOCS_ENABLED: 'false',
  PAYMENT_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  HEDERA_PROVIDER: 'mock',
  HEDERA_NETWORK: 'local',
  HEDERA_REFERENCE_SECRET: 'production-hedera-reference-secret-with-32-characters',
});

describe('API environment security policy', () => {
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
