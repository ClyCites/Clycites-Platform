'use client';

import type { OrganizationFeature, SetOrganizationFeatureInput } from '@clycites/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryError } from '@/components/dashboard/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api-client';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { EmptyState, LoadingIndicator } from '@clycites/ui';

const HIGH_RISK = new Set(['HIGH', 'CRITICAL']);

const riskTone: Record<string, string> = {
  LOW: 'bg-stone-100 text-stone-700',
  MEDIUM: 'bg-amber-100 text-amber-900',
  HIGH: 'bg-orange-100 text-orange-900',
  CRITICAL: 'bg-red-100 text-red-800',
};

export function FeaturesView({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();

  const features = useQuery({
    queryKey: dashboardKeys.features(organizationId),
    queryFn: () => dashboardApi.features(organizationId),
  });

  const toggle = useMutation({
    mutationFn: (input: SetOrganizationFeatureInput) =>
      dashboardApi.setFeature(organizationId, input),
    onSuccess: () => {
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.features(organizationId) });
    },
    onError: (mutationError) => {
      if (
        mutationError instanceof ApiRequestError &&
        mutationError.code === 'FEATURE_HIGH_RISK_APPROVAL_REQUIRED'
      ) {
        setError('A reason is required to change this high-risk feature.');
        return;
      }
      setError(mutationError instanceof Error ? mutationError.message : 'Update failed');
    },
  });

  const onToggle = (feature: OrganizationFeature) => {
    const enabling = !feature.enabled;
    const highRisk = HIGH_RISK.has(feature.riskLevel);
    let reason: string | undefined;
    if (highRisk && enabling) {
      const input = window.prompt(`Enabling "${feature.name}" is high-risk. Enter a reason:`);
      if (!input || input.trim().length < 3) {
        setError('A reason of at least 3 characters is required.');
        return;
      }
      reason = input.trim();
    }
    toggle.mutate({
      featureDefinitionId: feature.featureDefinitionId,
      enabled: enabling,
      version: feature.version,
      ...(reason ? { reason } : {}),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Features</h1>
        <p className="text-sm text-muted-foreground">
          Enable or disable platform capabilities for this organization.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {features.isLoading && <LoadingIndicator label="Loading features" />}
      {features.error && <QueryError error={features.error} />}

      {features.data && features.data.length === 0 && (
        <EmptyState title="No features" description="No feature definitions are available." />
      )}

      <div className="space-y-3">
        {features.data?.map((feature) => (
          <Card key={feature.featureDefinitionId}>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">{feature.name}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${riskTone[feature.riskLevel] ?? riskTone.LOW}`}
                  >
                    {feature.riskLevel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{feature.code}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge>{feature.enabled ? 'COMPLETED' : 'DRAFT'}</Badge>
                <Button
                  variant={feature.enabled ? 'outline' : 'default'}
                  size="sm"
                  disabled={toggle.isPending}
                  onClick={() => onToggle(feature)}
                >
                  {feature.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
