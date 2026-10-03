'use client';

import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createUserSchema, updateUserStatusSchema } from '@clycites/contracts';
import { useAuth } from './auth-provider';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import { RecordRegister, recordText, type RegisterRow } from './ui/record-register';
import { WorkflowForm, choices } from './ui/workflow-form';
import { Button } from './ui/button';
import { apiRequest } from '@/lib/api-client';
import { ErrorState } from '@clycites/ui';

export function UsersAdmin() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const detail = useQuery({
    queryKey: ['staff-user', selected],
    queryFn: () => apiRequest<RegisterRow>(`/admin/users/${selected}`),
    enabled: Boolean(selected) && user?.platformRole === 'PLATFORM_ADMIN',
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['register', '/admin/users'] });
    void client.invalidateQueries({ queryKey: ['staff-user'] });
  };
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-[1600px] space-y-7 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Platform access"
          title="Staff directory"
          description="Provision staff accounts and maintain their platform access."
        />
        {user?.platformRole !== 'PLATFORM_ADMIN' ? (
          <p>Your account does not include platform administration.</p>
        ) : (
          <>
            <RecordRegister
              title="Staff accounts"
              path="/admin/users"
              columns={[
                { key: 'firstName', title: 'First name' },
                { key: 'lastName', title: 'Last name' },
                { key: 'email', title: 'Email' },
                { key: 'platformRole', title: 'Platform role' },
                { key: 'status', title: 'Status', status: true },
              ]}
              actions={(row) => (
                <Button variant="outline" size="sm" onClick={() => setSelected(row.id)}>
                  Manage account
                </Button>
              )}
            />
            <WorkflowForm
              title="Create a staff account"
              path="/admin/users"
              schema={createUserSchema}
              fields={[
                { name: 'firstName', label: 'First name' },
                { name: 'lastName', label: 'Last name' },
                { name: 'email', label: 'Email', type: 'email' },
                { name: 'phone', label: 'Phone', required: false },
                {
                  name: 'password',
                  label: 'Initial password',
                  type: 'password',
                  description: 'At least 12 characters.',
                },
                {
                  name: 'platformRole',
                  label: 'Platform access',
                  type: 'select',
                  required: false,
                  options: [{ value: 'PLATFORM_ADMIN', label: 'Platform administrator' }],
                },
              ]}
              onSuccess={refresh}
              submitLabel="Create account"
            />
            {detail.error && <ErrorState message={detail.error.message} />}{' '}
            {detail.data && (
              <WorkflowForm
                key={selected}
                title={`Update access · ${recordText(detail.data, 'firstName')} ${recordText(detail.data, 'lastName')}`}
                path={`/admin/users/${selected}/status`}
                method="PATCH"
                schema={updateUserStatusSchema}
                fields={[
                  {
                    name: 'status',
                    label: 'Account status',
                    type: 'select',
                    defaultValue: recordText(detail.data, 'status'),
                    options: choices(['ACTIVE', 'SUSPENDED', 'DISABLED']),
                  },
                ]}
                onSuccess={refresh}
                submitLabel="Update access"
              />
            )}
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
