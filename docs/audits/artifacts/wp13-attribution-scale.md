$ tsx prisma/attribution-plan-measurements.ts
# Attribution scale and lock measurements

Deliveries available: 54004

## Row counts

- FarmerBatchContribution DIRECT: 1
- FarmerBatchContribution DERIVED: 99954

Heaviest synthetic batch holds 50 contributions.

## Index coverage


### Query A BEFORE - single batch attribution without the batchId/reversedAt index

```
Bitmap Heap Scan on "FarmerBatchContribution" c  (cost=4.81..183.36 rows=50 width=21) (actual time=0.016..0.020 rows=50 loops=1)
  Recheck Cond: ("batchId" = 'df7431b7-9312-4411-855f-05d8f50b1203'::uuid)
  Filter: ("reversedAt" IS NULL)
  Heap Blocks: exact=2
  Buffers: shared hit=6
  ->  Bitmap Index Scan on "FarmerBatchContribution_batchId_deliveryId_key"  (cost=0.00..4.79 rows=50 width=0) (actual time=0.013..0.013 rows=50 loops=1)
        Index Cond: ("batchId" = 'df7431b7-9312-4411-855f-05d8f50b1203'::uuid)
        Buffers: shared hit=4
Planning:
  Buffers: shared hit=16
Planning Time: 0.041 ms
Execution Time: 0.086 ms
```

### Query A AFTER - single batch attribution with the batchId/reversedAt index

```
Index Only Scan using "FarmerBatchContribution_live_attribution_idx" on "FarmerBatchContribution" c  (cost=0.42..149.18 rows=50 width=21) (actual time=0.013..0.016 rows=50 loops=1)
  Index Cond: ("batchId" = 'df7431b7-9312-4411-855f-05d8f50b1203'::uuid)
  Heap Fetches: 50
  Buffers: shared hit=6
Planning:
  Buffers: shared hit=42
Planning Time: 0.082 ms
Execution Time: 0.021 ms
```

### Query B BEFORE - lot to farmers without the index

```
HashAggregate  (cost=3554.21..3554.26 rows=4 width=48) (actual time=1.189..1.190 rows=7 loops=1)
  Group Key: d."farmerId"
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=3103
  ->  Nested Loop  (cost=5.10..3549.21 rows=1000 width=21) (actual time=0.020..1.096 rows=1000 loops=1)
        Buffers: shared hit=3103
        ->  Nested Loop  (cost=4.81..3140.07 rows=1000 width=21) (actual time=0.016..0.279 rows=1000 loops=1)
              Buffers: shared hit=103
              ->  Seq Scan on "CooperativeLotContribution" lbc  (cost=0.00..1.26 rows=20 width=16) (actual time=0.002..0.004 rows=20 loops=1)
                    Filter: ("lotId" = '3ad821cb-013f-4b84-badd-af8f5817e7a5'::uuid)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1
              ->  Bitmap Heap Scan on "FarmerBatchContribution" c  (cost=4.81..156.44 rows=50 width=37) (actual time=0.007..0.010 rows=50 loops=20)
                    Recheck Cond: (lbc."batchId" = "batchId")
                    Filter: ("reversedAt" IS NULL)
                    Heap Blocks: exact=36
                    Buffers: shared hit=102
                    ->  Bitmap Index Scan on "FarmerBatchContribution_batchId_deliveryId_key"  (cost=0.00..4.79 rows=50 width=0) (actual time=0.006..0.006 rows=50 loops=20)
                          Index Cond: ("batchId" = lbc."batchId")
                          Buffers: shared hit=66
        ->  Index Scan using "Delivery_pkey" on "Delivery" d  (cost=0.29..0.41 rows=1 width=32) (actual time=0.001..0.001 rows=1 loops=1000)
              Index Cond: (id = c."deliveryId")
              Buffers: shared hit=3000
Planning:
  Buffers: shared hit=77 dirtied=1
Planning Time: 0.234 ms
Execution Time: 1.218 ms
```

### Query B AFTER - lot to farmers with the index

```
HashAggregate  (cost=2865.50..2865.55 rows=4 width=48) (actual time=0.811..0.812 rows=7 loops=1)
  Group Key: d."farmerId"
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=3098
  ->  Nested Loop  (cost=0.71..2860.50 rows=1000 width=21) (actual time=0.011..0.716 rows=1000 loops=1)
        Buffers: shared hit=3098
        ->  Nested Loop  (cost=0.42..2451.35 rows=1000 width=21) (actual time=0.009..0.176 rows=1000 loops=1)
              Buffers: shared hit=98
              ->  Seq Scan on "CooperativeLotContribution" lbc  (cost=0.00..1.26 rows=20 width=16) (actual time=0.003..0.004 rows=20 loops=1)
                    Filter: ("lotId" = '3ad821cb-013f-4b84-badd-af8f5817e7a5'::uuid)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1
              ->  Index Only Scan using "FarmerBatchContribution_live_attribution_idx" on "FarmerBatchContribution" c  (cost=0.42..122.00 rows=50 width=37) (actual time=0.003..0.006 rows=50 loops=20)
                    Index Cond: ("batchId" = lbc."batchId")
                    Heap Fetches: 1000
                    Buffers: shared hit=97
        ->  Index Scan using "Delivery_pkey" on "Delivery" d  (cost=0.29..0.41 rows=1 width=32) (actual time=0.000..0.000 rows=1 loops=1000)
              Index Cond: (id = c."deliveryId")
              Buffers: shared hit=3000
Planning:
  Buffers: shared hit=74
Planning Time: 0.167 ms
Execution Time: 0.825 ms
```

## Concurrent transformations over overlapping inputs

- session 1 (sorted): total 410ms, lock acquisition 2ms
- session 2 (sorted, overlapping): total 415ms, lock acquisition 400ms
- Sorted acquisition: both sessions committed, serialised on the lock.
- session 4 (descending): total 1444ms, lock acquisition 1037ms
- Opposing acquisition: PostgreSQL aborted a session with a deadlock. This is the failure the sorted order in TransformationsService prevents.

Synthetic fixture removed.
