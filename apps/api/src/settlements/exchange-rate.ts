const RATE_DECIMALS = 8;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);

export function toRateUnits(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid exchange rate: ${value}`);
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > RATE_DECIMALS) {
    throw new Error(`Exchange rate exceeds ${RATE_DECIMALS} decimal places: ${value}`);
  }
  const padded = fraction.padEnd(RATE_DECIMALS, '0');
  const units = BigInt(whole ?? '0') * RATE_SCALE + BigInt(padded === '' ? '0' : padded);
  return sign === '-' ? -units : units;
}

/**
 * Converts a minor-unit amount at a fixed rate, rounding half away from zero.
 * Both sides are assumed to share a minor-unit exponent; see ADR 075.
 */
export function convertMinorUnits(amountMinor: bigint, rateUnits: bigint): bigint {
  if (rateUnits <= 0n) throw new Error('Exchange rate must be positive');
  const scaled = amountMinor * rateUnits;
  const negative = scaled < 0n;
  const magnitude = negative ? -scaled : scaled;
  const rounded = (magnitude + RATE_SCALE / 2n) / RATE_SCALE;
  return negative ? -rounded : rounded;
}
