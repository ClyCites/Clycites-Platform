'use client';
import { useState } from 'react';
import { issueUserInvitationSchema } from '@clycites/contracts';
import { z } from 'zod';
import { WorkflowForm, choices } from './ui/workflow-form';
import { recordText, type RegisterRow } from './ui/record-register';

export function MemberInvitations({ organizationId }: { organizationId: string }) {
  const [invitation, setInvitation] = useState<RegisterRow>();
  const path = `/organizations/${organizationId}/members/invitations`;
  return (
    <section className="mb-6 space-y-3">
      <WorkflowForm
        title="Invite a cooperative colleague"
        path={path}
        schema={issueUserInvitationSchema}
        permission="organization.members.invite"
        organizationId={organizationId}
        fields={[
          { name: 'email', label: 'Email address', type: 'email' },
          { name: 'firstName', label: 'First name' },
          { name: 'lastName', label: 'Last name' },
          {
            name: 'role',
            label: 'Organization role',
            type: 'select',
            options: choices([
              'COOPERATIVE_ADMIN',
              'COLLECTION_AGENT',
              'FINANCE_OFFICER',
              'QUALITY_INSPECTOR',
              'BUYER',
              'VIEWER',
            ]),
          },
          {
            name: 'accountClass',
            label: 'Account class',
            type: 'select',
            options: choices(['STAFF', 'FARMER']),
          },
        ]}
        submitLabel="Send invitation"
        successMessage="Invitation delivery queued."
        onSuccess={(data) => {
          if (data && typeof data === 'object' && 'id' in data) setInvitation(data as RegisterRow);
        }}
      />
      {invitation && (
        <div className="ledger-surface space-y-2 p-4">
          <p className="text-sm">
            Invitation {invitation.id} · expires {recordText(invitation, 'expiresAt')}
          </p>
          <WorkflowForm
            title="Resend this invitation"
            path={`${path}/${invitation.id}/reinvite`}
            schema={z.object({}).strict()}
            fields={[]}
            permission="organization.members.invite"
            organizationId={organizationId}
            submitLabel="Queue replacement invitation"
            successMessage="Replacement invitation queued."
          />
        </div>
      )}
    </section>
  );
}
