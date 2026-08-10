import { confirmDeliverySchema, createDeliverySchema } from '@clycites/contracts';
import { describe, expect, it } from 'vitest';

const smsConfirmation = {
  method: 'SMS_OTP',
  status: 'CONFIRMED',
  confirmedAt: '2026-08-10T08:00:00.000Z',
};

describe('delivery confirmation boundaries', () => {
  it('Capture invariant 5: refuses SMS OTP confirmation commands', () => {
    expect(
      confirmDeliverySchema.safeParse({ lockVersion: 1, confirmation: smsConfirmation }).success,
    ).toBe(false);
  });

  it('Capture invariant 5: refuses SMS OTP during initial capture', () => {
    expect(
      createDeliverySchema.safeParse({
        clientEntityId: '11111111-1111-4111-8111-111111111111',
        deviceId: '22222222-2222-4222-8222-222222222222',
        collectionSessionId: '33333333-3333-4333-8333-333333333333',
        collectionPointId: '44444444-4444-4444-8444-444444444444',
        farmerId: '55555555-5555-4555-8555-555555555555',
        commodityId: '66666666-6666-4666-8666-666666666666',
        commodityFormId: '77777777-7777-4777-8777-777777777777',
        clientCreatedAt: '2026-08-10T08:00:00.000Z',
        weight: {
          mode: 'DIRECT_NET',
          netQuantity: '1.0000',
          unit: 'KG',
          captureMethod: 'MANUAL',
        },
        pricing: {
          unitPriceMinor: '1',
          currency: 'UGX',
          adjustmentAmountMinor: '0',
          priceSource: 'COLLECTION_POINT',
        },
        qualityMeasurements: [],
        confirmation: smsConfirmation,
      }).success,
    ).toBe(false);
  });
});
