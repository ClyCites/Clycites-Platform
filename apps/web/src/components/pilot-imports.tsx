'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPilotFarmerImportSchema,
  confirmPilotFarmerImportSchema,
  confirmPilotFarmerImportUploadSchema,
} from '@clycites/contracts';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { RecordRegister, recordText, recordValue, type RegisterRow } from './ui/record-register';
import { WorkflowForm, useOrgPermission } from './ui/workflow-form';
import { DataTable } from './ui/data-table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { ErrorState, LoadingIndicator } from '@clycites/ui';

type ImportDetail = RegisterRow & { rows: RegisterRow[] };
type UploadTicket = {
  import: ImportDetail;
  upload: { method: 'PUT'; url: string; requiredHeaders: Record<string, string> };
};
const messages = (value: unknown): string =>
  Array.isArray(value)
    ? (value as unknown[])
        .map((item) =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && 'message' in item
              ? String(item.message)
              : 'Review required',
        )
        .join(' · ')
    : '—';
export function PilotImports({
  pilotId,
  organizationId,
  readOnly,
}: {
  pilotId: string;
  organizationId: string;
  readOnly: boolean;
}) {
  const can = useOrgPermission(organizationId);
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [file, setFile] = useState<File>();
  const [stage, setStage] = useState('');
  const [ticket, setTicket] = useState<{ id: string; checksum: string }>();
  const base = `/pilots/${pilotId}/farmer-imports`;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['register', base] });
    void client.invalidateQueries({ queryKey: ['pilot-import', pilotId, selected] });
  };
  const detail = useQuery({
    queryKey: ['pilot-import', pilotId, selected],
    queryFn: () => apiRequest<ImportDetail>(`${base}/${selected}`),
    enabled: Boolean(selected) && can('pilot-import.read'),
    refetchInterval: (query) =>
      ['VALIDATING'].includes(query.state.data ? recordText(query.state.data, 'status') : '')
        ? 3000
        : false,
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Select a CSV file.');
      if (file.size > 10 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.csv'))
        throw new Error('Choose a CSV file no larger than 10 MB.');
      setStage('Checking file integrity…');
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
      const input = createPilotFarmerImportSchema.parse({
        filename: file.name,
        contentType: 'text/csv',
        sizeBytes: file.size,
        checksum,
      });
      setStage('Registering secure upload…');
      const result = await apiRequest<UploadTicket>(base, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setTicket({ id: result.import.id, checksum });
      setSelected(result.import.id);
      refresh();
      setStage('Uploading CSV…');
      const response = await fetch(result.upload.url, {
        method: result.upload.method,
        headers: result.upload.requiredHeaders,
        body: file,
      });
      if (!response.ok)
        throw new Error(
          `CSV upload failed (${response.status}). Cancel this import and try again.`,
        );
      setStage('Starting server validation…');
      await apiRequest(`${base}/${result.import.id}/validate`, {
        method: 'POST',
        body: JSON.stringify(confirmPilotFarmerImportUploadSchema.parse({ checksum })),
      });
      return result.import.id;
    },
    onSuccess: () => {
      setStage('CSV uploaded. Server validation is running.');
      setFile(undefined);
      refresh();
    },
    onError: () => setStage(''),
  });
  return (
    <div className="space-y-7">
      <div>
        <p className="ledger-kicker">Farmer onboarding</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">CSV imports</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Upload the pilot farmer register, review server validation and duplicate signals, then
          confirm the expected number of rows. The API returns at most 500 review rows per import.
        </p>
      </div>
      {!readOnly && can('pilot-import.create') && can('pilot-import.confirm-upload') && (
        <form
          className="ledger-surface space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate();
          }}
        >
          <Label>
            Farmer register CSV
            <Input
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => setFile(event.target.files?.[0])}
              disabled={upload.isPending}
            />
          </Label>
          <p className="text-xs text-muted-foreground">
            Maximum file size: 10 MB. Farmer records are created only after you review and confirm
            the import.
          </p>
          <Button type="submit" disabled={upload.isPending || !file}>
            {upload.isPending ? 'Uploading…' : 'Upload & validate CSV'}
          </Button>
          {stage && (
            <p role="status" className="text-sm">
              {stage}
            </p>
          )}
          {upload.error && (
            <p role="alert" className="text-sm text-destructive">
              {upload.error.message}
            </p>
          )}
        </form>
      )}
      <RecordRegister
        title="Pilot farmer imports"
        path={base}
        organizationId={organizationId}
        permission="pilot-import.read"
        columns={[
          { key: 'publicId', title: 'Import reference' },
          { key: 'status', title: 'Status', status: true },
          { key: 'rowCount', title: 'Rows' },
          { key: 'validRowCount', title: 'Valid' },
          { key: 'errorRowCount', title: 'Errors' },
          { key: 'createdAt', title: 'Created' },
        ]}
        actions={(row) => (
          <Button variant="outline" size="sm" onClick={() => setSelected(row.id)}>
            Review import
          </Button>
        )}
      />
      {detail.isLoading && <LoadingIndicator label="Loading import results" />}
      {detail.error && <ErrorState message={detail.error.message} />}
      {detail.data && (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-lg font-semibold">Import review</h3>
            <Badge>{recordText(detail.data, 'status')}</Badge>
            <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
              Refresh validation
            </Button>
          </div>
          <DataTable
            caption="Farmer import validation and duplicate review"
            rows={detail.data.rows}
            columns={[
              { key: 'rowNumber', title: 'CSV row', render: (row) => recordText(row, 'rowNumber') },
              {
                key: 'farmer',
                title: 'Farmer',
                render: (row) =>
                  `${recordText(row, 'normalizedData.firstName')} ${recordText(row, 'normalizedData.lastName')}`,
              },
              {
                key: 'resolution',
                title: 'Resolution',
                render: (row) => <Badge>{recordText(row, 'resolution')}</Badge>,
              },
              {
                key: 'validationErrors',
                title: 'Validation errors',
                render: (row) => messages(recordValue(row, 'validationErrors')),
              },
              {
                key: 'duplicateSignals',
                title: 'Duplicate signals',
                render: (row) => messages(recordValue(row, 'duplicateSignals')),
              },
            ]}
          />
          {!readOnly && (
            <div className="grid items-start gap-3 md:grid-cols-2">
              {recordText(detail.data, 'status') === 'VALIDATED' && (
                <WorkflowForm
                  title="Confirm reviewed farmer import"
                  path={`${base}/${selected}/confirm`}
                  schema={confirmPilotFarmerImportSchema}
                  permission="pilot-import.confirm"
                  organizationId={organizationId}
                  fields={[
                    {
                      name: 'expectedRowCount',
                      label: 'Expected farmer row count',
                      type: 'number',
                      defaultValue: recordText(detail.data, 'rowCount'),
                    },
                    {
                      name: 'acknowledgedDuplicateReview',
                      label: 'I have reviewed validation and duplicate signals',
                      type: 'checkbox',
                    },
                  ]}
                  submitLabel="Confirm farmer import"
                  successMessage="Import confirmed."
                  onSuccess={refresh}
                />
              )}
              {!['CONFIRMED', 'CANCELLED'].includes(recordText(detail.data, 'status')) && (
                <WorkflowForm
                  title="Cancel this import"
                  path={`${base}/${selected}/cancel`}
                  schema={z.object({}).strict()}
                  fields={[]}
                  organizationId={organizationId}
                  permission="pilot-import.confirm"
                  submitLabel="Cancel import"
                  onSuccess={refresh}
                />
              )}
              {ticket?.id === selected && recordText(detail.data, 'status') === 'UPLOADED' && (
                <WorkflowForm
                  title="Retry server validation after successful upload"
                  path={`${base}/${selected}/validate`}
                  schema={confirmPilotFarmerImportUploadSchema}
                  values={{ checksum: ticket.checksum }}
                  fields={[]}
                  permission="pilot-import.confirm-upload"
                  organizationId={organizationId}
                  submitLabel="Validate uploaded CSV"
                  onSuccess={refresh}
                />
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
