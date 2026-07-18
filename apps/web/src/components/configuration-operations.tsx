'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingIndicator } from '@clycites/ui';

import { apiRequest } from '@/lib/api-client';
import { ProtectedPage } from './protected-page';

interface Device {
  id: string;
  name: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
}
interface Commodity {
  id: string;
  name: string;
  code: string;
  forms: { id: string; name: string; code: string }[];
}
interface Definition {
  id: string;
  name: string;
  code: string;
  dataType: string;
  required: boolean;
  unit: string | null;
  organizationId: string | null;
}

export function DevicesView({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: ['devices', organizationId],
    queryFn: () => apiRequest<Device[]>(`/organizations/${organizationId}/devices`),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-sm font-bold uppercase text-emerald-800">Collection operations</p>
        <h1 className="mt-1 text-3xl font-bold">Registered devices</h1>
        {query.isLoading && (
          <div className="mt-8">
            <LoadingIndicator />
          </div>
        )}
        {query.error && (
          <div className="mt-8">
            <ErrorState message={query.error.message} />
          </div>
        )}
        <div className="mt-6 divide-y divide-stone-300 border-y border-stone-300">
          {query.data?.map((device) => (
            <div className="grid gap-2 py-4 sm:grid-cols-[1fr_1fr_auto]" key={device.id}>
              <div>
                <p className="font-bold">{device.name}</p>
                <p className="text-sm text-stone-500">{device.platform}</p>
              </div>
              <p className="text-sm text-stone-600">Last seen {device.lastSeenAt ?? 'never'}</p>
              <span className="font-bold">{device.status}</span>
            </div>
          ))}
        </div>
      </div>
    </ProtectedPage>
  );
}

export function CoffeeConfigurationView({ organizationId }: { organizationId: string }) {
  const commodities = useQuery({
    queryKey: ['commodities'],
    queryFn: () => apiRequest<Commodity[]>('/commodities'),
  });
  const formIds =
    commodities.data?.flatMap((commodity) => commodity.forms.map((form) => form.id)) ?? [];
  const definitions = useQuery({
    queryKey: ['quality-definitions', organizationId, formIds],
    enabled: formIds.length > 0,
    queryFn: async () =>
      (
        await Promise.all(
          formIds.map((id) =>
            apiRequest<Definition[]>(
              `/organizations/${organizationId}/commodity-forms/${id}/quality-definitions`,
            ),
          ),
        )
      ).flat(),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-sm font-bold uppercase text-emerald-800">Coffee configuration</p>
        <h1 className="mt-1 text-3xl font-bold">Forms and quality checks</h1>
        {commodities.isLoading && (
          <div className="mt-8">
            <LoadingIndicator />
          </div>
        )}
        {commodities.error && (
          <div className="mt-8">
            <ErrorState message={commodities.error.message} />
          </div>
        )}
        <div className="mt-7 grid gap-8 md:grid-cols-[.7fr_1.3fr]">
          <section>
            <h2 className="text-xl font-bold">Coffee forms</h2>
            <div className="mt-3 divide-y divide-stone-300 border-y border-stone-300">
              {commodities.data
                ?.flatMap((commodity) => commodity.forms)
                .map((form) => (
                  <div className="py-4" key={form.id}>
                    <p className="font-bold">{form.name}</p>
                    <p className="text-sm text-stone-500">{form.code}</p>
                  </div>
                ))}
            </div>
          </section>
          <section>
            <h2 className="text-xl font-bold">Effective quality checks</h2>
            <div className="mt-3 divide-y divide-stone-300 border-y border-stone-300">
              {definitions.data?.map((definition) => (
                <div className="grid grid-cols-[1fr_auto] gap-3 py-4" key={definition.id}>
                  <div>
                    <p className="font-bold">{definition.name}</p>
                    <p className="text-sm text-stone-500">
                      {definition.dataType}
                      {definition.unit ? ` · ${definition.unit}` : ''}
                      {definition.organizationId
                        ? ' · Cooperative override'
                        : ' · Platform default'}
                    </p>
                  </div>
                  <span className="text-sm font-bold">
                    {definition.required ? 'Required' : 'Optional'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </ProtectedPage>
  );
}
