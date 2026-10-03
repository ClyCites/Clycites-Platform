'use client';
import { useQuery } from '@tanstack/react-query';
import { publicBrandingSchema } from '@clycites/contracts';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
export function PublicCooperative({ slug }: { slug: string }) {
  const query = useQuery({
    queryKey: ['public-branding', slug],
    queryFn: async () =>
      publicBrandingSchema.parse(
        await apiRequest(`/public/organizations/${encodeURIComponent(slug)}/branding`),
      ),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-14">
      {query.isLoading && <LoadingIndicator label="Loading cooperative identity" />}
      {query.error && <ErrorState message={query.error.message} />}
      {query.data && (
        <>
          <p className="ledger-kicker">Cooperative field ledger</p>
          <h1 className="font-display text-4xl font-semibold">{query.data.displayName}</h1>
          {query.data.shortName && (
            <p className="font-mono text-sm text-muted-foreground">{query.data.shortName}</p>
          )}
          <p className="max-w-xl leading-relaxed text-muted-foreground">
            Sign in to access your cooperative’s farmer, collection, and settlement records.
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-semibold text-primary-foreground"
          >
            Sign in to ClyCites
          </Link>
        </>
      )}
    </div>
  );
}
