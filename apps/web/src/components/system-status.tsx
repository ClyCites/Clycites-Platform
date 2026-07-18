'use client';

import { ErrorState, LoadingIndicator, StatusBadge } from '@clycites/ui';
import { useQuery } from '@tanstack/react-query';

import { ApiUnavailableError, getApiHealth } from '@/lib/api-client';

export function SystemStatus() {
  const query = useQuery({ queryKey: ['api-health'], queryFn: getApiHealth });

  if (query.isPending) return <LoadingIndicator label="Checking API availability" />;
  if (query.error instanceof ApiUnavailableError) {
    return (
      <ErrorState
        title="API unavailable"
        message="The platform API is not responding. Try again shortly."
      />
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Request error"
        message="The API response could not be validated. Check the web environment configuration."
      />
    );
  }
  return (
    <div className="flex items-center justify-between gap-4" role="status">
      <div>
        <h2 className="font-bold text-stone-900">REST API</h2>
        <p className="mt-1 text-stone-600">Health endpoint responded successfully.</p>
      </div>
      <StatusBadge tone="positive">API online</StatusBadge>
    </div>
  );
}
