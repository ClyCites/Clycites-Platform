export interface SourceContribution {
  deliveryId: string;
  quantityUnits: bigint;
}

export interface AttributionSource {
  batchId: string;
  /** Quantity drawn from this input batch by the transformation. */
  requestedUnits: bigint;
  /** Live (non-reversed) contributions recorded against the input batch. */
  contributions: readonly SourceContribution[];
}

export interface AttributionWeight {
  deliveryId: string;
  numerator: bigint;
}

export interface MergedAttribution {
  weights: AttributionWeight[];
  /** Common denominator total: equals the sum of every weight numerator. */
  total: bigint;
  /** Input units backed by at least one live contribution. */
  attributedUnits: bigint;
  /** Input units drawn from batches with no live contribution to attribute. */
  unattributedUnits: bigint;
}

export interface AttributionShare {
  deliveryId: string;
  quantityUnits: bigint;
}

/**
 * Combines the delivery-level attribution of every input batch onto a single
 * common denominator so that later allocation is exact rather than a product of
 * successively rounded ratios.
 *
 * For an input batch `b` holding live contributions totalling `T_b`, of which the
 * transformation draws `R_b`, a delivery `d` contributing `c` is entitled to
 * `c * R_b / T_b`. Using `D = product(T_b)` as the denominator makes every such
 * share an integer numerator `c * R_b * (D / T_b)`, so no precision is lost while
 * merging deliveries that appear across several input batches.
 */
export function mergeAttributionWeights(
  sources: readonly AttributionSource[],
): MergedAttribution {
  const attributable = sources.filter(
    (source) => source.requestedUnits > 0n && totalOf(source.contributions) > 0n,
  );
  const unattributedUnits = sources
    .filter((source) => !attributable.includes(source))
    .reduce((sum, source) => sum + source.requestedUnits, 0n);
  const attributedUnits = attributable.reduce((sum, source) => sum + source.requestedUnits, 0n);

  if (attributable.length === 0)
    return { weights: [], total: 0n, attributedUnits: 0n, unattributedUnits };

  const denominator = attributable.reduce(
    (product, source) => product * totalOf(source.contributions),
    1n,
  );
  const numerators = new Map<string, bigint>();
  for (const source of attributable) {
    const sourceTotal = totalOf(source.contributions);
    const scale = (denominator / sourceTotal) * source.requestedUnits;
    for (const contribution of source.contributions) {
      if (contribution.quantityUnits <= 0n) continue;
      const previous = numerators.get(contribution.deliveryId) ?? 0n;
      numerators.set(contribution.deliveryId, previous + contribution.quantityUnits * scale);
    }
  }

  const weights = [...numerators.entries()]
    .map(([deliveryId, numerator]) => ({ deliveryId, numerator }))
    .sort((left, right) => (left.deliveryId < right.deliveryId ? -1 : 1));
  const total = weights.reduce((sum, weight) => sum + weight.numerator, 0n);
  return { weights, total, attributedUnits, unattributedUnits };
}

/**
 * Splits `outputUnits` across the weighted deliveries using the largest-remainder
 * method, so the allocated parts sum to exactly `outputUnits` with no drift and no
 * synthetic remainder row. Ties are broken by delivery id to keep the result
 * deterministic across replays and backfills.
 */
export function allocateAttribution(
  merged: MergedAttribution,
  outputUnits: bigint,
): AttributionShare[] {
  if (outputUnits <= 0n || merged.total <= 0n || merged.weights.length === 0) return [];

  const shares = merged.weights.map((weight) => {
    const scaled = outputUnits * weight.numerator;
    return {
      deliveryId: weight.deliveryId,
      quantityUnits: scaled / merged.total,
      remainder: scaled % merged.total,
    };
  });
  let allocated = shares.reduce((sum, share) => sum + share.quantityUnits, 0n);
  const ordered = [...shares].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.deliveryId < right.deliveryId ? -1 : 1;
  });
  for (const share of ordered) {
    if (allocated >= outputUnits) break;
    share.quantityUnits += 1n;
    allocated += 1n;
  }

  return shares
    .filter((share) => share.quantityUnits > 0n)
    .map(({ deliveryId, quantityUnits }) => ({ deliveryId, quantityUnits }));
}

function totalOf(contributions: readonly SourceContribution[]): bigint {
  return contributions.reduce((sum, contribution) => sum + contribution.quantityUnits, 0n);
}
