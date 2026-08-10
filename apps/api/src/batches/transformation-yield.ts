const RATIO_DECIMALS = 6;
const RATIO_SCALE = 10n ** BigInt(RATIO_DECIMALS);

export type YieldFlagReason = 'YIELD_OUT_OF_RANGE' | 'YIELD_UNVERIFIABLE';

export type ConversionRange = {
  id: string;
  minRatioUnits: bigint;
  maxRatioUnits: bigint;
};

export type YieldAssessment = {
  yieldRatio: string;
  conversionId: string | null;
  yieldFlagged: boolean;
  yieldFlagReason: YieldFlagReason | null;
};

export const toRatioUnits = (value: string): bigint => {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * RATIO_SCALE + BigInt(fraction.slice(0, RATIO_DECIMALS).padEnd(RATIO_DECIMALS, '0'));
};

export const formatRatio = (units: bigint): string => {
  const whole = units / RATIO_SCALE;
  const fraction = (units % RATIO_SCALE).toString().padStart(RATIO_DECIMALS, '0');
  return `${whole}.${fraction}`;
};

// Output over input, rounded half-up at six decimals. Rounding is presentation only:
// nothing downstream computes a quantity from this number.
export const computeYieldRatio = (inputUnits: bigint, outputUnits: bigint): bigint =>
  (outputUnits * RATIO_SCALE + inputUnits / 2n) / inputUnits;

export const assessYield = (args: {
  inputUnits: bigint;
  outputUnits: bigint;
  formChanged: boolean;
  conversion: ConversionRange | null;
}): YieldAssessment => {
  if (args.inputUnits <= 0n)
    return {
      yieldRatio: formatRatio(0n),
      conversionId: null,
      yieldFlagged: true,
      yieldFlagReason: 'YIELD_UNVERIFIABLE',
    };

  const ratio = computeYieldRatio(args.inputUnits, args.outputUnits);
  const yieldRatio = formatRatio(ratio);

  // A split or merge keeps the form, so the only meaningful expectation is mass
  // conservation, which is enforced separately. Flagging it would be pure noise.
  if (!args.formChanged)
    return { yieldRatio, conversionId: null, yieldFlagged: false, yieldFlagReason: null };

  if (!args.conversion)
    return {
      yieldRatio,
      conversionId: null,
      yieldFlagged: true,
      yieldFlagReason: 'YIELD_UNVERIFIABLE',
    };

  const outOfRange =
    ratio < args.conversion.minRatioUnits || ratio > args.conversion.maxRatioUnits;
  return {
    yieldRatio,
    conversionId: args.conversion.id,
    yieldFlagged: outOfRange,
    yieldFlagReason: outOfRange ? 'YIELD_OUT_OF_RANGE' : null,
  };
};

// A transformation that loses no more than a tenth of a percent is rounding, not an
// event worth explaining. Anything above it must name where the mass went.
export const lossToleranceUnits = (inputUnits: bigint): bigint => {
  const proportional = inputUnits / 1000n;
  return proportional > 0n ? proportional : 1n;
};

export const lossRequiresReason = (inputUnits: bigint, outputUnits: bigint): boolean =>
  inputUnits - outputUnits > lossToleranceUnits(inputUnits);
