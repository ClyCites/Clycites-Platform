'use client';

import {
  createBatchTransformationSchema,
  supersedeBatchTransformationSchema,
  transformationLossReasonSchema,
} from '@clycites/contracts';
import { useOrgPermission } from '@/components/ui/workflow-form';
import { ErrorState } from '@clycites/ui';

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
  inputs: Array<{ batchId: string; batch: { batchNumber: string }; quantity: string }>;
  outputs: Array<{ batch: { batchNumber: string }; quantity: string }>;
}

export function TransformationWorkspace({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const can = useOrgPermission(organizationId);
  const [selectedId, setSelectedId] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [pending, setPending] = useState(false);
  const [lossQuantity, setLossQuantity] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [lossNote, setLossNote] = useState('');
  const detail = useQuery({
    queryKey: ['transformation-detail', organizationId, selectedId],
    queryFn: () =>
      apiRequest<Transformation>(
        `/organizations/${organizationId}/batch-transformations/${selectedId}`,
      ),
    enabled: Boolean(selectedId),
  });
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
  const eligible = (batches.data ?? [])
    .map((batch) => {
      const restored =
        selectedId && detail.data?.status === 'COMPLETED'
          ? detail.data.inputs
              .filter((input) => input.batchId === batch.id)
              .reduce((sum, input) => sum + Number(input.quantity), 0)
          : 0;
      return {
        ...batch,
        status: restored > 0 && batch.status === 'CONSUMED' ? 'SEALED' : batch.status,
        availableQuantity: (Number(batch.availableQuantity) + restored).toFixed(4),
      };
    })
    .filter((batch) => batch.status === 'SEALED' && Number(batch.availableQuantity) > 0);
  const create = async () => {
    const selected = eligible.filter((batch) => inputIds.includes(batch.id));
    if (!selected.length || pending) return;
    setPending(true);
    try {
      const replacement = createBatchTransformationSchema.parse({
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
        ...(lossQuantity ? { lossQuantity } : {}),
        ...(lossReason ? { lossReason } : {}),
        ...(lossNote ? { lossNote } : {}),
      });
      const correcting = selectedId && detail.data?.status === 'COMPLETED';
      const body = correcting
        ? supersedeBatchTransformationSchema.parse({ reason: correctionReason, replacement })
        : replacement;
      await apiRequest(
        correcting
          ? `/organizations/${organizationId}/batch-transformations/${selectedId}/supersede`
          : `/organizations/${organizationId}/batch-transformations`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      setMessage(
        correcting
          ? 'Correction recorded. The original ledger record remains available.'
          : 'Transformation completed.',
      );
      setInputIds([]);
      setNumber('');
      setOutputNumber('');
      setOutputQuantity('');
      setSelectedId('');
      setCorrectionReason('');
      await client.invalidateQueries({ queryKey: ['transformations', organizationId] });
      await client.invalidateQueries({ queryKey: ['batches', organizationId] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record transformation.');
    } finally {
      setPending(false);
    }
  };
  return (
    <TraceabilityShell organizationId={organizationId} active="Transformations">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section>
          <h2 className="text-xl font-bold">Transformation history</h2>
          {transformations.error && <ErrorState message={transformations.error.message} />}
          {detail.error && <ErrorState message={detail.error.message} />}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-y border-border bg-muted">
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
                  <tr key={item.id} className="border-b border-border">
                    <td className="p-3">
                      <Button
                        variant="link"
                        onClick={() => {
                          setSelectedId(item.id);
                          setInputIds([]);
                        }}
                      >
                        {item.transformationNumber}
                      </Button>
                    </td>
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
        {can('batch.transform') && (
          <Card className="h-fit">
            <CardHeader>
              <h2 className="flex items-center gap-2 font-bold">
                <GitMerge size={18} />{' '}
                {selectedId ? 'Correct transformation' : 'Record transformation'}
              </h2>
            </CardHeader>
            <CardContent className="grid gap-4">
              {selectedId && (
                <>
                  <p className="text-sm">
                    Original: {detail.data?.transformationNumber ?? 'Loading…'} ·{' '}
                    {detail.data?.status}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedId('');
                      setInputIds([]);
                    }}
                  >
                    Create a new transformation instead
                  </Button>
                  <Label>
                    Reason for correction
                    <Input
                      value={correctionReason}
                      onChange={(event) => setCorrectionReason(event.target.value)}
                    />
                  </Label>
                </>
              )}

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
              <Label>
                Declared loss (kg)
                <Input
                  value={lossQuantity}
                  onChange={(event) => setLossQuantity(event.target.value)}
                />
              </Label>
              <Label>
                Loss reason
                <Select value={lossReason} onChange={(event) => setLossReason(event.target.value)}>
                  <option value="">No loss</option>
                  {transformationLossReasonSchema.options.map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </Select>
              </Label>
              <Label>
                Loss notes
                <Input value={lossNote} onChange={(event) => setLossNote(event.target.value)} />
              </Label>
              <Button
                disabled={
                  pending ||
                  (Boolean(selectedId) &&
                    (detail.data?.status !== 'COMPLETED' || !correctionReason)) ||
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
        )}
      </div>
    </TraceabilityShell>
  );
}
