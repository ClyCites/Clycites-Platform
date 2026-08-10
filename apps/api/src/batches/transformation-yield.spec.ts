import { describe, expect, it } from 'vitest';

import {
  assessYield,
  computeYieldRatio,
  formatRatio,
  lossRequiresReason,
  lossToleranceUnits,
  toRatioUnits,
} from './transformation-yield.js';

const cherryToParchment = {
  id: 'conversion-1',
  minRatioUnits: toRatioUnits('0.150000'),
  maxRatioUnits: toRatioUnits('0.250000'),
};

// Quantities are the 4-decimal fixed-point units used everywhere else.
const kg = (value: string) => {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
};

describe('toRatioUnits / formatRatio', () => {
  it('round-trips a six decimal ratio', () => {
    expect(formatRatio(toRatioUnits('0.187500'))).toBe('0.187500');
  });

  it('pads a short fraction rather than mis-scaling it', () => {
    expect(toRatioUnits('0.2')).toBe(200000n);
  });

  it('truncates beyond six decimals instead of over-scaling', () => {
    expect(toRatioUnits('0.1234567')).toBe(123456n);
  });
});

describe('computeYieldRatio', () => {
  it('computes output over input', () => {
    expect(formatRatio(computeYieldRatio(kg('50'), kg('10')))).toBe('0.200000');
  });

  it('rounds half up', () => {
    // 1 / 3 = 0.3333335 at the seventh decimal, so it must land on 0.333333.
    expect(formatRatio(computeYieldRatio(kg('3'), kg('1')))).toBe('0.333333');
  });
});

describe('assessYield', () => {
  it('accepts a ratio inside the published range', () => {
    expect(
      assessYield({
        inputUnits: kg('50'),
        outputUnits: kg('10'),
        formChanged: true,
        conversion: cherryToParchment,
      }),
    ).toEqual({
      yieldRatio: '0.200000',
      conversionId: 'conversion-1',
      yieldFlagged: false,
      yieldFlagReason: null,
    });
  });

  it('flags a ratio above the range', () => {
    const result = assessYield({
      inputUnits: kg('50'),
      outputUnits: kg('20'),
      formChanged: true,
      conversion: cherryToParchment,
    });
    expect(result.yieldRatio).toBe('0.400000');
    expect(result).toMatchObject({ yieldFlagged: true, yieldFlagReason: 'YIELD_OUT_OF_RANGE' });
  });

  it('flags a ratio below the range', () => {
    const result = assessYield({
      inputUnits: kg('50'),
      outputUnits: kg('5'),
      formChanged: true,
      conversion: cherryToParchment,
    });
    expect(result.yieldRatio).toBe('0.100000');
    expect(result).toMatchObject({ yieldFlagged: true, yieldFlagReason: 'YIELD_OUT_OF_RANGE' });
  });

  it('treats the range as inclusive at both ends', () => {
    for (const output of ['7.5', '12.5']) {
      expect(
        assessYield({
          inputUnits: kg('50'),
          outputUnits: kg(output),
          formChanged: true,
          conversion: cherryToParchment,
        }).yieldFlagged,
      ).toBe(false);
    }
  });

  it('flags a form change with no published range as unverifiable', () => {
    expect(
      assessYield({
        inputUnits: kg('50'),
        outputUnits: kg('10'),
        formChanged: true,
        conversion: null,
      }),
    ).toEqual({
      yieldRatio: '0.200000',
      conversionId: null,
      yieldFlagged: true,
      yieldFlagReason: 'YIELD_UNVERIFIABLE',
    });
  });

  it('does not flag a split or merge, which changes no form', () => {
    expect(
      assessYield({
        inputUnits: kg('52'),
        outputUnits: kg('51'),
        formChanged: false,
        conversion: null,
      }),
    ).toEqual({
      yieldRatio: '0.980769',
      conversionId: null,
      yieldFlagged: false,
      yieldFlagReason: null,
    });
  });

  it('flags a zero input rather than dividing by it', () => {
    expect(
      assessYield({ inputUnits: 0n, outputUnits: 0n, formChanged: true, conversion: null }),
    ).toMatchObject({ yieldFlagged: true, yieldFlagReason: 'YIELD_UNVERIFIABLE' });
  });
});

describe('loss tolerance', () => {
  it('scales with the input and never drops below one unit', () => {
    expect(lossToleranceUnits(kg('100'))).toBe(1000n);
    expect(lossToleranceUnits(5n)).toBe(1n);
  });

  it('does not demand a reason for rounding-scale loss', () => {
    expect(lossRequiresReason(kg('100'), kg('99.9'))).toBe(false);
  });

  it('demands a reason once loss exceeds the tolerance', () => {
    expect(lossRequiresReason(kg('100'), kg('99.8999'))).toBe(true);
  });

  it('demands a reason for the large loss of a real form change', () => {
    expect(lossRequiresReason(kg('50'), kg('10'))).toBe(true);
  });
});
