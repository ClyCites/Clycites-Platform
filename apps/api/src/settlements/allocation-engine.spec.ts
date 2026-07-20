import { describe, expect, it } from 'vitest';

import { allocateSaleProceeds } from './allocation-engine.js';

describe('Phase 6 allocation engine', () => {
  it('traces a partial accepted sale through merged inputs and transformation loss', () => {
    const result = allocateSaleProceeds({
      acceptedQuantityUnits: 6_0000n,
      proceedsMinor: 10_001n,
      batches: [
        {
          batchId: 'batch-a',
          quantityUnits: 8_0000n,
          deliveryContributions: [
            { deliveryId: 'delivery-a1', farmerId: 'farmer-a', quantityUnits: 6_0000n },
            { deliveryId: 'delivery-b1', farmerId: 'farmer-b', quantityUnits: 2_0000n },
          ],
        },
        {
          batchId: 'batch-b',
          quantityUnits: 4_0000n,
          deliveryContributions: [
            { deliveryId: 'delivery-a2', farmerId: 'farmer-a', quantityUnits: 1_0000n },
            { deliveryId: 'delivery-c1', farmerId: 'farmer-c', quantityUnits: 3_0000n },
          ],
        },
        {
          batchId: 'transformed-output',
          quantityUnits: 9_0000n,
          transformationInputs: [
            { batchId: 'batch-a', quantityUnits: 8_0000n },
            { batchId: 'batch-b', quantityUnits: 4_0000n },
          ],
        },
      ],
      lotContributions: [{ batchId: 'transformed-output', quantityUnits: 9_0000n }],
    });

    expect(result.attributableQuantityUnits).toBe(6_0000n);
    expect(result.allocatedGrossMinor).toBe(10_001n);
    expect(
      result.farmers.map((farmer) => [farmer.farmerId, farmer.attributableQuantityUnits]),
    ).toEqual([
      ['farmer-a', 3_5000n],
      ['farmer-b', 1_0000n],
      ['farmer-c', 1_5000n],
    ]);
    expect(result.farmers.map((farmer) => [farmer.farmerId, farmer.allocatedGrossMinor])).toEqual([
      ['farmer-a', 5_834n],
      ['farmer-b', 1_667n],
      ['farmer-c', 2_500n],
    ]);
  });

  it('uses stable farmer references to break equal largest-remainder ties', () => {
    const allocate = () =>
      allocateSaleProceeds({
        acceptedQuantityUnits: 3n,
        proceedsMinor: 2n,
        batches: [
          {
            batchId: 'batch',
            quantityUnits: 3n,
            deliveryContributions: [
              { deliveryId: 'delivery-c', farmerId: 'farmer-c', quantityUnits: 1n },
              { deliveryId: 'delivery-a', farmerId: 'farmer-a', quantityUnits: 1n },
              { deliveryId: 'delivery-b', farmerId: 'farmer-b', quantityUnits: 1n },
            ],
          },
        ],
        lotContributions: [{ batchId: 'batch', quantityUnits: 3n }],
      });

    expect(allocate()).toEqual(allocate());
    expect(
      allocate().farmers.map((farmer) => [farmer.farmerId, farmer.allocatedGrossMinor]),
    ).toEqual([
      ['farmer-a', 1n],
      ['farmer-b', 1n],
      ['farmer-c', 0n],
    ]);
  });

  it('rejects cycles and incomplete lineage', () => {
    expect(() =>
      allocateSaleProceeds({
        acceptedQuantityUnits: 1n,
        proceedsMinor: 1n,
        batches: [
          {
            batchId: 'cycle-a',
            quantityUnits: 1n,
            transformationInputs: [{ batchId: 'cycle-b', quantityUnits: 1n }],
          },
          {
            batchId: 'cycle-b',
            quantityUnits: 1n,
            transformationInputs: [{ batchId: 'cycle-a', quantityUnits: 1n }],
          },
        ],
        lotContributions: [{ batchId: 'cycle-a', quantityUnits: 1n }],
      }),
    ).toThrow('Lineage cycle detected');
  });
});
