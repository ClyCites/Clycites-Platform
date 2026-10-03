'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { AnalyticsFilter } from '@clycites/contracts';
import { upsertSavedViewSchema, analyticsFilterSchema, type SavedView } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { WorkflowForm, choices, useOrgPermission } from '@/components/ui/workflow-form';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@clycites/ui';

export function SavedViews({
  organizationId,
  filter,
  onApply,
}: {
  organizationId: string;
  filter: AnalyticsFilter;
  onApply: (filter: AnalyticsFilter) => void;
}) {
  const can = useOrgPermission(organizationId);
  const client = useQueryClient();
  const base = `/organizations/${organizationId}/saved-views`;
  const views = useQuery({
    queryKey: ['saved-views', organizationId],
    queryFn: () => apiRequest<SavedView[]>(base),
    enabled: can('saved-view.read'),
  });
  const remove = useMutation({
    mutationFn: (viewId: string) => apiRequest(`${base}/${viewId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['saved-views', organizationId] }),
  });
  if (!can('saved-view.read') && !can('saved-view.manage')) return null;
  return (
    <details className="border-y border-border py-3">
      <summary className="text-sm font-semibold">Saved reporting views</summary>
      <div className="mt-4 space-y-4">
        {views.error && <ErrorState message={views.error.message} />}{' '}
        {remove.error && <ErrorState message={remove.error.message} />}{' '}
        {views.data?.map((view) => {
          const configuration = analyticsFilterSchema.safeParse(view.configuration);
          return (
            <div
              key={view.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3"
            >
              <div>
                <p className="text-sm font-medium">{view.name}</p>
                <p className="ledger-kicker mt-1">
                  {view.scope.toLowerCase()}
                  {view.isDefault ? ' · default' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!configuration.success}
                  onClick={() => {
                    if (configuration.success) onApply(configuration.data);
                  }}
                >
                  Apply view
                </Button>
                {can('saved-view.manage') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(view.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <WorkflowForm
          title="Save current filters"
          path={base}
          method="PUT"
          schema={upsertSavedViewSchema}
          values={{ configuration: filter }}
          fields={[
            { name: 'name', label: 'View name' },
            {
              name: 'scope',
              label: 'Visibility',
              type: 'select',
              defaultValue: 'PRIVATE',
              options: choices(['PRIVATE', 'ORGANIZATION']),
            },
            { name: 'isDefault', label: 'Make this my default view', type: 'checkbox' },
          ]}
          organizationId={organizationId}
          permission="saved-view.manage"
          onSuccess={() => {
            void client.invalidateQueries({ queryKey: ['saved-views', organizationId] });
          }}
          submitLabel="Save view"
        />
      </div>
    </details>
  );
}
