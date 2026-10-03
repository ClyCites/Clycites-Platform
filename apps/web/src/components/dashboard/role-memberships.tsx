'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import {
  assignCustomRoleSchema,
  type EffectivePermissions,
  type CustomRole,
} from '@clycites/contracts';
import { useOrgPermission, WorkflowForm } from '@/components/ui/workflow-form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiRequest } from '@/lib/api-client';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
import type { OrganizationMembership } from '@/lib/domain-types';

export function RoleMemberships({
  organizationId,
  roles,
}: {
  organizationId: string;
  roles: CustomRole[];
}) {
  const client = useQueryClient();
  const can = useOrgPermission(organizationId);
  const [membershipId, setMembershipId] = useState('');
  const base = `/organizations/${organizationId}`;
  const members = useQuery({
    queryKey: ['role-members', organizationId],
    queryFn: () => apiRequest<OrganizationMembership[]>(`${base}/members`),
    enabled: can('organization.members.read'),
  });
  const effective = useQuery({
    queryKey: ['effective-permissions', organizationId, membershipId],
    queryFn: () =>
      apiRequest<EffectivePermissions>(`${base}/memberships/${membershipId}/effective-permissions`),
    enabled: Boolean(membershipId) && can('custom-role.read'),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['effective-permissions', organizationId] });
  };
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <h2 className="font-display text-xl font-semibold">Member access</h2>
      {members.error && <ErrorState message={members.error.message} />}
      <Label className="max-w-md">
        Organization member
        <Select value={membershipId} onChange={(event) => setMembershipId(event.target.value)}>
          <option value="">Choose a member…</option>
          {members.data?.map((member) => (
            <option key={member.id} value={member.id}>
              {member.user.firstName} {member.user.lastName} · {member.role}
            </option>
          ))}
        </Select>
      </Label>
      {membershipId && (
        <>
          <WorkflowForm
            title="Assign a custom role"
            path={`${base}/role-assignments`}
            schema={assignCustomRoleSchema}
            values={{ membershipId }}
            fields={[
              {
                name: 'customRoleId',
                label: 'Role',
                type: 'select',
                options: roles
                  .filter((role) => role.status === 'ACTIVE')
                  .map((role) => ({ value: role.id, label: role.name })),
              },
            ]}
            organizationId={organizationId}
            permission="custom-role.manage"
            onSuccess={refresh}
            submitLabel="Assign role"
          />
          {effective.isLoading && <LoadingIndicator />}
          {effective.error && <ErrorState message={effective.error.message} />}{' '}
          {effective.data && (
            <div className="ledger-surface space-y-4 rounded-md p-5">
              <p className="text-sm">
                Base role: <strong>{effective.data.baseRole.replaceAll('_', ' ')}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                {effective.data.permissions.map((permission) => (
                  <span
                    key={permission}
                    className="rounded-sm bg-muted px-2 py-1 font-mono text-xs"
                  >
                    {permission}
                  </span>
                ))}
              </div>
              {effective.data.customRoleIds.map((roleId) => (
                <WorkflowForm
                  key={roleId}
                  title={`Remove ${roles.find((role) => role.id === roleId)?.name ?? 'custom role'}`}
                  path={`${base}/memberships/${membershipId}/roles/${roleId}`}
                  method="DELETE"
                  schema={z.object({}).strict()}
                  fields={[]}
                  organizationId={organizationId}
                  permission="custom-role.manage"
                  submitLabel="Remove role"
                  onSuccess={refresh}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
