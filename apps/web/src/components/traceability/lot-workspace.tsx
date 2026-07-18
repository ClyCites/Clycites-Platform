'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import { TraceabilityShell } from './traceability-shell';

interface Batch {
  id: string;
  batchNumber: string;
  status: string;
  commodityId: string;
  commodityFormId: string;
  commodityForm: string;
  availableQuantity: string;
}
interface Lot {
  id: string;
  lotNumber: string;
  status: string;
  commodityForm: string;
  quantity: string;
  unit: string;
  publication: { status: string } | null;
}
export function LotWorkspace({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const [lotNumber, setLotNumber] = useState('');
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const batches = useQuery({
    queryKey: ['batches', organizationId],
    queryFn: () => apiRequest<Batch[]>(`/organizations/${organizationId}/batches`),
  });
  const lots = useQuery({
    queryKey: ['lots', organizationId],
    queryFn: () => apiRequest<Lot[]>(`/organizations/${organizationId}/lots`),
  });
  const eligible =
    batches.data?.filter(
      (batch) => batch.status === 'SEALED' && Number(batch.availableQuantity) > 0,
    ) ?? [];
  const create = async () => {
    const selected = eligible.filter((batch) => batchIds.includes(batch.id));
    if (!selected[0]) return;
    try {
      await apiRequest(`/organizations/${organizationId}/lots`, {
        method: 'POST',
        body: JSON.stringify({
          lotNumber,
          commodityId: selected[0].commodityId,
          commodityFormId: selected[0].commodityFormId,
          contributions: selected.map((batch) => ({
            batchId: batch.id,
            quantity: batch.availableQuantity,
          })),
        }),
      });
      setLotNumber('');
      setBatchIds([]);
      setMessage('Lot created.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['lots', organizationId] }),
        client.invalidateQueries({ queryKey: ['batches', organizationId] }),
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create lot.');
    }
  };
  return (
    <TraceabilityShell organizationId={organizationId} active="Cooperative lots">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section>
          <h2 className="text-xl font-bold">Cooperative lots</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {lots.data?.map((lot) => (
              <Link
                key={lot.id}
                href={`/organizations/${organizationId}/traceability/lots/${lot.id}`}
              >
                <Card className="h-full transition hover:border-emerald-700">
                  <CardContent>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-emerald-900 underline">{lot.lotNumber}</h3>
                        <p className="mt-1 text-sm text-stone-600">{lot.commodityForm}</p>
                      </div>
                      <Badge>{lot.status}</Badge>
                    </div>
                    <p className="mt-5 text-2xl font-bold">{lot.quantity} kg</p>
                    {lot.publication && (
                      <p className="mt-2 text-xs font-bold text-emerald-800">
                        {lot.publication.status}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
        <Card className="h-fit">
          <CardHeader>
            <h2 className="flex items-center gap-2 font-bold">
              <PackagePlus size={18} /> Form cooperative lot
            </h2>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Label>
              Lot number
              <Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
            </Label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-bold">Sealed batches</legend>
              {eligible.map((batch) => (
                <label key={batch.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={batchIds.includes(batch.id)}
                    onChange={(event) =>
                      setBatchIds(
                        event.target.checked
                          ? [...batchIds, batch.id]
                          : batchIds.filter((id) => id !== batch.id),
                      )
                    }
                  />{' '}
                  {batch.batchNumber} · {batch.availableQuantity} kg
                </label>
              ))}
            </fieldset>
            <Button disabled={!lotNumber || batchIds.length === 0} onClick={() => void create()}>
              <PackagePlus size={17} /> Create lot
            </Button>
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </TraceabilityShell>
  );
}
