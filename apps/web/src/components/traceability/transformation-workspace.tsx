'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Plus } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiRequest } from '@/lib/api-client';
import { TraceabilityShell } from './traceability-shell';

interface Batch {
  id: string;
  batchNumber: string;
  status: string;
  commodityId: string;
  commodityFormId: string;
  availableQuantity: string;
  unit: 'KG';
}
interface Transformation {
  id: string;
  transformationNumber: string;
  type: string;
  status: string;
  inputs: Array<{ batch: { batchNumber: string }; quantity: string }>;
  outputs: Array<{ batch: { batchNumber: string }; quantity: string }>;
}

export function TransformationWorkspace({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const [type, setType] = useState<'SPLIT' | 'MERGE' | 'TRANSFORMATION'>('SPLIT');
  const [inputIds, setInputIds] = useState<string[]>([]);
  const [number, setNumber] = useState('');
  const [outputNumber, setOutputNumber] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('');
  const [message, setMessage] = useState('');
  const batches = useQuery({
    queryKey: ['batches', organizationId],
    queryFn: () => apiRequest<Batch[]>(`/organizations/${organizationId}/batches`),
  });
  const transformations = useQuery({
    queryKey: ['transformations', organizationId],
    queryFn: () =>
      apiRequest<Transformation[]>(`/organizations/${organizationId}/batch-transformations`),
  });
  const eligible =
    batches.data?.filter(
      (batch) => batch.status === 'SEALED' && Number(batch.availableQuantity) > 0,
    ) ?? [];
  const create = async () => {
    const selected = eligible.filter((batch) => inputIds.includes(batch.id));
    if (selected.length === 0) return;
    try {
      await apiRequest(`/organizations/${organizationId}/batch-transformations`, {
        method: 'POST',
        body: JSON.stringify({
          transformationNumber: number,
          type,
          inputs: selected.map((batch) => ({
            batchId: batch.id,
            quantity: batch.availableQuantity,
            unit: 'KG',
          })),
          outputs: [
            {
              batchNumber: outputNumber,
              commodityId: selected[0]!.commodityId,
              commodityFormId: selected[0]!.commodityFormId,
              quantity: outputQuantity,
              unit: 'KG',
            },
          ],
        }),
      });
      setMessage('Transformation completed.');
      setInputIds([]);
      setNumber('');
      setOutputNumber('');
      setOutputQuantity('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['transformations', organizationId] }),
        client.invalidateQueries({ queryKey: ['batches', organizationId] }),
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to transform batches.');
    }
  };
  return (
    <TraceabilityShell organizationId={organizationId} active="Transformations">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section>
          <h2 className="text-xl font-bold">Transformation history</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-y border-stone-300 bg-stone-100">
                <tr>
                  <th className="p-3">Reference</th>
                  <th>Type</th>
                  <th>Inputs</th>
                  <th>Outputs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transformations.data?.map((item) => (
                  <tr key={item.id} className="border-b border-stone-200">
                    <td className="p-3 font-bold">{item.transformationNumber}</td>
                    <td>{item.type}</td>
                    <td>{item.inputs.map((input) => input.batch.batchNumber).join(', ')}</td>
                    <td>{item.outputs.map((output) => output.batch.batchNumber).join(', ')}</td>
                    <td>
                      <Badge>{item.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <Card className="h-fit">
          <CardHeader>
            <h2 className="flex items-center gap-2 font-bold">
              <GitMerge size={18} /> Record transformation
            </h2>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Label>
              Reference
              <Input value={number} onChange={(event) => setNumber(event.target.value)} />
            </Label>
            <Label>
              Operation
              <Select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as typeof type);
                  setInputIds([]);
                }}
              >
                <option>SPLIT</option>
                <option>MERGE</option>
                <option>TRANSFORMATION</option>
              </Select>
            </Label>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-bold">Input batches</legend>
              {eligible.map((batch) => (
                <label key={batch.id} className="flex items-center gap-2 text-sm">
                  <input
                    type={type === 'SPLIT' ? 'radio' : 'checkbox'}
                    name="inputs"
                    checked={inputIds.includes(batch.id)}
                    onChange={(event) =>
                      setInputIds(
                        type === 'SPLIT'
                          ? [batch.id]
                          : event.target.checked
                            ? [...inputIds, batch.id]
                            : inputIds.filter((id) => id !== batch.id),
                      )
                    }
                  />{' '}
                  {batch.batchNumber} · {batch.availableQuantity} kg
                </label>
              ))}
            </fieldset>
            <Label>
              Output batch
              <Input
                value={outputNumber}
                onChange={(event) => setOutputNumber(event.target.value)}
              />
            </Label>
            <Label>
              Output quantity (kg)
              <Input
                inputMode="decimal"
                value={outputQuantity}
                onChange={(event) => setOutputQuantity(event.target.value)}
              />
            </Label>
            <Button
              disabled={
                !number ||
                !outputNumber ||
                !outputQuantity ||
                inputIds.length === 0 ||
                (type === 'MERGE' && inputIds.length < 2)
              }
              onClick={() => void create()}
            >
              <Plus size={17} /> Complete
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
