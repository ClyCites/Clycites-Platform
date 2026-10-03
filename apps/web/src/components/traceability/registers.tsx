'use client';
import { createStorageLocationSchema, receiveCustodyTransferSchema } from '@clycites/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { RecordRegister, recordText } from '@/components/ui/record-register';
import { WorkflowForm } from '@/components/ui/workflow-form';
import { TraceabilityShell } from './traceability-shell';
export function TraceabilityRegisters({ organizationId }: { organizationId: string }) {
  const root = `/organizations/${organizationId}`;
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: ['register'] });
  return (
    <TraceabilityShell organizationId={organizationId} active="Registers">
      <div className="space-y-8">
        <RecordRegister
          title="Storage locations"
          path={`${root}/storage-locations`}
          organizationId={organizationId}
          permission="storage-location.read"
          columns={[
            { key: 'code', title: 'Code' },
            { key: 'name', title: 'Storage location' },
            { key: 'description', title: 'Description' },
            { key: 'status', title: 'Status', status: true },
          ]}
        />
        <WorkflowForm
          title="Register storage location"
          path={`${root}/storage-locations`}
          schema={createStorageLocationSchema}
          permission="storage-location.manage"
          organizationId={organizationId}
          fields={[
            { name: 'code', label: 'Location code' },
            { name: 'name', label: 'Location name' },
            { name: 'description', label: 'Description', type: 'textarea', required: false },
          ]}
          onSuccess={refresh}
        />
        <RecordRegister
          title="Custody handovers"
          path={`${root}/custody-transfers`}
          organizationId={organizationId}
          permission="custody-transfer.read"
          columns={[
            { key: 'transferNumber', title: 'Transfer' },
            { key: 'lot.lotNumber', title: 'Lot' },
            { key: 'quantity', title: 'Quantity (kg)' },
            { key: 'status', title: 'Status', status: true },
            { key: 'dispatchedAt', title: 'Dispatched' },
            { key: 'receivedAt', title: 'Received' },
          ]}
          actions={(row) =>
            recordText(row, 'status') === 'DISPATCHED' &&
            recordText(row, 'toOrganizationId') === organizationId ? (
              <WorkflowForm
                title="Record custody receipt"
                path={`${root}/custody-transfers/${row.id}/receive`}
                schema={receiveCustodyTransferSchema}
                fields={[
                  {
                    name: 'accepted',
                    label: 'Receive decision',
                    type: 'select',
                    options: [
                      { value: 'true', label: 'Accept receipt' },
                      { value: 'false', label: 'Reject receipt' },
                    ],
                    transform: (value) => value === 'true',
                  },
                  { name: 'notes', label: 'Receipt notes', type: 'textarea', required: false },
                ]}
                permission="custody-transfer.receive"
                organizationId={organizationId}
                onSuccess={refresh}
                submitLabel="Record receipt decision"
              />
            ) : null
          }
        />
      </div>
    </TraceabilityShell>
  );
}
