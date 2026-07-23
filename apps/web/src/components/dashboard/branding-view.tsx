'use client';

import type { BrandingResponse, UpsertBrandingInput } from '@clycites/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryError } from '@/components/dashboard/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestError } from '@/lib/api-client';
import { dashboardApi, dashboardKeys } from '@/lib/dashboard-api';
import { LoadingIndicator } from '@clycites/ui';

interface BrandingForm {
  displayName: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  supportEmail: string;
  supportPhone: string;
  locale: string;
  timezone: string;
  currency: string;
}

const emptyForm: BrandingForm = {
  displayName: '',
  shortName: '',
  primaryColor: '',
  secondaryColor: '',
  accentColor: '',
  supportEmail: '',
  supportPhone: '',
  locale: 'en-UG',
  timezone: 'Africa/Kampala',
  currency: 'UGX',
};

const toForm = (branding: BrandingResponse): BrandingForm => ({
  displayName: branding.displayName,
  shortName: branding.shortName ?? '',
  primaryColor: branding.primaryColor ?? '',
  secondaryColor: branding.secondaryColor ?? '',
  accentColor: branding.accentColor ?? '',
  supportEmail: branding.supportEmail ?? '',
  supportPhone: branding.supportPhone ?? '',
  locale: branding.locale,
  timezone: branding.timezone,
  currency: branding.currency,
});

const trimmedOrUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function BrandingView({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BrandingForm>(emptyForm);
  const [version, setVersion] = useState<number | undefined>();
  const [message, setMessage] = useState<string>();
  const [syncedData, setSyncedData] = useState<BrandingResponse | null>(null);

  const branding = useQuery({
    queryKey: dashboardKeys.branding(organizationId),
    queryFn: () => dashboardApi.getBranding(organizationId),
    retry: false,
  });

  if (branding.data && branding.data !== syncedData) {
    setSyncedData(branding.data);
    setForm(toForm(branding.data));
    setVersion(branding.data.version);
  }

  const save = useMutation({
    mutationFn: (input: UpsertBrandingInput) => dashboardApi.upsertBranding(organizationId, input),
    onSuccess: (result) => {
      setVersion(result.version);
      setForm(toForm(result));
      setMessage('Branding saved.');
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.branding(organizationId) });
    },
  });

  const notFound =
    branding.error instanceof ApiRequestError && branding.error.status === 404;

  if (branding.isLoading) return <LoadingIndicator label="Loading branding" />;
  if (branding.error && !notFound) return <QueryError error={branding.error} />;

  const set = (key: keyof BrandingForm) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(undefined);
    const input: UpsertBrandingInput = {
      displayName: form.displayName.trim(),
      shortName: trimmedOrUndefined(form.shortName),
      primaryColor: trimmedOrUndefined(form.primaryColor),
      secondaryColor: trimmedOrUndefined(form.secondaryColor),
      accentColor: trimmedOrUndefined(form.accentColor),
      supportEmail: trimmedOrUndefined(form.supportEmail),
      supportPhone: trimmedOrUndefined(form.supportPhone),
      locale: trimmedOrUndefined(form.locale),
      timezone: trimmedOrUndefined(form.timezone),
      currency: trimmedOrUndefined(form.currency),
      ...(version ? { version } : {}),
    };
    save.mutate(input);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Branding</h1>
        <p className="text-sm text-muted-foreground">
          Customize how this organization appears across the platform.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Organization identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Label>
              Display name
              <Input
                required
                value={form.displayName}
                onChange={(event) => set('displayName')(event.target.value)}
              />
            </Label>
            <Label>
              Short name
              <Input value={form.shortName} onChange={(event) => set('shortName')(event.target.value)} />
            </Label>
            <Label>
              Primary color
              <Input
                placeholder="#0f766e"
                value={form.primaryColor}
                onChange={(event) => set('primaryColor')(event.target.value)}
              />
            </Label>
            <Label>
              Secondary color
              <Input
                placeholder="#134e4a"
                value={form.secondaryColor}
                onChange={(event) => set('secondaryColor')(event.target.value)}
              />
            </Label>
            <Label>
              Accent color
              <Input
                placeholder="#f59e0b"
                value={form.accentColor}
                onChange={(event) => set('accentColor')(event.target.value)}
              />
            </Label>
            <Label>
              Support email
              <Input
                type="email"
                value={form.supportEmail}
                onChange={(event) => set('supportEmail')(event.target.value)}
              />
            </Label>
            <Label>
              Support phone
              <Input
                value={form.supportPhone}
                onChange={(event) => set('supportPhone')(event.target.value)}
              />
            </Label>
            <Label>
              Locale
              <Input value={form.locale} onChange={(event) => set('locale')(event.target.value)} />
            </Label>
            <Label>
              Timezone
              <Input value={form.timezone} onChange={(event) => set('timezone')(event.target.value)} />
            </Label>
            <Label>
              Currency
              <Input
                maxLength={3}
                value={form.currency}
                onChange={(event) => set('currency')(event.target.value.toUpperCase())}
              />
            </Label>
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save branding'}
          </Button>
          {message && <span className="text-sm text-emerald-600">{message}</span>}
          {save.error && (
            <span className="text-sm text-red-600">
              {save.error instanceof Error ? save.error.message : 'Save failed'}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
