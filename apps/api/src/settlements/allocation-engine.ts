export interface DeliveryContributionInput {
  deliveryId: string;
  farmerId: string;
  quantityUnits: bigint;
}

export interface TransformationInput {
  batchId: string;
  quantityUnits: bigint;
}

export interface BatchLineageInput {
  batchId: string;
  quantityUnits: bigint;
  deliveryContributions?: readonly DeliveryContributionInput[];
  transformationInputs?: readonly TransformationInput[];
}

export interface LotContributionInput {
  batchId: string;
  quantityUnits: bigint;
}

export interface AllocationInput {
  acceptedQuantityUnits: bigint;
  proceedsMinor: bigint;
  batches: readonly BatchLineageInput[];
  lotContributions: readonly LotContributionInput[];
}

export interface DeliveryAllocationResult {
  deliveryId: string;
  farmerId: string;
  attributableQuantityUnits: bigint;
  ratioNumerator: bigint;
  ratioDenominator: bigint;
  allocatedGrossMinor: bigint;
  roundingAdjustmentMinor: bigint;
}

export interface FarmerAllocationResult {
  farmerId: string;
  attributableQuantityUnits: bigint;
  allocatedGrossMinor: bigint;
  roundingAdjustmentMinor: bigint;
  deliveries: DeliveryAllocationResult[];
}

export interface AllocationResult {
  attributableQuantityUnits: bigint;
  allocatedGrossMinor: bigint;
  farmers: FarmerAllocationResult[];
}

interface WeightedDelivery {
  deliveryId: string;
  farmerId: string;
  numerator: bigint;
  denominator: bigint;
}

interface RemainderShare<T> {
  item: T;
  floor: bigint;
  remainderNumerator: bigint;
  remainderDenominator: bigint;
  stableKey: string;
}

export function allocateSaleProceeds(input: AllocationInput): AllocationResult {
  if (input.acceptedQuantityUnits <= 0n) throw new Error('Accepted quantity must be positive');
  if (input.proceedsMinor < 0n) throw new Error('Proceeds cannot be negative');

  const batches = new Map(input.batches.map((batch) => [batch.batchId, batch]));
  const lotWeights = mergeWeights(
    input.lotContributions.flatMap((contribution) =>
      scaleWeights(
        resolveBatch(contribution.batchId, batches, new Set()),
        contribution.quantityUnits,
      ),
    ),
  );
  if (lotWeights.length === 0) throw new Error('Lot lineage has no eligible deliveries');

  const quantityShares = apportion(
    input.acceptedQuantityUnits,
    lotWeights.map((weight) => ({
      item: weight,
      numerator: weight.numerator,
      denominator: weight.denominator,
      stableKey: `${weight.farmerId}:${weight.deliveryId}`,
    })),
  ).filter((share) => share.amount > 0n);

  const farmerQuantities = new Map<string, bigint>();
  for (const share of quantityShares) {
    farmerQuantities.set(
      share.item.farmerId,
      (farmerQuantities.get(share.item.farmerId) ?? 0n) + share.amount,
    );
  }

  const farmerMoney = apportion(
    input.proceedsMinor,
    [...farmerQuantities].map(([farmerId, quantity]) => ({
      item: farmerId,
      numerator: quantity,
      denominator: input.acceptedQuantityUnits,
      stableKey: farmerId,
    })),
  );

  const farmers = farmerMoney
    .map((farmerShare) => {
      const farmerDeliveryQuantities = quantityShares.filter(
        (share) => share.item.farmerId === farmerShare.item,
      );
      const deliveryMoney = apportion(
        farmerShare.amount,
        farmerDeliveryQuantities.map((share) => ({
          item: share,
          numerator: share.amount,
          denominator: farmerQuantities.get(farmerShare.item) ?? 0n,
          stableKey: share.item.deliveryId,
        })),
      );
      const deliveries = deliveryMoney
        .map(({ item: quantityShare, amount, residualUnits }) => ({
          deliveryId: quantityShare.item.deliveryId,
          farmerId: quantityShare.item.farmerId,
          attributableQuantityUnits: quantityShare.amount,
          ratioNumerator: quantityShare.item.numerator,
          ratioDenominator: quantityShare.item.denominator,
          allocatedGrossMinor: amount,
          roundingAdjustmentMinor: residualUnits,
        }))
        .sort((left, right) => left.deliveryId.localeCompare(right.deliveryId));
      return {
        farmerId: farmerShare.item,
        attributableQuantityUnits: farmerQuantities.get(farmerShare.item) ?? 0n,
        allocatedGrossMinor: farmerShare.amount,
        roundingAdjustmentMinor: farmerShare.residualUnits,
        deliveries,
      };
    })
    .sort((left, right) => left.farmerId.localeCompare(right.farmerId));

  return {
    attributableQuantityUnits: farmers.reduce(
      (total, farmer) => total + farmer.attributableQuantityUnits,
      0n,
    ),
    allocatedGrossMinor: farmers.reduce((total, farmer) => total + farmer.allocatedGrossMinor, 0n),
    farmers,
  };
}

function resolveBatch(
  batchId: string,
  batches: ReadonlyMap<string, BatchLineageInput>,
  visiting: ReadonlySet<string>,
): WeightedDelivery[] {
  if (visiting.has(batchId)) throw new Error(`Lineage cycle detected at batch ${batchId}`);
  const batch = batches.get(batchId);
  if (!batch || batch.quantityUnits <= 0n) throw new Error(`Invalid lineage batch ${batchId}`);
  const direct = batch.deliveryContributions ?? [];
  const transformed = batch.transformationInputs ?? [];
  if (direct.length > 0 && transformed.length > 0)
    throw new Error(`Batch ${batchId} has ambiguous direct and transformed lineage`);
  if (direct.length > 0) {
    return direct.map((contribution) => ({
      deliveryId: contribution.deliveryId,
      farmerId: contribution.farmerId,
      numerator: contribution.quantityUnits,
      denominator: batch.quantityUnits,
    }));
  }
  if (transformed.length === 0) throw new Error(`Batch ${batchId} has no lineage sources`);

  const nextVisiting = new Set(visiting).add(batchId);
  const inputWeights = mergeWeights(
    transformed.flatMap((input) =>
      scaleWeights(resolveBatch(input.batchId, batches, nextVisiting), input.quantityUnits),
    ),
  );
  return normalizeWeights(inputWeights);
}

function scaleWeights(weights: readonly WeightedDelivery[], quantity: bigint): WeightedDelivery[] {
  return weights.map((weight) => ({
    ...weight,
    numerator: weight.numerator * quantity,
  }));
}

function normalizeWeights(weights: readonly WeightedDelivery[]): WeightedDelivery[] {
  const total = weights.reduce((sum, weight) => addFractions(sum, weight), {
    numerator: 0n,
    denominator: 1n,
  });
  if (total.numerator <= 0n) throw new Error('Lineage quantity must be positive');
  return weights.map((weight) => ({
    ...weight,
    numerator: weight.numerator * total.denominator,
    denominator: weight.denominator * total.numerator,
  }));
}

function mergeWeights(weights: readonly WeightedDelivery[]): WeightedDelivery[] {
  const merged = new Map<string, WeightedDelivery>();
  for (const weight of weights) {
    if (weight.numerator <= 0n || weight.denominator <= 0n) continue;
    const key = `${weight.farmerId}:${weight.deliveryId}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, weight);
      continue;
    }
    const sum = addFractions(current, weight);
    merged.set(key, { ...current, ...sum });
  }
  return normalizeWeights([...merged.values()]);
}

function addFractions(
  left: { numerator: bigint; denominator: bigint },
  right: { numerator: bigint; denominator: bigint },
) {
  return {
    numerator: left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  };
}

function apportion<T>(
  total: bigint,
  shares: readonly {
    item: T;
    numerator: bigint;
    denominator: bigint;
    stableKey: string;
  }[],
): Array<{ item: T; amount: bigint; residualUnits: bigint }> {
  if (shares.length === 0) throw new Error('Cannot apportion without recipients');
  const calculated: RemainderShare<T>[] = shares.map((share) => {
    if (share.numerator < 0n || share.denominator <= 0n)
      throw new Error('Invalid allocation ratio');
    const scaledNumerator = total * share.numerator;
    return {
      item: share.item,
      floor: scaledNumerator / share.denominator,
      remainderNumerator: scaledNumerator % share.denominator,
      remainderDenominator: share.denominator,
      stableKey: share.stableKey,
    };
  });
  let residual = total - calculated.reduce((sum, share) => sum + share.floor, 0n);
  if (residual < 0n || residual > BigInt(calculated.length))
    throw new Error('Allocation ratios do not reconcile to one');
  calculated.sort((left, right) => {
    const comparison =
      right.remainderNumerator * left.remainderDenominator -
      left.remainderNumerator * right.remainderDenominator;
    if (comparison !== 0n) return comparison > 0n ? 1 : -1;
    return left.stableKey.localeCompare(right.stableKey);
  });
  return calculated.map((share) => {
    const residualUnits = residual > 0n ? 1n : 0n;
    residual -= residualUnits;
    return { item: share.item, amount: share.floor + residualUnits, residualUnits };
  });
}
