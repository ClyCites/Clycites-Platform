'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CloudDownload,
  QrCode,
  RefreshCw,
  Scale,
  Send,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { OfflineOperationRequest, QualityValue } from '@clycites/contracts';
import { Button } from '@clycites/ui';

import { apiRequest } from '@/lib/api-client';
import {
  collectionDb,
  partitionKey,
  queueOperation,
  type ContextRecord,
  type OperationRecord,
} from '@/lib/collection-db';
import { ProtectedPage } from './protected-page';

interface Device {
  id: string;
  name: string;
  status: string;
}
interface Point {
  id: string;
  name: string;
  code: string;
}
interface Paginated<T> {
  items: T[];
}
interface Farmer {
  id: string;
  farmerNumber: string;
  displayName: string;
  membershipId: string;
}
interface CommodityForm {
  id: string;
  commodityId: string;
  name: string;
  code: string;
}
interface Commodity {
  id: string;
  name: string;
  forms: CommodityForm[];
}
interface QualityDefinition {
  id: string;
  commodityFormId: string;
  name: string;
  dataType: 'DECIMAL' | 'INTEGER' | 'TEXT' | 'ENUM' | 'BOOLEAN';
  required: boolean;
  allowedValues: string[] | null;
  unit: string | null;
}
interface Snapshot {
  collectionPoint: Point;
  farmers: Farmer[];
  qrIdentities: { publicId: string; farmerId: string }[];
  farms: { id: string; farmerId: string; name: string }[];
  commodities: Commodity[];
  qualityDefinitions: QualityDefinition[];
  nextCursor: string;
}

const fieldClass =
  'min-h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20';

const calculateAmount = (quantity: string, unitPrice: string): string => {
  const [whole = '0', fraction = ''] = quantity.split('.');
  const scaled =
    BigInt(whole || '0') * 10_000n + BigInt(fraction.padEnd(4, '0').slice(0, 4) || '0');
  return ((scaled * BigInt(unitPrice || '0') + 5_000n) / 10_000n).toString();
};

const qualityValue = (definition: QualityDefinition, value: string | boolean): QualityValue => {
  const base = {
    qualityAttributeDefinitionId: definition.id,
    capturedAt: new Date().toISOString(),
  };
  if (definition.dataType === 'DECIMAL')
    return { ...base, dataType: 'DECIMAL', value: String(value) };
  if (definition.dataType === 'INTEGER')
    return { ...base, dataType: 'INTEGER', value: Number(value) };
  if (definition.dataType === 'TEXT') return { ...base, dataType: 'TEXT', value: String(value) };
  if (definition.dataType === 'ENUM') return { ...base, dataType: 'ENUM', value: String(value) };
  return { ...base, dataType: 'BOOLEAN', value: Boolean(value) };
};

export function CollectionWorkspace({ organizationId }: { organizationId: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [context, setContext] = useState<ContextRecord>();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [queue, setQueue] = useState<OperationRecord[]>([]);
  const [farmerSearch, setFarmerSearch] = useState('');
  const [farmerId, setFarmerId] = useState('');
  const [formId, setFormId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('3000');
  const [confirmed, setConfirmed] = useState(false);
  const [qualityValues, setQualityValues] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState('Choose a device and collection point to begin.');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);

  const refreshQueue = async () => {
    setQueue(
      await collectionDb.operations
        .where('organizationId')
        .equals(organizationId)
        .sortBy('updatedAt'),
    );
  };

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    void Promise.all([
      apiRequest<Device[]>(`/organizations/${organizationId}/devices`),
      apiRequest<Paginated<Point>>(
        `/organizations/${organizationId}/collection-points?pageSize=100`,
      ),
      collectionDb.contexts.get(organizationId),
    ]).then(([deviceData, pointData, savedContext]) => {
      setDevices(deviceData.filter((device) => device.status === 'ACTIVE'));
      setPoints(pointData.items);
      if (savedContext && !savedContext.locked) setContext(savedContext);
    });
    void collectionDb.operations
      .where('organizationId')
      .equals(organizationId)
      .sortBy('updatedAt')
      .then((records) => setQueue(records));
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, [organizationId]);

  const openSession = async (deviceId: string, collectionPointId: string) => {
    setBusy(true);
    try {
      const session = await apiRequest<{ id: string }>(
        `/organizations/${organizationId}/collection-sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            deviceId,
            collectionPointId,
            businessDate: new Date().toISOString().slice(0, 10),
          }),
        },
      );
      const next: ContextRecord = {
        organizationId,
        deviceId,
        collectionPointId,
        collectionSessionId: session.id,
        snapshotCursor: '',
        locked: 0,
        updatedAt: new Date().toISOString(),
      };
      await collectionDb.contexts.put(next);
      setContext(next);
      setStatus('Session open. Download collection data before recording deliveries.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to open collection session.');
    } finally {
      setBusy(false);
    }
  };

  const downloadSnapshot = async () => {
    if (!context) return;
    setBusy(true);
    try {
      const data = await apiRequest<Snapshot>(
        `/organizations/${organizationId}/collection-snapshot?collectionPointId=${context.collectionPointId}&deviceId=${context.deviceId}&collectionSessionId=${context.collectionSessionId}`,
      );
      const snapshotExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await collectionDb.transaction(
        'rw',
        collectionDb.snapshots,
        collectionDb.contexts,
        async () => {
          await collectionDb.snapshots.where('organizationId').equals(organizationId).delete();
          for (const farmer of data.farmers) {
            await collectionDb.snapshots.put({
              key: partitionKey(organizationId, 'FARMER', farmer.id),
              organizationId,
              entityType: 'FARMER',
              entityId: farmer.id,
              collectionPointId: context.collectionPointId,
              updatedAt: data.nextCursor,
              expiresAt: snapshotExpiresAt,
              value: farmer,
            });
          }
          for (const identity of data.qrIdentities) {
            await collectionDb.snapshots.put({
              key: partitionKey(organizationId, 'QR_IDENTITY', identity.publicId),
              organizationId,
              entityType: 'QR_IDENTITY',
              entityId: identity.publicId,
              collectionPointId: context.collectionPointId,
              updatedAt: data.nextCursor,
              expiresAt: snapshotExpiresAt,
              value: identity,
            });
          }
          for (const farm of data.farms) {
            await collectionDb.snapshots.put({
              key: partitionKey(organizationId, 'FARM', farm.id),
              organizationId,
              entityType: 'FARM',
              entityId: farm.id,
              collectionPointId: context.collectionPointId,
              updatedAt: data.nextCursor,
              expiresAt: snapshotExpiresAt,
              value: farm,
            });
          }
          for (const commodity of data.commodities) {
            await collectionDb.snapshots.put({
              key: partitionKey(organizationId, 'COMMODITY', commodity.id),
              organizationId,
              entityType: 'COMMODITY',
              entityId: commodity.id,
              collectionPointId: context.collectionPointId,
              updatedAt: data.nextCursor,
              expiresAt: snapshotExpiresAt,
              value: commodity,
            });
          }
          for (const definition of data.qualityDefinitions) {
            await collectionDb.snapshots.put({
              key: partitionKey(organizationId, 'QUALITY_DEFINITION', definition.id),
              organizationId,
              entityType: 'QUALITY_DEFINITION',
              entityId: definition.id,
              collectionPointId: context.collectionPointId,
              updatedAt: data.nextCursor,
              expiresAt: snapshotExpiresAt,
              value: definition,
            });
          }
          await collectionDb.contexts.update(organizationId, {
            snapshotCursor: data.nextCursor,
            updatedAt: new Date().toISOString(),
          });
        },
      );
      setSnapshot(data);
      setFormId(data.commodities[0]?.forms[0]?.id ?? '');
      setStatus(`${data.farmers.length} farmers available offline.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Snapshot download failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadLocalSnapshot = async () => {
    const records = await collectionDb.snapshots
      .where('organizationId')
      .equals(organizationId)
      .toArray();
    const farmers = records
      .filter((record) => record.entityType === 'FARMER')
      .map((record) => record.value as Farmer);
    const qrIdentities = records
      .filter((record) => record.entityType === 'QR_IDENTITY')
      .map((record) => record.value as Snapshot['qrIdentities'][number]);
    const farms = records
      .filter((record) => record.entityType === 'FARM')
      .map((record) => record.value as Snapshot['farms'][number]);
    const commodities = records
      .filter((record) => record.entityType === 'COMMODITY')
      .map((record) => record.value as Commodity);
    const qualityDefinitions = records
      .filter((record) => record.entityType === 'QUALITY_DEFINITION')
      .map((record) => record.value as QualityDefinition);
    if (context && farmers.length > 0) {
      setSnapshot({
        collectionPoint: points.find((point) => point.id === context.collectionPointId) ?? {
          id: context.collectionPointId,
          name: 'Collection point',
          code: '',
        },
        farmers,
        qrIdentities,
        farms,
        commodities,
        qualityDefinitions,
        nextCursor: context.snapshotCursor,
      });
      setFormId(commodities[0]?.forms[0]?.id ?? '');
      setStatus(`${farmers.length} farmers loaded from this device.`);
    }
  };

  const resolveFarmer = () => {
    if (!snapshot) return;
    const identity = snapshot.qrIdentities.find(
      (candidate) => candidate.publicId === farmerSearch.trim(),
    );
    const farmer = snapshot.farmers.find(
      (candidate) =>
        candidate.id === identity?.farmerId ||
        candidate.farmerNumber.toLowerCase() === farmerSearch.trim().toLowerCase() ||
        candidate.displayName.toLowerCase().includes(farmerSearch.trim().toLowerCase()),
    );
    setFarmerId(farmer?.id ?? '');
    setStatus(
      farmer
        ? `${farmer.displayName} selected.`
        : 'No active farmer found in this collection snapshot.',
    );
  };

  const synchronize = async () => {
    if (!context || !online) return;
    const pending = await collectionDb.operations
      .where('[organizationId+state]')
      .anyOf([
        [organizationId, 'QUEUED'],
        [organizationId, 'FAILED'],
      ])
      .toArray();
    if (pending.length === 0) return;
    setBusy(true);
    try {
      await collectionDb.operations.bulkUpdate(
        pending.map((record) => ({
          key: record.key,
          changes: { state: 'SYNCING', updatedAt: new Date().toISOString() },
        })),
      );
      const response = await apiRequest<{
        operations: {
          clientOperationId: string;
          status: string;
          error: { code: string; message: string } | null;
        }[];
      }>(`/organizations/${organizationId}/offline-sync`, {
        method: 'POST',
        body: JSON.stringify({
          deviceId: context.deviceId,
          operations: pending.map((record) => record.operation),
        }),
      });
      for (const result of response.operations) {
        const record = pending.find(
          (candidate) => candidate.clientOperationId === result.clientOperationId,
        );
        if (!record) continue;
        await collectionDb.operations.update(record.key, {
          state:
            result.status === 'PROCESSED'
              ? 'SYNCED'
              : result.status === 'CONFLICT'
                ? 'CONFLICT'
                : 'FAILED',
          ...(result.error
            ? { errorCode: result.error.code, errorMessage: result.error.message }
            : {}),
          updatedAt: new Date().toISOString(),
        });
      }
      setStatus('Synchronization complete.');
    } catch (error) {
      await collectionDb.operations.bulkUpdate(
        pending.map((record) => ({
          key: record.key,
          changes: { state: 'QUEUED', updatedAt: new Date().toISOString() },
        })),
      );
      setStatus(error instanceof Error ? error.message : 'Synchronization failed.');
    } finally {
      await refreshQueue();
      setBusy(false);
    }
  };

  const recordDelivery = async () => {
    if (!context || !snapshot || !farmerId || !formId || !quantity || !confirmed) {
      setStatus('Farmer, coffee form, quantity, and confirmation are required.');
      return;
    }
    const form = snapshot.commodities
      .flatMap((commodity) => commodity.forms)
      .find((candidate) => candidate.id === formId);
    if (!form) return;
    const definitions = snapshot.qualityDefinitions.filter(
      (definition) => definition.commodityFormId === formId,
    );
    if (
      definitions.some(
        (definition) =>
          definition.required &&
          (qualityValues[definition.id] === undefined || qualityValues[definition.id] === ''),
      )
    ) {
      setStatus('Complete every required quality check.');
      return;
    }
    const operationId = crypto.randomUUID();
    const clientEntityId = crypto.randomUUID();
    const farmer = snapshot.farmers.find((candidate) => candidate.id === farmerId);
    const operation: OfflineOperationRequest = {
      clientOperationId: operationId,
      clientEntityId,
      clientCreatedAt: new Date().toISOString(),
      baseVersion: null,
      operationType: 'CREATE_DELIVERY',
      payload: {
        clientEntityId,
        deviceId: context.deviceId,
        collectionSessionId: context.collectionSessionId,
        collectionPointId: context.collectionPointId,
        farmerId,
        commodityId: form.commodityId,
        commodityFormId: form.id,
        clientCreatedAt: new Date().toISOString(),
        weight: { mode: 'DIRECT_NET', netQuantity: quantity, unit: 'KG', captureMethod: 'MANUAL' },
        pricing: {
          unitPriceMinor: unitPrice,
          currency: 'UGX',
          adjustmentAmountMinor: '0',
          priceSource: 'COLLECTION_POINT',
          clientGrossAmountMinor: calculateAmount(quantity, unitPrice),
          clientNetAmountMinor: calculateAmount(quantity, unitPrice),
        },
        qualityMeasurements: definitions
          .filter(
            (definition) =>
              qualityValues[definition.id] !== undefined && qualityValues[definition.id] !== '',
          )
          .map((definition) => qualityValue(definition, qualityValues[definition.id] ?? '')),
        confirmation: {
          method: 'VERBAL_WITNESSED',
          status: 'CONFIRMED',
          confirmedByName: farmer?.displayName,
          confirmedAt: new Date().toISOString(),
        },
        submit: true,
        accept: true,
      },
    };
    await queueOperation(organizationId, context.deviceId, operation);
    setFarmerSearch('');
    setFarmerId('');
    setQuantity('');
    setConfirmed(false);
    setQualityValues({});
    setStatus('Delivery saved on this device.');
    await refreshQueue();
    if (online) void synchronize();
  };

  const selectedFarmer = snapshot?.farmers.find((farmer) => farmer.id === farmerId);
  const activeQualityDefinitions =
    snapshot?.qualityDefinitions.filter((definition) => definition.commodityFormId === formId) ??
    [];
  const pendingCount = queue.filter((record) => !['SYNCED'].includes(record.state)).length;

  return (
    <ProtectedPage>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-300 pb-5">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-800">Coffee collection</p>
            <h1 className="mt-1 text-3xl font-bold text-stone-950">Field desk</h1>
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span
              className={`flex items-center gap-2 ${online ? 'text-emerald-800' : 'text-amber-800'}`}
            >
              {online ? <Wifi size={18} /> : <WifiOff size={18} />}
              {online ? 'Online' : 'Offline'}
            </span>
            <span className="border-l border-stone-300 pl-3">{pendingCount} pending</span>
          </div>
        </header>

        <section className="mt-5 grid gap-3 border-b border-stone-300 pb-5 md:grid-cols-[1fr_1fr_auto_auto]">
          <select
            aria-label="Device"
            className={fieldClass}
            value={context?.deviceId ?? ''}
            onChange={(event) =>
              setContext((current) => ({
                organizationId,
                deviceId: event.target.value,
                collectionPointId: current?.collectionPointId ?? '',
                collectionSessionId: '',
                snapshotCursor: '',
                locked: 0,
                updatedAt: new Date().toISOString(),
              }))
            }
          >
            <option value="">Choose device</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Collection point"
            className={fieldClass}
            value={context?.collectionPointId ?? ''}
            onChange={(event) =>
              setContext((current) => ({
                organizationId,
                deviceId: current?.deviceId ?? '',
                collectionPointId: event.target.value,
                collectionSessionId: '',
                snapshotCursor: '',
                locked: 0,
                updatedAt: new Date().toISOString(),
              }))
            }
          >
            <option value="">Choose collection point</option>
            {points.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}
              </option>
            ))}
          </select>
          <Button
            disabled={busy || !context?.deviceId || !context.collectionPointId}
            type="button"
            onClick={() => context && void openSession(context.deviceId, context.collectionPointId)}
          >
            Open session
          </Button>
          <Button
            className="bg-stone-700 hover:bg-stone-800"
            disabled={busy || !context?.collectionSessionId}
            type="button"
            onClick={() => void downloadSnapshot()}
          >
            <CloudDownload className="mr-2 inline" size={18} />
            Download
          </Button>
        </section>

        {!snapshot && context?.snapshotCursor && (
          <button
            className="mt-4 font-semibold text-emerald-800 underline"
            type="button"
            onClick={() => void loadLocalSnapshot()}
          >
            Load downloaded collection data
          </button>
        )}
        <p className="mt-4 border-l-4 border-amber-400 pl-3 text-sm text-stone-700" role="status">
          {status}
        </p>

        <div className="mt-7 grid gap-8 lg:grid-cols-[1.35fr_.65fr]">
          <section>
            <div className="flex items-center gap-2">
              <QrCode className="text-emerald-800" />
              <h2 className="text-xl font-bold">Farmer identity</h2>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                aria-label="Farmer QR or number"
                className={fieldClass}
                placeholder="Scan or enter QR, farmer number, or name"
                value={farmerSearch}
                onChange={(event) => setFarmerSearch(event.target.value)}
              />
              <Button type="button" onClick={resolveFarmer}>
                Find
              </Button>
            </div>
            {selectedFarmer && (
              <div className="mt-3 border border-emerald-700 bg-emerald-50 p-4">
                <p className="font-bold text-emerald-950">{selectedFarmer.displayName}</p>
                <p className="text-sm text-emerald-800">{selectedFarmer.farmerNumber}</p>
              </div>
            )}

            <div className="mt-8 flex items-center gap-2">
              <Scale className="text-emerald-800" />
              <h2 className="text-xl font-bold">Delivery</h2>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="font-semibold">
                Coffee form
                <select
                  className={`mt-1 ${fieldClass}`}
                  value={formId}
                  onChange={(event) => setFormId(event.target.value)}
                >
                  <option value="">Choose form</option>
                  {snapshot?.commodities
                    .flatMap((commodity) => commodity.forms)
                    .map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="font-semibold">
                Net weight (kg)
                <input
                  inputMode="decimal"
                  className={`mt-1 ${fieldClass}`}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              <label className="font-semibold">
                Price per kg (UGX)
                <input
                  inputMode="numeric"
                  className={`mt-1 ${fieldClass}`}
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(event.target.value)}
                />
              </label>
              <div className="border-l-4 border-amber-400 pl-4">
                <p className="text-sm font-semibold text-stone-600">Collection value</p>
                <p className="text-3xl font-bold text-stone-950">
                  UGX {quantity && unitPrice ? calculateAmount(quantity, unitPrice) : '0'}
                </p>
              </div>
            </div>
            {activeQualityDefinitions.length > 0 && (
              <fieldset className="mt-6 grid gap-4 border-t border-stone-300 pt-5 sm:grid-cols-2">
                <legend className="pr-3 text-lg font-bold">Quality checks</legend>
                {activeQualityDefinitions.map((definition) => (
                  <label className="font-semibold" key={definition.id}>
                    {definition.name}
                    {definition.required ? ' *' : ''}
                    {definition.unit ? ` (${definition.unit})` : ''}
                    {definition.dataType === 'ENUM' ? (
                      <select
                        className={`mt-1 ${fieldClass}`}
                        value={String(qualityValues[definition.id] ?? '')}
                        onChange={(event) =>
                          setQualityValues((current) => ({
                            ...current,
                            [definition.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Choose value</option>
                        {definition.allowedValues?.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    ) : definition.dataType === 'BOOLEAN' ? (
                      <input
                        className="ml-3 size-6 align-middle accent-emerald-700"
                        type="checkbox"
                        checked={Boolean(qualityValues[definition.id])}
                        onChange={(event) =>
                          setQualityValues((current) => ({
                            ...current,
                            [definition.id]: event.target.checked,
                          }))
                        }
                      />
                    ) : (
                      <input
                        className={`mt-1 ${fieldClass}`}
                        inputMode={definition.dataType === 'TEXT' ? 'text' : 'decimal'}
                        value={String(qualityValues[definition.id] ?? '')}
                        onChange={(event) =>
                          setQualityValues((current) => ({
                            ...current,
                            [definition.id]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="mt-6 flex min-h-14 items-center gap-3 border border-stone-300 bg-white px-4 font-semibold">
              <input
                className="size-6 accent-emerald-700"
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Farmer confirms the delivery details
            </label>
            <Button
              className="mt-4 min-h-14 w-full text-base"
              disabled={busy || !snapshot}
              type="button"
              onClick={() => void recordDelivery()}
            >
              <Send className="mr-2 inline" size={19} />
              Save delivery
            </Button>
          </section>

          <aside className="border-l-0 border-stone-300 lg:border-l lg:pl-7">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Sync queue</h2>
              <button
                aria-label="Synchronize"
                className="p-2 text-emerald-800 disabled:text-stone-400"
                disabled={!online || busy}
                title="Synchronize"
                type="button"
                onClick={() => void synchronize()}
              >
                <RefreshCw size={21} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {queue
                .slice()
                .reverse()
                .map((record) => (
                  <div className="border-b border-stone-200 py-3" key={record.key}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold">
                        {record.operation.operationType.replaceAll('_', ' ')}
                      </span>
                      <span
                        className={`text-xs font-bold ${record.state === 'SYNCED' ? 'text-emerald-700' : record.state === 'CONFLICT' ? 'text-red-700' : 'text-amber-700'}`}
                      >
                        {record.state}
                      </span>
                    </div>
                    {record.errorMessage && (
                      <p className="mt-1 flex gap-2 text-sm text-red-700">
                        <AlertTriangle className="shrink-0" size={16} />
                        {record.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
            </div>
            {queue.length === 0 && (
              <p className="mt-4 text-sm text-stone-500">No local operations.</p>
            )}
          </aside>
        </div>
      </div>
    </ProtectedPage>
  );
}
