'use client';
import { useQuery } from '@tanstack/react-query';
import { readinessDataSchema, versionDataSchema } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
export function SystemDiagnostics() {
  const readiness = useQuery({
    queryKey: ['system-readiness'],
    queryFn: async () => readinessDataSchema.parse(await apiRequest('/ready')),
    retry: false,
  });
  const version = useQuery({
    queryKey: ['system-version'],
    queryFn: async () => versionDataSchema.parse(await apiRequest('/version')),
    retry: false,
  });
  return (
    <section className="mt-6 space-y-5 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Service readiness</h2>
        <Button
          variant="outline"
          size="sm"
          disabled={readiness.isFetching || version.isFetching}
          onClick={() => {
            void readiness.refetch();
            void version.refetch();
          }}
        >
          Refresh diagnostics
        </Button>
      </div>
      {readiness.isLoading && <p role="status">Checking required services…</p>}
      {readiness.error && (
        <p role="alert" className="text-sm text-destructive">
          {readiness.error.message}
        </p>
      )}
      {readiness.data && (
        <>
          <Badge>{readiness.data.status === 'ready' ? 'Ready' : 'Not ready'}</Badge>
          <p className="text-sm">
            PostgreSQL: {readiness.data.dependencies.postgres.status} · Redis:{' '}
            {readiness.data.dependencies.redis.status}
          </p>
        </>
      )}
      {version.data && (
        <dl className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          {(['application', 'version', 'apiVersion', 'environment', 'buildSha'] as const).map(
            (field) => (
              <div key={field}>
                <dt className="ledger-kicker">{field.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="mt-1 break-all font-mono text-sm">{version.data[field]}</dd>
              </div>
            ),
          )}
        </dl>
      )}
      {version.error && (
        <p role="alert" className="text-sm text-destructive">
          Version unavailable: {version.error.message}
        </p>
      )}
    </section>
  );
}
