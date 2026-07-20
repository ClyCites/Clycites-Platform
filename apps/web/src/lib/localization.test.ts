import { describe, expect, it } from 'vitest';

import { formatKampalaDateTime, formatUgandaCurrency, message } from './localization';

describe('Uganda localization', () => {
  it('formats fixed-point UGX values without floating-point input', () => {
    expect(formatUgandaCurrency('35640000')).toContain('356,400');
  });

  it('provides a Luganda draft for critical low-connectivity messages', () => {
    expect(message('lg-UG', 'offline')).toBe('Tewali mutimbagano');
    expect(message('lg-UG', 'humanReviewRequired')).not.toBe(
      message('en-UG', 'humanReviewRequired'),
    );
  });

  it('formats timestamps in the Kampala time zone', () => {
    expect(formatKampalaDateTime('2026-07-20T06:00:00.000Z')).toContain('09:00');
  });
});
