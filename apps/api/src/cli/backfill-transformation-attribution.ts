import { createDatabaseClient } from '@clycites/database';

import {
  allocateAttribution,
  mergeAttributionWeights,
  type AttributionSource,
} from '../batches/attribution.js';
import { formatQuantity, toQuantityUnits } from '../batches/quantity.js';

/**
 * Backfills DERIVED farmer attribution onto batches that were produced by a
 * transformation before attribution was propagated on write.
 *
 * Idempotent: an output batch that already carries DERIVED rows for its own
 * transformation is skipped, so the script can be re-run safely. Transformations are
 * processed in completion order because a transformation may consume a batch that was
 * itself produced by an earlier transformation, and the upstream attribution has to
 * exist before the downstream one can be derived.
 *
 * Pass --apply to write. Without it the script reports what it would do and exits.
 * A dry run under-reports chained transformations: it cannot see the attribution that
 * an earlier transformation in the same pass would have written, so any transformation
 * consuming a transformed batch is counted as unattributable until the run is applied.
 */
const apply = process.argv.includes('--apply');
const database = createDatabaseClient();

try {
  const before = await database.farmerBatchContribution.groupBy({
    by: ['origin'],
    _count: { _all: true },
  });
  console.log('contributions before:', summarize(before));

  const transformations = await database.batchTransformation.findMany({
    where: { status: 'COMPLETED' },
    include: { inputs: true, outputs: true },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
  });
  console.log(`completed transformations: ${transformations.length}`);

  let outputsExamined = 0;
  let outputsSkipped = 0;
  let outputsBackfilled = 0;
  let outputsUnattributable = 0;
  let rowsWritten = 0;

  for (const transformation of transformations) {
    const inputIds = transformation.inputs.map((input) => input.batchId);
    const liveContributions = await database.farmerBatchContribution.findMany({
      where: { batchId: { in: inputIds }, reversedAt: null },
      select: { batchId: true, deliveryId: true, quantity: true },
      orderBy: [{ batchId: 'asc' }, { deliveryId: 'asc' }],
    });
    const sources: AttributionSource[] = transformation.inputs.map((input) => ({
      batchId: input.batchId,
      requestedUnits: toQuantityUnits(input.quantity.toFixed(4)),
      contributions: liveContributions
        .filter((contribution) => contribution.batchId === input.batchId)
        .map((contribution) => ({
          deliveryId: contribution.deliveryId,
          quantityUnits: toQuantityUnits(contribution.quantity.toFixed(4)),
        })),
    }));
    const merged = mergeAttributionWeights(sources);

    for (const output of transformation.outputs) {
      outputsExamined += 1;
      const existing = await database.farmerBatchContribution.count({
        where: { batchId: output.batchId, transformationId: transformation.id },
      });
      if (existing > 0) {
        outputsSkipped += 1;
        continue;
      }
      const shares = allocateAttribution(merged, toQuantityUnits(output.quantity.toFixed(4)));
      if (shares.length === 0) {
        outputsUnattributable += 1;
        continue;
      }
      outputsBackfilled += 1;
      rowsWritten += shares.length;
      if (!apply) continue;
      await database.farmerBatchContribution.createMany({
        data: shares.map((share) => ({
          batchId: output.batchId,
          deliveryId: share.deliveryId,
          quantity: formatQuantity(share.quantityUnits),
          unit: output.unit,
          origin: 'DERIVED' as const,
          transformationId: transformation.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  console.log({
    mode: apply ? 'apply' : 'dry-run',
    outputsExamined,
    outputsSkipped,
    outputsBackfilled,
    outputsUnattributable,
    rowsWritten,
  });

  const after = await database.farmerBatchContribution.groupBy({
    by: ['origin'],
    _count: { _all: true },
  });
  console.log('contributions after:', summarize(after));
  if (!apply) console.log('Dry run only. Re-run with --apply to write.');
} finally {
  await database.$disconnect();
}

function summarize(rows: { origin: string; _count: { _all: number } }[]) {
  return Object.fromEntries(rows.map((row) => [row.origin, row._count._all]));
}
