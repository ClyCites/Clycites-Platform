import { describe, expect, it } from 'vitest';

import { allocateAttribution, mergeAttributionWeights } from './attribution.js';
import { toQuantityUnits } from './quantity.js';

const units = (value: string) => toQuantityUnits(value);

describe('transformation attribution', () => {
  it('Transformation invariant 2: allocated shares sum to exactly the output quantity', () => {
    // 100kg split between three farmers, then dried down to 10kg. The exact thirds
    // are not representable at four decimals, so rounding must be absorbed rather
    // than dropped.
    const merged = mergeAttributionWeights([
      {
        batchId: 'batch-a',
        requestedUnits: units('100.0000'),
        contributions: [
          { deliveryId: 'd-1', quantityUnits: units('33.3333') },
          { deliveryId: 'd-2', quantityUnits: units('33.3333') },
          { deliveryId: 'd-3', quantityUnits: units('33.3334') },
        ],
      },
    ]);

    const output = units('10.0000');
    const shares = allocateAttribution(merged, output);

    expect(shares).toHaveLength(3);
    expect(shares.reduce((sum, share) => sum + share.quantityUnits, 0n)).toBe(output);
  });

  it('demonstrates the drift that largest-remainder allocation prevents', () => {
    // Non-vacuity: plain truncation of the same case loses units, so the assertion
    // above is not satisfied trivially.
    const merged = mergeAttributionWeights([
      {
        batchId: 'batch-a',
        requestedUnits: units('100.0000'),
        contributions: [
          { deliveryId: 'd-1', quantityUnits: units('33.3333') },
          { deliveryId: 'd-2', quantityUnits: units('33.3333') },
          { deliveryId: 'd-3', quantityUnits: units('33.3334') },
        ],
      },
    ]);
    const output = units('10.0000');

    const truncated = merged.weights.reduce(
      (sum, weight) => sum + (output * weight.numerator) / merged.total,
      0n,
    );

    expect(truncated).toBeLessThan(output);
    expect(allocateAttribution(merged, output).reduce((s, a) => s + a.quantityUnits, 0n)).toBe(
      output,
    );
  });

  it('Transformation invariant 3: a delivery spanning several input batches is merged once', () => {
    const merged = mergeAttributionWeights([
      {
        batchId: 'batch-a',
        requestedUnits: units('50.0000'),
        contributions: [
          { deliveryId: 'shared', quantityUnits: units('25.0000') },
          { deliveryId: 'only-a', quantityUnits: units('25.0000') },
        ],
      },
      {
        batchId: 'batch-b',
        requestedUnits: units('50.0000'),
        contributions: [
          { deliveryId: 'shared', quantityUnits: units('25.0000') },
          { deliveryId: 'only-b', quantityUnits: units('25.0000') },
        ],
      },
    ]);

    const shares = allocateAttribution(merged, units('100.0000'));
    const byDelivery = new Map(shares.map((share) => [share.deliveryId, share.quantityUnits]));

    expect(shares).toHaveLength(3);
    expect(byDelivery.get('shared')).toBe(units('50.0000'));
    expect(byDelivery.get('only-a')).toBe(units('25.0000'));
    expect(byDelivery.get('only-b')).toBe(units('25.0000'));
  });

  it('scales attribution by the quantity actually drawn from each input batch', () => {
    // Only a quarter of batch-b is consumed, so its farmers carry a quarter of the
    // weight of batch-a's farmers despite identical contribution sizes.
    const merged = mergeAttributionWeights([
      {
        batchId: 'batch-a',
        requestedUnits: units('100.0000'),
        contributions: [{ deliveryId: 'a', quantityUnits: units('100.0000') }],
      },
      {
        batchId: 'batch-b',
        requestedUnits: units('25.0000'),
        contributions: [{ deliveryId: 'b', quantityUnits: units('100.0000') }],
      },
    ]);

    const shares = allocateAttribution(merged, units('125.0000'));
    const byDelivery = new Map(shares.map((share) => [share.deliveryId, share.quantityUnits]));

    expect(byDelivery.get('a')).toBe(units('100.0000'));
    expect(byDelivery.get('b')).toBe(units('25.0000'));
  });

  it('reports unattributed input rather than inventing attribution', () => {
    const merged = mergeAttributionWeights([
      {
        batchId: 'batch-a',
        requestedUnits: units('40.0000'),
        contributions: [{ deliveryId: 'a', quantityUnits: units('40.0000') }],
      },
      { batchId: 'legacy', requestedUnits: units('60.0000'), contributions: [] },
    ]);

    expect(merged.attributedUnits).toBe(units('40.0000'));
    expect(merged.unattributedUnits).toBe(units('60.0000'));

    // The whole output is still attributed to the farmers we can name; the platform
    // never fabricates a delivery for the unattributable remainder.
    const shares = allocateAttribution(merged, units('100.0000'));
    expect(shares).toEqual([{ deliveryId: 'a', quantityUnits: units('100.0000') }]);
  });

  it('yields nothing when no input carries attribution', () => {
    const merged = mergeAttributionWeights([
      { batchId: 'legacy', requestedUnits: units('60.0000'), contributions: [] },
    ]);

    expect(merged.weights).toEqual([]);
    expect(allocateAttribution(merged, units('60.0000'))).toEqual([]);
  });

  it('allocates each output independently and conserves the total across a split', () => {
    const merged = mergeAttributionWeights([
      {
        batchId: 'batch-a',
        requestedUnits: units('90.0000'),
        contributions: [
          { deliveryId: 'd-1', quantityUnits: units('30.0000') },
          { deliveryId: 'd-2', quantityUnits: units('60.0000') },
        ],
      },
    ]);

    const outputs = [units('30.0000'), units('30.0000'), units('30.0000')];
    const perOutput = outputs.map((output) => allocateAttribution(merged, output));

    for (const [index, shares] of perOutput.entries())
      expect(shares.reduce((sum, share) => sum + share.quantityUnits, 0n)).toBe(outputs[index]);

    const totalPerDelivery = new Map<string, bigint>();
    for (const shares of perOutput)
      for (const share of shares)
        totalPerDelivery.set(
          share.deliveryId,
          (totalPerDelivery.get(share.deliveryId) ?? 0n) + share.quantityUnits,
        );

    expect(totalPerDelivery.get('d-1')).toBe(units('30.0000'));
    expect(totalPerDelivery.get('d-2')).toBe(units('60.0000'));
  });

  it('is deterministic when remainders tie', () => {
    const merged = mergeAttributionWeights([
      {
        batchId: 'batch-a',
        requestedUnits: units('3.0000'),
        contributions: [
          { deliveryId: 'b-delivery', quantityUnits: units('1.0000') },
          { deliveryId: 'a-delivery', quantityUnits: units('1.0000') },
          { deliveryId: 'c-delivery', quantityUnits: units('1.0000') },
        ],
      },
    ]);

    const first = allocateAttribution(merged, 1n);
    const second = allocateAttribution(merged, 1n);

    expect(first).toEqual(second);
    expect(first).toEqual([{ deliveryId: 'a-delivery', quantityUnits: 1n }]);
  });
});
