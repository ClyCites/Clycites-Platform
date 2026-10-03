'use client';
import { useQuery } from '@tanstack/react-query';
import { publicAnchorStatusSchema, type PublicAnchorStatus } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { PageHeader } from './ui/page-header';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
export function PublicAnchor({ transactionReference }: { transactionReference: string }) {
  const query = useQuery({
    queryKey: ['public-anchor', transactionReference],
    queryFn: async () =>
      publicAnchorStatusSchema.parse(
        await apiRequest<PublicAnchorStatus>(
          `/public/verify/anchors/${encodeURIComponent(transactionReference)}`,
        ),
      ),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-10">
      <PageHeader
        eyebrow="Public ledger evidence"
        title="Verify transaction anchor"
        description="Resolve a Hedera transaction to its current or superseding ClyCites record."
      />
      <p className="break-all font-mono text-sm">{transactionReference}</p>
      {query.isLoading && <LoadingIndicator label="Resolving anchor evidence" />}
      {query.error && (
        <>
          <ErrorState message={query.error.message} />
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry verification
          </Button>
        </>
      )}
      {query.data && (
        <>
          <Badge>{query.data.status}</Badge>
          <p>{query.data.explanation}</p>
          <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-2">
            {(
              [
                'provider',
                'network',
                'topicId',
                'topicSequenceNumber',
                'consensusTimestamp',
                'payloadHash',
              ] as const
            ).map((field) => (
              <div key={field}>
                <dt className="ledger-kicker">{field.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="mt-2 break-all font-mono text-sm">
                  {query.data[field] ?? 'Not available'}
                </dd>
              </div>
            ))}
          </dl>
          {query.data.mirrorNodeUrl && (
            <a
              href={query.data.mirrorNodeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline"
            >
              Inspect mirror node evidence
            </a>
          )}
          <p className="text-sm text-muted-foreground">{query.data.limitation}</p>
          {query.data.supersededBy && (
            <p className="text-sm">
              Superseded by transaction:{' '}
              <span className="break-all font-mono">
                {query.data.supersededBy.transactionReference ?? 'Not confirmed'}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
