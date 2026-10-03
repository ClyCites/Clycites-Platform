'use client';
import { useState } from 'react';
import { z } from 'zod';
import { WorkflowForm } from './ui/workflow-form';
import { Button } from './ui/button';
import { recordText, type RegisterRow } from './ui/record-register';
export function FarmerAccount({
  organizationId,
  farmerId,
}: {
  organizationId: string;
  farmerId: string;
}) {
  const [credential, setCredential] = useState<RegisterRow>();
  const path = `/organizations/${organizationId}/farmers/${farmerId}`;
  const receive = (data: unknown) => {
    if (data && typeof data === 'object' && 'id' in data) setCredential(data as RegisterRow);
  };
  return (
    <section className="mt-6 space-y-3 print:hidden">
      <h2 className="font-display text-lg font-semibold">Farmer account access</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <WorkflowForm
          title="Issue farmer account activation"
          path={`${path}/account`}
          schema={z.object({}).strict()}
          fields={[]}
          permission="organization.members.invite"
          organizationId={organizationId}
          onSuccess={receive}
          submitLabel="Create activation credential"
        />
        <WorkflowForm
          title="Reset farmer account credentials"
          path={`${path}/account-reset`}
          schema={z.object({}).strict()}
          fields={[]}
          permission="farmer.account.reset"
          organizationId={organizationId}
          onSuccess={receive}
          submitLabel="Issue recovery credential"
        />
      </div>
      {credential && (
        <div role="status" className="ledger-surface space-y-3 p-4">
          <p className="text-sm">
            Give this one-time credential directly to the farmer. It is shown only in this session.
          </p>
          <p className="break-all font-mono text-lg">
            {recordText(credential, 'activationCode') === '—'
              ? recordText(credential, 'resetCode')
              : recordText(credential, 'activationCode')}
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {recordText(credential, 'expiresAt')}
          </p>
          <Button variant="outline" size="sm" onClick={() => setCredential(undefined)}>
            Dismiss credential
          </Button>
        </div>
      )}
    </section>
  );
}
