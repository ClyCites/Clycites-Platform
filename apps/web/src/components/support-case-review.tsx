'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { updateSupportCaseSchema } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { WorkflowForm, choices, useOrgPermission } from './ui/workflow-form';
import { recordText, type RegisterRow } from './ui/record-register';
import { Button } from './ui/button';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
export function SupportCaseReview({
  organizationId,
  caseId,
}: {
  organizationId: string;
  caseId: string;
}) {
  const [open, setOpen] = useState(false);
  const can = useOrgPermission(organizationId);
  const path = `/organizations/${organizationId}/support-cases/${caseId}`;
  const query = useQuery({
    queryKey: ['support-case-detail', path],
    queryFn: () => apiRequest<RegisterRow>(path),
    enabled: open && can('support-case.read'),
  });
  return (
    <div className="mt-4 space-y-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? 'Close detail' : 'Review & assign case'}
      </Button>
      {open && (
        <>
          {query.isLoading && <LoadingIndicator label="Loading support case" />}
          {query.error && <ErrorState message={query.error.message} />}
          {query.data && (
            <>
              <p className="text-sm">{recordText(query.data, 'description')}</p>
              <WorkflowForm
                title="Assign or update case"
                method="PATCH"
                path={path}
                schema={updateSupportCaseSchema}
                fields={[
                  {
                    name: 'status',
                    label: 'Case status',
                    type: 'select',
                    options: choices([
                      'TRIAGED',
                      'IN_PROGRESS',
                      'WAITING_FOR_PARTICIPANT',
                      'WAITING_FOR_PROVIDER',
                    ]),
                  },
                  { name: 'assignedToUserId', label: 'Assigned operator user ID', required: false },
                ]}
                permission="support-case.assign"
                organizationId={organizationId}
                onSuccess={() => void query.refetch()}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
