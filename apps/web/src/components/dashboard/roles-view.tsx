'use client';

import type { CreateCustomRoleInput } from '@clycites/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryError } from '@/components/dashboard/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { EmptyState, LoadingIndicator } from '@clycites/ui';

const parsePermissions = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

export function RolesView({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissionsRaw, setPermissionsRaw] = useState('');
  const [formError, setFormError] = useState<string>();

  const roles = useQuery({
    queryKey: dashboardKeys.roles(organizationId),
    queryFn: () => dashboardApi.roles(organizationId),
  });

  const create = useMutation({
    mutationFn: (input: CreateCustomRoleInput) => dashboardApi.createRole(organizationId, input),
    onSuccess: () => {
      setName('');
      setDescription('');
      setPermissionsRaw('');
      setFormError(undefined);
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.roles(organizationId) });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Create failed'),
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const permissions = parsePermissions(permissionsRaw);
    if (permissions.length === 0) {
      setFormError('Enter at least one permission code.');
      return;
    }
    create.mutate({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      permissions,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Custom roles</h1>
        <p className="text-sm text-muted-foreground">
          Define organization-specific roles from granular permissions.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Create a role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Label>
                Name
                <Input required value={name} onChange={(event) => setName(event.target.value)} />
              </Label>
              <Label>
                Description
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Label>
            </div>
            <Label>
              Permissions
              <Textarea
                rows={3}
                placeholder="analytics.read, report.read, branding.read"
                value={permissionsRaw}
                onChange={(event) => setPermissionsRaw(event.target.value)}
              />
              <span className="text-xs font-normal text-muted-foreground">
                Separate dotted permission codes with commas, spaces, or new lines.
              </span>
            </Label>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create role'}
              </Button>
              {formError && <span className="text-sm text-red-600">{formError}</span>}
            </div>
          </CardContent>
        </Card>
      </form>

      {roles.isLoading && <LoadingIndicator label="Loading roles" />}
      {roles.error && <QueryError error={roles.error} />}
      {roles.data && roles.data.length === 0 && (
        <EmptyState title="No custom roles" description="Create a role to get started." />
      )}

      <div className="space-y-3">
        {roles.data?.map((role) => (
          <Card key={role.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{role.name}</p>
                  {role.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
                  )}
                </div>
                <Badge>{role.status === 'ACTIVE' ? 'APPROVED' : 'DRAFT'}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.permissions.map((permission) => (
                  <span
                    key={permission}
                    className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                  >
                    {permission}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
