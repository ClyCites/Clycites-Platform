'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  acceptUserInvitationSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  farmerAccountResetRedeemSchema,
  emailVerificationConfirmSchema,
} from '@clycites/contracts';
import { WorkflowForm } from './ui/workflow-form';
import { PageHeader } from './ui/page-header';
import { Button } from './ui/button';

const sections = [
  'Password recovery',
  'Accept invitation',
  'Farmer account recovery',
  'Verify email',
] as const;
export function AccountAccess() {
  const [section, setSection] = useState<(typeof sections)[number]>('Password recovery');
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <PageHeader
        eyebrow="Workspace access"
        title="Get back to your work"
        description="Recover your account or complete an invitation from your cooperative."
      />
      <nav aria-label="Account access options" className="flex flex-wrap gap-2">
        {sections.map((label) => (
          <Button
            key={label}
            variant={section === label ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSection(label)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {section === 'Password recovery' && (
        <>
          <WorkflowForm
            title="Request a password reset"
            path="/auth/password-reset/request"
            schema={passwordResetRequestSchema}
            fields={[{ name: 'email', label: 'Account email', type: 'email' }]}
            successMessage="If the account is eligible, recovery instructions will be sent."
            submitLabel="Request recovery"
          />
          <WorkflowForm
            title="Set a new password"
            path="/auth/password-reset/confirm"
            schema={passwordResetConfirmSchema}
            fields={[
              { name: 'token', label: 'Reset token', required: false },
              {
                name: 'email',
                label: 'Email (for a recovery code)',
                type: 'email',
                required: false,
              },
              { name: 'code', label: 'Six-digit recovery code', required: false },
              { name: 'password', label: 'New password', type: 'password' },
            ]}
            submitLabel="Reset password"
            successMessage="Password reset. You can now sign in."
          />
        </>
      )}
      {section === 'Accept invitation' && (
        <WorkflowForm
          title="Join your organization"
          path="/auth/invitations/accept"
          schema={acceptUserInvitationSchema}
          fields={[
            { name: 'token', label: 'Invitation token' },
            { name: 'password', label: 'Choose a password', type: 'password' },
          ]}
          submitLabel="Accept invitation"
          successMessage="Invitation accepted. You can now sign in."
        />
      )}
      {section === 'Farmer account recovery' && (
        <WorkflowForm
          title="Recover a farmer account"
          path="/auth/farmer-account-reset/redeem"
          schema={farmerAccountResetRedeemSchema}
          fields={[
            { name: 'code', label: 'Recovery code from your cooperative' },
            { name: 'password', label: 'New password', type: 'password' },
          ]}
          submitLabel="Recover account"
          successMessage="Account recovered. You can now sign in."
        />
      )}
      {section === 'Verify email' && (
        <WorkflowForm
          title="Complete email verification"
          path="/auth/email-verification/confirm"
          schema={emailVerificationConfirmSchema}
          fields={[{ name: 'token', label: 'Email verification token' }]}
          submitLabel="Verify email"
        />
      )}
      <Link href="/login" className="inline-block text-sm font-semibold text-primary underline">
        Return to sign in
      </Link>
    </div>
  );
}
