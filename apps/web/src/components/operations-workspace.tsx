'use client';

import { useQuery } from '@tanstack/react-query';
import { ArchiveRestore, Flag, RefreshCw, ShieldCheck, Siren } from 'lucide-react';

import { ProtectedPage } from '@/components/protected-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiRequest } from '@/lib/api-client';
import { formatKampalaDateTime } from '@/lib/localization';
import { ErrorState, LoadingIndicator } from '@clycites/ui';

type ReadinessGate = {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  blocking: boolean;
  riskLevel: string;
  humanReviewRequired: boolean;
  notes: string | null;
};

type Incident = {
  id: string;
  incidentNumber: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  detectedAt: string;
};

type PrivacyRequest = {
  id: string;
  publicId: string;
  subjectType: string;
  requestType: string;
  status: string;
  submittedAt: string;
};

type BackupRecord = {
  id: string;
  backupType: string;
  environment: string;
  status: string;
  restoreStatus: string | null;
  startedAt: string;
};

type FeatureFlag = {
  id: string;
  key: string;
  scope: string;
  enabled: boolean;
  highRisk: boolean;
  reason: string;
};

type OperationsOverview = {
  readiness: {
    ready: boolean;
    blockingGateCount: number;
    openBlockingGateCount: number;
    evaluatedAt: string;
  };
  gates: ReadinessGate[];
  incidents: Incident[];
  privacyRequests: PrivacyRequest[];
  backups: BackupRecord[];
  flags: FeatureFlag[];
};

const openIncidentStatuses = new Set(['OPEN', 'ACKNOWLEDGED', 'MITIGATING', 'MONITORING']);
const openPrivacyStatuses = new Set(['RECEIVED', 'IDENTITY_VERIFICATION_REQUIRED', 'IN_REVIEW']);

export function OperationsWorkspace() {
  const overview = useQuery({
    queryKey: ['operations-overview'],
    queryFn: () => apiRequest<OperationsOverview>('/operations/overview'),
  });

  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-800">Platform operations</p>
            <h1 className="mt-1 text-3xl font-bold text-stone-950">Pilot control room</h1>
            <p className="mt-2 max-w-3xl text-sm text-stone-600">
              Authoritative readiness gates, active incidents, privacy workload, recovery evidence,
              and emergency controls.
            </p>
          </div>
          <Button
            aria-label="Refresh operations data"
            type="button"
            className="border border-stone-300 bg-white! text-stone-800! hover:bg-stone-100!"
            disabled={overview.isFetching}
            onClick={() => void overview.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={overview.isFetching ? 'animate-spin' : ''}
              size={17}
            />
            Refresh
          </Button>
        </header>

        {overview.isLoading && (
          <div className="mt-8">
            <LoadingIndicator label="Loading operations" />
          </div>
        )}
        {overview.error && (
          <div className="mt-8">
            <ErrorState title="Operations unavailable" message={overview.error.message} />
          </div>
        )}
        {overview.data && <Overview data={overview.data} />}
      </div>
    </ProtectedPage>
  );
}

function Overview({ data }: { data: OperationsOverview }) {
  const activeIncidents = data.incidents.filter((incident) =>
    openIncidentStatuses.has(incident.status),
  );
  const openPrivacyRequests = data.privacyRequests.filter((request) =>
    openPrivacyStatuses.has(request.status),
  );
  const latestBackup = data.backups[0];

  return (
    <div className="mt-6 space-y-8" aria-live="polite">
      <section
        aria-labelledby="operations-summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <h2 className="sr-only" id="operations-summary">
          Operations summary
        </h2>
        <SummaryCard
          icon={ShieldCheck}
          label="Pilot decision"
          value={data.readiness.ready ? 'Ready' : 'Not ready'}
          detail={`${data.readiness.openBlockingGateCount} blocking gates open`}
          tone={data.readiness.ready ? 'positive' : 'negative'}
        />
        <SummaryCard
          icon={Siren}
          label="Active incidents"
          value={String(activeIncidents.length)}
          detail="Across visible organizations"
          tone={activeIncidents.length ? 'warning' : 'positive'}
        />
        <SummaryCard
          icon={ArchiveRestore}
          label="Privacy workload"
          value={String(openPrivacyRequests.length)}
          detail="Requests awaiting completion"
          tone={openPrivacyRequests.length ? 'warning' : 'neutral'}
        />
        <SummaryCard
          icon={Flag}
          label="Latest restore"
          value={latestBackup?.restoreStatus ?? 'Not recorded'}
          detail={
            latestBackup
              ? `${latestBackup.environment} · ${formatDate(latestBackup.startedAt)}`
              : 'No backup evidence'
          }
          tone={latestBackup?.restoreStatus === 'PASSED' ? 'positive' : 'warning'}
        />
      </section>

      <section aria-labelledby="readiness-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-stone-950" id="readiness-heading">
              Readiness gates
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              A pilot cannot be marked ready while a blocking gate remains open.
            </p>
          </div>
          <Badge>{data.gates.length} TOTAL</Badge>
        </div>
        <div className="mt-4 overflow-x-auto border border-stone-200 bg-white">
          <table className="w-full min-w-200 text-left text-sm">
            <thead className="bg-stone-100 text-stone-700">
              <tr>
                <th className="px-4 py-3">Gate</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {data.gates.map((gate) => (
                <tr key={gate.id}>
                  <td className="max-w-md px-4 py-3">
                    <p className="font-semibold text-stone-950">{gate.name}</p>
                    <p className="mt-1 font-mono text-xs text-stone-500">{gate.code}</p>
                    {gate.notes && <p className="mt-1 text-xs text-stone-600">{gate.notes}</p>}
                  </td>
                  <td className="px-4 py-3">{label(gate.category)}</td>
                  <td className="px-4 py-3">
                    <Status value={gate.riskLevel} />
                  </td>
                  <td className="px-4 py-3">
                    <Status value={gate.status} />
                  </td>
                  <td className="px-4 py-3">
                    {gate.humanReviewRequired ? 'Human evidence required' : 'Technical evidence'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <ListSection
          title="Active incidents"
          count={activeIncidents.length}
          empty="No active incidents are visible."
        >
          {activeIncidents.map((incident) => (
            <Row
              key={incident.id}
              title={`${incident.incidentNumber} · ${incident.title}`}
              detail={`${label(incident.category)} · ${formatDate(incident.detectedAt)}`}
              status={`${incident.severity} ${incident.status}`}
            />
          ))}
        </ListSection>
        <ListSection
          title="Privacy requests"
          count={openPrivacyRequests.length}
          empty="No privacy requests await action."
        >
          {openPrivacyRequests.map((request) => (
            <Row
              key={request.id}
              title={`${label(request.requestType)} · ${request.publicId}`}
              detail={`${label(request.subjectType)} · ${formatDate(request.submittedAt)}`}
              status={label(request.status)}
            />
          ))}
        </ListSection>
      </div>

      <section aria-labelledby="flags-heading">
        <h2 className="text-xl font-bold text-stone-950" id="flags-heading">
          Feature and provider controls
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.flags.map((flag) => (
            <Card className="p-4" key={flag.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-sm font-semibold">{flag.key}</p>
                <Status value={flag.enabled ? 'ENABLED' : 'DISABLED'} />
              </div>
              <p className="mt-2 text-sm text-stone-600">{flag.reason}</p>
              <p className="mt-3 text-xs font-semibold uppercase text-stone-500">
                {flag.scope}
                {flag.highRisk ? ' · High risk' : ''}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label: cardLabel,
  value,
  detail,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  detail: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
}) {
  const tones = {
    positive: 'text-emerald-700',
    negative: 'text-red-700',
    warning: 'text-amber-700',
    neutral: 'text-stone-600',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-stone-600">{cardLabel}</p>
        <Icon aria-hidden="true" className={tones[tone]} size={19} />
      </div>
      <p className={`mt-3 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-stone-500">{detail}</p>
    </Card>
  );
}

function ListSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-stone-950">{title}</h2>
        <Badge>{count} OPEN</Badge>
      </div>
      <div className="mt-4 divide-y divide-stone-200 border border-stone-200 bg-white">
        {count ? children : <p className="p-5 text-sm text-stone-600">{empty}</p>}
      </div>
    </section>
  );
}

function Row({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="font-semibold text-stone-950">{title}</p>
        <p className="mt-1 text-xs text-stone-500">{detail}</p>
      </div>
      <Status value={status} />
    </div>
  );
}

function Status({ value }: { value: string }) {
  const negative = /CRITICAL|SEV1|BLOCKED|FAILED|ENABLED/.test(value);
  const warning = /HIGH|SEV2|SEV3|IN_PROGRESS|READY_WITH_RISK|MONITORING|RECEIVED|REVIEW/.test(
    value,
  );
  const positive = /READY|PASSED|VERIFIED|DISABLED|FULFILLED/.test(value) && !warning;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${negative ? 'bg-red-100 text-red-800' : warning ? 'bg-amber-100 text-amber-900' : positive ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'}`}
    >
      {label(value)}
    </span>
  );
}

function label(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}
function formatDate(value: string): string {
  return formatKampalaDateTime(value);
}
