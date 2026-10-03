'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { passwordChangeSchema, emailVerificationConfirmSchema } from '@clycites/contracts';
import { useAuth } from './auth-provider';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import { WorkflowForm } from './ui/workflow-form';
import { DataTable } from './ui/data-table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { apiRequest, confirmMfaEnrollment } from '@/lib/api-client';
import { EmptyState, ErrorState, LoadingIndicator } from '@clycites/ui';
import { formatKampalaDateTime } from '@/lib/localization';

type Session = {
  id: string;
  deviceName: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
type Enrollment = { challengeToken: string; secret: string; uri: string; expiresAt: string };

export function AccountSecurity() {
  const { user, signOutAll } = useAuth();
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const current = useQuery({
    queryKey: ['account-profile'],
    queryFn: () =>
      apiRequest<{ firstName: string; lastName: string; email: string | null }>('/auth/me'),
    enabled: Boolean(user),
  });
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: () => apiRequest<Session[]>('/auth/sessions'),
    enabled: Boolean(user),
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['account-sessions'] }),
  });
  const verifyEmail = useMutation({
    mutationFn: () => apiRequest('/auth/email-verification/request', { method: 'POST' }),
  });
  const enroll = useMutation({
    mutationFn: () => apiRequest<Enrollment>('/auth/mfa/enroll', { method: 'POST' }),
  });
  const confirm = useMutation({
    mutationFn: () => confirmMfaEnrollment(enroll.data!.challengeToken, code),
    onSuccess: (result) => {
      setRecoveryCodes(result.recoveryCodes);
      enroll.reset();
      setCode('');
    },
  });
  const logoutAll = useMutation({ mutationFn: signOutAll });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Your account"
          title="Account & security"
          description="Manage your sign-in credentials, verification, and active devices."
        />
        {current.data && (
          <p className="text-sm text-muted-foreground">
            Signed in as{' '}
            <strong className="text-foreground">
              {current.data.firstName} {current.data.lastName}
            </strong>{' '}
            · {current.data.email ?? 'Phone account'}
          </p>
        )}
        {current.error && <ErrorState message={current.error.message} />}
        <div className="grid items-start gap-4 md:grid-cols-2">
          <WorkflowForm
            title="Change your password"
            path="/auth/password"
            schema={passwordChangeSchema}
            fields={[
              { name: 'currentPassword', label: 'Current password', type: 'password' },
              { name: 'newPassword', label: 'New password', type: 'password' },
            ]}
            successMessage="Password updated."
            submitLabel="Update password"
          />
          <WorkflowForm
            title="Confirm email verification"
            path="/auth/email-verification/confirm"
            schema={emailVerificationConfirmSchema}
            fields={[{ name: 'token', label: 'Verification token' }]}
            submitLabel="Verify email"
          >
            <Button
              variant="outline"
              type="button"
              disabled={verifyEmail.isPending || !current.data?.email}
              onClick={() => verifyEmail.mutate()}
            >
              Send verification email
            </Button>
            {verifyEmail.isSuccess && (
              <p role="status" className="text-sm text-primary">
                Verification email requested.
              </p>
            )}
            {verifyEmail.error && (
              <p role="alert" className="text-sm text-destructive">
                {verifyEmail.error.message}
              </p>
            )}
          </WorkflowForm>
        </div>
        {(user?.platformRole === 'PLATFORM_ADMIN' ||
          user?.organizations.some((item) => item.role === 'COOPERATIVE_ADMIN')) && (
          <section className="ledger-surface space-y-4 rounded-md p-5">
            <h2 className="font-semibold">Authenticator sign-in</h2>
            <p className="text-sm text-muted-foreground">
              Add a time-based code from your authenticator app.
            </p>
            {!enroll.data && (
              <Button variant="outline" disabled={enroll.isPending} onClick={() => enroll.mutate()}>
                Set up authenticator
              </Button>
            )}
            {enroll.data && (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  confirm.mutate();
                }}
              >
                <Label>
                  Authenticator setup key
                  <Input readOnly value={enroll.data.secret} />
                </Label>
                <Label>
                  Authenticator code
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    minLength={6}
                    required
                  />
                </Label>
                <Button disabled={confirm.isPending}>Confirm setup</Button>
              </form>
            )}
            {(enroll.error || confirm.error) && (
              <ErrorState message={(enroll.error ?? confirm.error)!.message} />
            )}
            {recoveryCodes.length > 0 && (
              <div role="status">
                <p className="mb-3 text-sm">
                  Save these recovery codes. They are shown once and can each be used once.
                </p>
                <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">
                  {recoveryCodes.map((recoveryCode) => (
                    <li key={recoveryCode}>{recoveryCode}</li>
                  ))}
                </ul>
                <Button variant="outline" className="mt-4" onClick={() => setRecoveryCodes([])}>
                  I have saved my codes
                </Button>
              </div>
            )}
          </section>
        )}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Sign-in sessions</h2>
            <Button variant="outline" onClick={() => void sessions.refetch()}>
              Refresh sessions
            </Button>
          </div>
          {sessions.isLoading && <LoadingIndicator />}
          {sessions.error && <ErrorState message={sessions.error.message} />}
          {revoke.error && <ErrorState message={revoke.error.message} />}
          {sessions.data &&
            (sessions.data.length === 0 ? (
              <EmptyState
                title="No sessions"
                description="Your sign-in sessions will appear here."
              />
            ) : (
              <DataTable
                caption="Sign-in sessions"
                rows={sessions.data}
                columns={[
                  {
                    key: 'device',
                    title: 'Device',
                    render: (session) => session.deviceName ?? 'Unnamed device',
                  },
                  {
                    key: 'last-used',
                    title: 'Last used',
                    render: (session) => formatKampalaDateTime(session.lastUsedAt),
                  },
                  {
                    key: 'expires',
                    title: 'Expires',
                    render: (session) => formatKampalaDateTime(session.expiresAt),
                  },
                  {
                    key: 'action',
                    title: 'Access',
                    render: (session) =>
                      session.revokedAt ? (
                        'Revoked'
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(session.id)}
                        >
                          Revoke session
                        </Button>
                      ),
                  },
                ]}
              />
            ))}
        </section>
        <details className="ledger-surface rounded-md p-5">
          <summary className="text-sm font-semibold">Sign out on all devices</summary>
          <p className="my-4 text-sm text-muted-foreground">
            This ends every current sign-in session, including this device.
          </p>
          <Button
            variant="destructive"
            disabled={logoutAll.isPending}
            onClick={() => logoutAll.mutate()}
          >
            Sign out everywhere
          </Button>
          {logoutAll.error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {logoutAll.error.message}
            </p>
          )}
        </details>
      </div>
    </ProtectedPage>
  );
}
