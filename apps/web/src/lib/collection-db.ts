import Dexie, { type EntityTable } from 'dexie';
import type { OfflineOperationRequest } from '@clycites/contracts';

export type QueueState = 'LOCAL' | 'QUEUED' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED';

export interface SnapshotRecord {
  key: string;
  organizationId: string;
  entityType: 'FARMER' | 'QR_IDENTITY' | 'FARM' | 'COMMODITY' | 'QUALITY_DEFINITION';
  entityId: string;
  collectionPointId: string;
  updatedAt: string;
  expiresAt?: string;
  value: unknown;
}

export interface OperationRecord {
  key: string;
  organizationId: string;
  deviceId: string;
  clientOperationId: string;
  state: QueueState;
  operation: OfflineOperationRequest;
  errorCode?: string;
  errorMessage?: string;
  updatedAt: string;
}

export interface ContextRecord {
  organizationId: string;
  deviceId: string;
  collectionPointId: string;
  collectionSessionId: string;
  snapshotCursor: string;
  locked: number;
  updatedAt: string;
}

export interface BatchDraftRecord {
  key: string;
  organizationId: string;
  batchId: string;
  state: QueueState;
  value: unknown;
  updatedAt: string;
}

export interface DeliveryAvailabilityRecord {
  key: string;
  organizationId: string;
  deliveryId: string;
  availableQuantity: string;
  unit: 'KG';
  updatedAt: string;
}

class CollectionDatabase extends Dexie {
  snapshots!: EntityTable<SnapshotRecord, 'key'>;
  operations!: EntityTable<OperationRecord, 'key'>;
  contexts!: EntityTable<ContextRecord, 'organizationId'>;
  batchDrafts!: EntityTable<BatchDraftRecord, 'key'>;
  deliveryAvailability!: EntityTable<DeliveryAvailabilityRecord, 'key'>;

  constructor() {
    super('clycites-collection-v1');
    this.version(1).stores({
      snapshots: '&key, [organizationId+entityType], [organizationId+collectionPointId], updatedAt',
      operations:
        '&key, [organizationId+state], [organizationId+deviceId], clientOperationId, updatedAt',
      contexts: '&organizationId, deviceId, collectionPointId, locked, updatedAt',
    });
    this.version(2).stores({
      snapshots: '&key, [organizationId+entityType], [organizationId+collectionPointId], updatedAt',
      operations:
        '&key, [organizationId+state], [organizationId+deviceId], clientOperationId, updatedAt',
      contexts: '&organizationId, deviceId, collectionPointId, locked, updatedAt',
      batchDrafts: '&key, [organizationId+state], [organizationId+batchId], updatedAt',
      deliveryAvailability: '&key, [organizationId+deliveryId], updatedAt',
    });
    this.version(3).stores({
      snapshots:
        '&key, [organizationId+entityType], [organizationId+collectionPointId], updatedAt, expiresAt',
      operations:
        '&key, [organizationId+state], [organizationId+deviceId], clientOperationId, updatedAt',
      contexts: '&organizationId, deviceId, collectionPointId, locked, updatedAt',
      batchDrafts: '&key, [organizationId+state], [organizationId+batchId], updatedAt',
      deliveryAvailability: '&key, [organizationId+deliveryId], updatedAt',
    });
  }
}

export const collectionDb = new CollectionDatabase();

export const partitionKey = (
  organizationId: string,
  entityType: string,
  entityId: string,
): string => `${organizationId}:${entityType}:${entityId}`;

export const queueOperation = async (
  organizationId: string,
  deviceId: string,
  operation: OfflineOperationRequest,
) => {
  await collectionDb.operations.put({
    key: partitionKey(organizationId, 'OPERATION', operation.clientOperationId),
    organizationId,
    deviceId,
    clientOperationId: operation.clientOperationId,
    state: 'QUEUED',
    operation,
    updatedAt: new Date().toISOString(),
  });
};

export const lockOrganizationData = async (organizationId: string): Promise<void> => {
  const context = await collectionDb.contexts.get(organizationId);
  if (context)
    await collectionDb.contexts.update(organizationId, {
      locked: 1,
      updatedAt: new Date().toISOString(),
    });
};

export const clearOrganizationData = async (organizationId: string): Promise<void> => {
  await collectionDb.transaction(
    'rw',
    collectionDb.snapshots,
    collectionDb.operations,
    collectionDb.contexts,
    collectionDb.batchDrafts,
    collectionDb.deliveryAvailability,
    async () => {
      await collectionDb.snapshots.where('organizationId').equals(organizationId).delete();
      await collectionDb.operations.where('organizationId').equals(organizationId).delete();
      await collectionDb.contexts.delete(organizationId);
      await collectionDb.batchDrafts.where('organizationId').equals(organizationId).delete();
      await collectionDb.deliveryAvailability
        .where('organizationId')
        .equals(organizationId)
        .delete();
    },
  );
};

export const clearAllCollectionData = async (): Promise<void> => {
  await collectionDb.delete();
};

export const removeExpiredSnapshots = async (now = new Date()): Promise<number> => {
  const expiredKeys = await collectionDb.snapshots
    .where('expiresAt')
    .belowOrEqual(now.toISOString())
    .primaryKeys();
  await collectionDb.snapshots.bulkDelete(expiredKeys);
  return expiredKeys.length;
};

export interface CollectionDiagnostics {
  generatedAt: string;
  organizationId: string;
  context: {
    configured: boolean;
    locked: boolean;
    snapshotUpdatedAt: string | null;
  };
  counts: {
    snapshots: number;
    drafts: number;
    availabilityRecords: number;
    operationsByState: Partial<Record<QueueState, number>>;
  };
}

export const getCollectionDiagnostics = async (
  organizationId: string,
): Promise<CollectionDiagnostics> => {
  const [context, snapshots, drafts, availability, operations] = await Promise.all([
    collectionDb.contexts.get(organizationId),
    collectionDb.snapshots.where('organizationId').equals(organizationId).toArray(),
    collectionDb.batchDrafts.where('organizationId').equals(organizationId).count(),
    collectionDb.deliveryAvailability.where('organizationId').equals(organizationId).count(),
    collectionDb.operations.where('organizationId').equals(organizationId).toArray(),
  ]);
  const operationsByState = operations.reduce<Partial<Record<QueueState, number>>>(
    (counts, operation) => ({
      ...counts,
      [operation.state]: (counts[operation.state] ?? 0) + 1,
    }),
    {},
  );
  return {
    generatedAt: new Date().toISOString(),
    organizationId,
    context: {
      configured: Boolean(context),
      locked: context?.locked === 1,
      snapshotUpdatedAt:
        snapshots.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
          ?.updatedAt ?? null,
    },
    counts: {
      snapshots: snapshots.length,
      drafts,
      availabilityRecords: availability,
      operationsByState,
    },
  };
};
