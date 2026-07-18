import { describe, expect, it } from 'vitest';

import { calculatePricing, calculateWeight } from './delivery-calculation.js';

describe('delivery calculations', () => {
  it('subtracts gross and tare using fixed precision', () => {
    expect(
      calculateWeight({
        mode: 'GROSS_TARE',
        grossQuantity: '75.1255',
        tareQuantity: '0.1254',
        unit: 'KG',
        captureMethod: 'MANUAL',
        clientNetQuantity: '75.0001',
      }),
    ).toMatchObject({ grossQuantity: '75.1255', tareQuantity: '0.1254', netQuantity: '75.0001' });
  });

  it('rounds minor-unit totals half up without floating point arithmetic', () => {
    expect(
      calculatePricing('1.2345', {
        unitPriceMinor: '1001',
        currency: 'UGX',
        adjustmentAmountMinor: '-5',
        priceSource: 'COLLECTION_POINT',
      }),
    ).toMatchObject({ grossAmountMinor: 1236n, netAmountMinor: 1231n });
  });

  it('rejects a client total that differs from the authoritative calculation', () => {
    expect(() =>
      calculatePricing('2.0000', {
        unitPriceMinor: '3000',
        currency: 'UGX',
        adjustmentAmountMinor: '0',
        priceSource: 'COLLECTION_POINT',
        clientGrossAmountMinor: '6001',
      }),
    ).toThrow('Client monetary totals do not match the server calculation');
  });
});
