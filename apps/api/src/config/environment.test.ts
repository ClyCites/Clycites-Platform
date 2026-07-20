import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.js';

const productionEnvironment = () => ({
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://pilot.clycites.example',
  DATABASE_URL: 'postgresql://service:secret@postgres.example:5432/clycites?sslmode=require',
  AUTH_ACCESS_TOKEN_SECRET: 'production-access-token-secret-with-32-characters',
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
  });
});
