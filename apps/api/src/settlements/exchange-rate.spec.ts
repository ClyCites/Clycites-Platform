import { describe, expect, it } from 'vitest';

import { convertMinorUnits, toRateUnits } from './exchange-rate.js';

describe('exchange rate conversion', () => {
  it('parses a rate at full precision', () => {
    expect(toRateUnits('3750.12345678')).toBe(375012345678n);
    expect(toRateUnits('1')).toBe(100000000n);
  });

  it('rejects a rate finer than the stored precision rather than silently truncating', () => {
    expect(() => toRateUnits('3750.123456789')).toThrow(/decimal places/);
  });

  it('converts minor units at a whole rate', () => {
    expect(convertMinorUnits(10_000n, toRateUnits('3750'))).toBe(37_500_000n);
  });

  it('rounds half away from zero rather than truncating', () => {
    // 1 minor unit at rate 0.5 is exactly half a unit.
    expect(convertMinorUnits(1n, toRateUnits('0.5'))).toBe(1n);
    expect(convertMinorUnits(3n, toRateUnits('0.5'))).toBe(2n);
  });

  it('is exact where floating point loses a minor unit', () => {
    // 50 x 1.15 is exactly 57.5, but in binary floating point it is 57.49999999999999,
    // so Math.round rounds it down and the farmer loses a minor unit.
    const exact = convertMinorUnits(50n, toRateUnits('1.15'));
    const viaFloat = BigInt(Math.round(50 * 1.15));
    expect(exact).toBe(58n);
    expect(viaFloat).toBe(57n);
  });

  it('refuses a non-positive rate', () => {
    expect(() => convertMinorUnits(1n, 0n)).toThrow(/positive/);
    expect(() => convertMinorUnits(1n, -1n)).toThrow(/positive/);
  });
});
