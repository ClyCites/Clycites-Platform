'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Check as SealCheck, Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiRequest } from '@/lib/api-client';
import { TraceabilityShell } from './traceability-shell';

interface AvailableDelivery {
  id: string;
  deliveryNumber: string;
  farmerName: string;
  commodity: string;
  commodityForm: string;
  commodityId: string;
  commodityFormId: string;
  availableQuantity: string;
  unit: 'KG';
}
interface Batch {
  id: string;
  batchNumber: string;
  status: string;
  commodity: string;
  commodityForm: string;
  totalQuantity: string;
  allocatedQuantity: string;
  availableQuantity: string;
  unit: string;
  contributions: Array<{ id: string }>;
}

export function BatchWorkspace({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const [deliveryId, setDeliveryId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const batches = useQuery({
    queryKey: ['batches', organizationId],
    queryFn: () => apiRequest<Batch[]>(`/organizations/${organizationId}/batches`),
  });
  const deliveries = useQuery({
    queryKey: ['batch-deliveries', organizationId],
    queryFn: () =>
      apiRequest<AvailableDelivery[]>(
        `/organizations/${organizationId}/batches/available-deliveries`,
      ),
  });
  const selected = deliveries.data?.find((delivery) => delivery.id === deliveryId);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['batches', organizationId] }),
      client.invalidateQueries({ queryKey: ['batch-deliveries', organizationId] }),
    ]);
  };
  const create = async () => {
    if (!selected) return;
    try {
      const batch = await apiRequest<Batch>(`/organizations/${organizationId}/batches`, {
        method: 'POST',
        body: JSON.stringify({
          batchNumber,
          commodityId: selected.commodityId,
          commodityFormId: selected.commodityFormId,
        }),
      });
      await apiRequest(`/organizations/${organizationId}/batches/${batch.id}/contributions`, {
        method: 'POST',
        body: JSON.stringify({ deliveryId, quantity, unit: 'KG' }),
      });
      setBatchNumber('');
      setQuantity('');
      setDeliveryId('');
      setMessage('Batch created.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create batch.');
    }
  };
  const seal = async (batchId: string) => {
    try {
      await apiRequest(`/organizations/${organizationId}/batches/${batchId}/seal`, {
        method: 'POST',
      });
      setMessage('Batch sealed.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to seal batch.');
    }
  };
  return (
    <TraceabilityShell organizationId={organizationId} active="Batches">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Produce batches</h2>
            <span className="text-sm text-stone-500">{batches.data?.length ?? 0} records</span>
          </div>
          <div className="mt-4 grid gap-3">
            {batches.data?.map((batch) => (
              <Card key={batch.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold">{batch.batchNumber}</h3>
                      <Badge>{batch.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-stone-600">
                      {batch.commodityForm} · {batch.contributions.length} contributions
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-bold">{batch.availableQuantity} kg</p>
                      <p className="text-xs text-stone-500">of {batch.totalQuantity} available</p>
                    </div>
                    {batch.status === 'OPEN' && (
                      <IconButton
                        title="Seal batch"
                        aria-label={`Seal ${batch.batchNumber}`}
                        onClick={() => void seal(batch.id)}
                      >
                        <SealCheck size={18} />
                      </IconButton>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!batches.isLoading && batches.data?.length === 0 && (
              <div className="border-y border-stone-300 py-12 text-center">
                <Archive className="mx-auto text-stone-400" />
                <p className="mt-3 font-bold">No produce batches</p>
              </div>
            )}
          </div>
        </section>
        <Card className="h-fit">
          <CardHeader>
            <h2 className="flex items-center gap-2 font-bold">
              <Plus size={18} /> New aggregation batch
            </h2>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Label>
              Batch number
              <Input value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} />
            </Label>
            <Label>
              Accepted delivery
              <Select
                value={deliveryId}
                onChange={(event) => {
                  setDeliveryId(event.target.value);
                  const delivery = deliveries.data?.find((item) => item.id === event.target.value);
                  setQuantity(delivery?.availableQuantity ?? '');
                }}
              >
                <option value="">Select delivery</option>
                {deliveries.data
                  ?.filter((delivery) => Number(delivery.availableQuantity) > 0)
                  .map((delivery) => (
                    <option key={delivery.id} value={delivery.id}>
                      {delivery.deliveryNumber} · {delivery.farmerName} ·{' '}
                      {delivery.availableQuantity} kg
                    </option>
                  ))}
              </Select>
            </Label>
            <Label>
              Contribution (kg)
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Label>
            <Button disabled={!batchNumber || !selected || !quantity} onClick={() => void create()}>
              <Plus size={17} /> Create batch
            </Button>
            {message && (
              <p role="status" className="text-sm text-stone-700">
                {message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TraceabilityShell>
  );
}
