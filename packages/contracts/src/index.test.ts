import { describe, expect, it } from 'vitest';

import { apiErrorSchema, apiSuccessSchema, healthDataSchema, uuidSchema } from './index.js';

const meta = { requestId: 'request-1', timestamp: '2026-01-01T00:00:00.000Z' };

describe('API contracts', () => {
  it('validates a success response', () => {
    expect(
      apiSuccessSchema(healthDataSchema).safeParse({ data: { status: 'ok' }, meta }).success,
    ).toBe(true);
  });

  it('validates an error response', () => {
    expect(
      apiErrorSchema.safeParse({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid input', details: null },
        meta,
      }).success,
    ).toBe(true);
  });

  it('accepts UUIDs and rejects arbitrary identifiers', () => {
    expect(uuidSchema.safeParse('019bf9d0-7c00-7000-8000-000000000001').success).toBe(true);
    expect(uuidSchema.safeParse('farmer-123').success).toBe(false);
  });
});
