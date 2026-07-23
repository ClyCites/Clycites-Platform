'use client';

import { ErrorState } from '@clycites/ui';

import { ApiRequestError } from '@/lib/api-client';

export function QueryError({ error }: { error: unknown }) {
  if (error instanceof ApiRequestError && error.status === 403) {
    return (
      <ErrorState
        title="Access denied"
        message="You do not have permission to view this section for the selected organization."
      />
    );
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return <ErrorState message={message} />;
}
