'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { apiRequest } from '@/lib/api-client';
import { useOrgPermission } from './ui/workflow-form';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
export function FarmerIdentityLookup({ organizationId }: { organizationId: string }) {
  const [publicId, setPublicId] = useState('');
  const can = useOrgPermission(organizationId);
  const lookup = useMutation({
    mutationFn: () =>
      apiRequest<{ farmerId: string; displayName: string; farmerNumber: string }>(
        `/organizations/${organizationId}/farmer-lookup/${encodeURIComponent(publicId.trim())}`,
      ),
  });
  if (!can('farmer.read')) return null;
  return (
    <details className="ledger-surface mb-5 rounded-md">
      <summary className="px-4 py-3 text-sm font-semibold">Look up signed farmer identity</summary>
      <form
        className="space-y-3 border-t border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          lookup.mutate();
        }}
      >
        <Label>
          QR identity public reference
          <Input required value={publicId} onChange={(event) => setPublicId(event.target.value)} />
        </Label>
        <Button type="submit" disabled={lookup.isPending}>
          {lookup.isPending ? 'Checking…' : 'Look up farmer'}
        </Button>
        {lookup.error && (
          <p role="alert" className="text-sm text-destructive">
            {lookup.error.message}
          </p>
        )}
        {lookup.data && (
          <Link
            className="block text-sm font-semibold text-primary underline"
            href={`/organizations/${organizationId}/farmers/${lookup.data.farmerId}`}
          >
            {lookup.data.displayName} · {lookup.data.farmerNumber}
          </Link>
        )}
      </form>
    </details>
  );
}
