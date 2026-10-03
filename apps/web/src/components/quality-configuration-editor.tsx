'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateQualityConfigurationSchema, type QualityDefinitionInput } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { useOrgPermission } from './ui/workflow-form';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
const keys = [
  'code',
  'name',
  'description',
  'dataType',
  'unit',
  'required',
  'minimumValue',
  'maximumValue',
  'allowedValues',
  'displayOrder',
  'status',
] as const;
const blank = (order: number): QualityDefinitionInput => ({
  code: '',
  name: '',
  description: null,
  dataType: 'DECIMAL',
  unit: null,
  required: true,
  minimumValue: null,
  maximumValue: null,
  allowedValues: null,
  displayOrder: order,
  status: 'ACTIVE',
});
export function QualityConfigurationEditor({
  organizationId,
  forms,
}: {
  organizationId: string;
  forms: { id: string; name: string }[];
}) {
  const [formId, setFormId] = useState('');
  const can = useOrgPermission(organizationId);
  const path = `/organizations/${organizationId}/commodity-forms/${formId}/quality-definitions`;
  const query = useQuery({
    queryKey: ['quality-editor', path],
    queryFn: () => apiRequest<QualityDefinitionInput[]>(path),
    enabled: Boolean(formId) && can('quality-configuration.manage'),
  });
  if (!can('quality-configuration.manage')) return null;
  return (
    <section className="mt-8 space-y-4 border-t border-border pt-6">
      <h2 className="font-display text-xl font-semibold">Cooperative quality standards</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Load a coffee form, edit its complete set of effective checks, and save the cooperative
        override. Existing delivery measurements remain unchanged.
      </p>
      <Label className="max-w-md">
        Coffee form
        <Select value={formId} onChange={(event) => setFormId(event.target.value)}>
          <option value="">Choose a coffee form…</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </Select>
      </Label>
      {query.isLoading && <LoadingIndicator label="Loading quality standard" />}
      {query.error && <ErrorState message={query.error.message} />}
      {query.data && <QualityEditor key={path} path={path} initial={query.data} />}
    </section>
  );
}
function QualityEditor({ path, initial }: { path: string; initial: QualityDefinitionInput[] }) {
  const client = useQueryClient();
  const [rows, setRows] = useState<QualityDefinitionInput[]>(() =>
    initial.length
      ? initial.map(
          (row) => Object.fromEntries(keys.map((key) => [key, row[key]])) as QualityDefinitionInput,
        )
      : [blank(0)],
  );
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (body: unknown) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['quality-definitions'] }),
  });
  const update = (index: number, patch: Partial<QualityDefinitionInput>) =>
    setRows((values) => values.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const result = updateQualityConfigurationSchema.safeParse({ definitions: rows });
        if (!result.success) {
          setError(
            result.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join(' · '),
          );
          return;
        }
        setError('');
        mutation.mutate(result.data);
      }}
    >
      {rows.map((row, index) => (
        <fieldset key={index} className="ledger-surface grid gap-4 p-4 md:grid-cols-3">
          <legend className="px-2 text-sm font-semibold">Quality check {index + 1}</legend>
          <Label>
            Attribute code
            <Input
              required
              value={row.code}
              onChange={(event) => update(index, { code: event.target.value })}
            />
          </Label>
          <Label>
            Check name
            <Input
              required
              value={row.name}
              onChange={(event) => update(index, { name: event.target.value })}
            />
          </Label>
          <Label>
            Data type
            <Select
              value={row.dataType}
              onChange={(event) =>
                update(index, {
                  dataType: event.target.value as QualityDefinitionInput['dataType'],
                  allowedValues: event.target.value === 'ENUM' ? [''] : null,
                  minimumValue: null,
                  maximumValue: null,
                })
              }
            >
              {['DECIMAL', 'INTEGER', 'TEXT', 'ENUM', 'BOOLEAN'].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </Select>
          </Label>
          <Label>
            Unit
            <Input
              value={row.unit ?? ''}
              onChange={(event) => update(index, { unit: event.target.value || null })}
            />
          </Label>
          <Label>
            Description
            <Input
              value={row.description ?? ''}
              onChange={(event) => update(index, { description: event.target.value || null })}
            />
          </Label>
          <Label>
            Status
            <Select
              value={row.status}
              onChange={(event) =>
                update(index, { status: event.target.value as QualityDefinitionInput['status'] })
              }
            >
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </Select>
          </Label>
          {['DECIMAL', 'INTEGER'].includes(row.dataType) && (
            <>
              <Label>
                Minimum value
                <Input
                  value={row.minimumValue ?? ''}
                  onChange={(event) => update(index, { minimumValue: event.target.value || null })}
                />
              </Label>
              <Label>
                Maximum value
                <Input
                  value={row.maximumValue ?? ''}
                  onChange={(event) => update(index, { maximumValue: event.target.value || null })}
                />
              </Label>
            </>
          )}
          {row.dataType === 'ENUM' && (
            <Label>
              Allowed values (comma separated)
              <Input
                required
                value={row.allowedValues?.join(', ') ?? ''}
                onChange={(event) =>
                  update(index, {
                    allowedValues: event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Label>
          )}
          <Label>
            Display order
            <Input
              type="number"
              min={0}
              max={1000}
              value={row.displayOrder}
              onChange={(event) => update(index, { displayOrder: Number(event.target.value) })}
            />
          </Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.required}
              onChange={(event) => update(index, { required: event.target.checked })}
            />
            Required at collection
          </label>
          <Button
            variant="outline"
            type="button"
            disabled={rows.length <= 1}
            onClick={() => setRows((values) => values.filter((_, i) => i !== index))}
          >
            Remove check
          </Button>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          type="button"
          disabled={rows.length >= 30}
          onClick={() => setRows((values) => [...values, blank(values.length)])}
        >
          Add quality check
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save cooperative standards'}
        </Button>
      </div>
      {(error || mutation.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || mutation.error?.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="text-sm text-primary">
          Cooperative standards saved.
        </p>
      )}
    </form>
  );
}
