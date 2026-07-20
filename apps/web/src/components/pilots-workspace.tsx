'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPilotSchema, type CreatePilotInput } from '@clycites/contracts';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { ProtectedPage } from '@/components/protected-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { RouteTabs } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/api-client';
import { formatKampalaDateTime } from '@/lib/localization';
import type { OrganizationListItem } from '@/lib/domain-types';
import { EmptyState, ErrorState, LoadingIndicator } from '@clycites/ui';

type Pilot = {
  id: string;
  code: string;
  name: string;
  organizationId: string;
  status: string;
  crop: string;
  region: string;
  district: string;
  plannedStartDate: string;
  plannedEndDate: string;
  targetFarmerCount: number;
  targetAgentCount: number;
  targetCollectionPointCount: number;
  targetBuyerCount: number;
  paymentMode: string;
  hederaMode: string;
  smsMode: string;
  environmentLabel: string;
  readOnly: boolean;
  version: number;
  approvedAt: string | null;
  configuration?: unknown;
  readinessGates?: ReadinessGate[];
  statusEvents?: StatusEvent[];
  _count?: { participants: number; supportCases: number; feedback?: number };
};
type ReadinessGate = {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  blocking: boolean;
  humanReviewRequired: boolean;
  notes: string | null;
};
type StatusEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  occurredAt: string;
};
type Participant = {
  id: string;
  participantType: string;
  status: string;
  trainingRequired: boolean;
  trainingCompletedAt: string | null;
  trainingAssignments: Array<{
    id: string;
    status: string;
    score: number | null;
    trainingModule: { title: string; language: string; version: number };
  }>;
};
type TrainingModule = {
  id: string;
  title: string;
  audience: string;
  language: string;
  version: number;
  status: string;
};
type Evidence = {
  baselines: Array<{
    id: string;
    metricCode: string;
    valueType: string;
    decimalValue: string | null;
    integerValue: number | null;
    textValue: string | null;
    unit: string | null;
    verifiedAt: string | null;
  }>;
  observations: Array<{
    id: string;
    metricCode: string;
    decimalValue: string | null;
    integerValue: number | null;
    textValue: string | null;
    unit: string | null;
    dataQuality: string;
    reviewStatus: string;
    periodEnd: string;
  }>;
  feedback: Array<{
    id: string;
    category: string;
    rating: number | null;
    status: string;
    anonymous: boolean;
    submittedAt: string;
  }>;
  supportCases: SupportCase[];
};
type SupportCase = {
  id: string;
  caseNumber: string;
  title: string;
  priority: string;
  status: string;
  openedAt: string;
};
type Preflight = {
  passed: boolean;
  generatedAt: string;
  checks: Array<{ code: string; status: string; blocking: boolean; message: string }>;
};
type Evaluation = {
  automatedDecision: null;
  evidenceSnapshotHash: string;
  evidence: {
    verifiedBaselineCount: number;
    metricQuality: unknown[];
    feedback: unknown[];
    support: unknown[];
    openIncidents: unknown[];
  };
  decisions: Array<{
    id: string;
    decision: string;
    decisionVersion: number;
    summary: string;
    evidenceSnapshotHash: string;
    approvedAt: string | null;
    decidedAt: string;
  }>;
};

const sections = [
  'overview',
  'readiness',
  'participants',
  'training',
  'evidence',
  'support',
  'evaluation',
] as const;
type Section = (typeof sections)[number];
const inputClass =
  'mt-1 min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-stone-950 focus:border-emerald-700 focus:outline-2 focus:outline-emerald-700';
const pilotFormFields: Array<[keyof CreateInput, string, 'text' | 'date' | 'number']> = [
  ['code', 'Pilot code', 'text'],
  ['name', 'Pilot name', 'text'],
  ['region', 'Region', 'text'],
  ['district', 'District', 'text'],
  ['plannedStartDate', 'Planned start', 'date'],
  ['plannedEndDate', 'Planned end', 'date'],
  ['targetFarmerCount', 'Target farmers', 'number'],
  ['targetAgentCount', 'Target agents', 'number'],
  ['targetCollectionPointCount', 'Target collection points', 'number'],
  ['targetBuyerCount', 'Target buyers', 'number'],
];
const pilotModeFields: Array<[keyof CreateInput, string[]]> = [
  ['paymentMode', ['MOCK', 'MANUAL_RECONCILIATION', 'SANDBOX_PROVIDER']],
  ['hederaMode', ['MOCK', 'TESTNET', 'DISABLED']],
  ['smsMode', ['DISABLED', 'MOCK', 'CONSOLE', 'SANDBOX']],
];

export function PilotsAdmin() {
  const pilots = useQuery({ queryKey: ['pilots'], queryFn: () => apiRequest<Pilot[]>('/pilots') });
  return (
    <ProtectedPage>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-800">
              Controlled pilot execution
            </p>
            <h1 className="mt-1 text-3xl font-bold text-stone-950">Cooperative pilots</h1>
            <p className="mt-2 max-w-2xl text-sm text-stone-600">
              Govern onboarding, training, field evidence, support, and human go/no-go review.
            </p>
          </div>
          <Link
            href="/admin/pilots/new"
            className="inline-flex min-h-10 items-center rounded-md bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900"
          >
            Create pilot
          </Link>
        </header>
        {pilots.isLoading && (
          <div className="mt-8">
            <LoadingIndicator label="Loading pilots" />
          </div>
        )}
        {pilots.error && (
          <div className="mt-8">
            <ErrorState title="Pilots unavailable" message={pilots.error.message} />
          </div>
        )}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {pilots.data?.map((pilot) => (
            <Link key={pilot.id} href={`/admin/pilots/${pilot.id}`}>
              <Card className="h-full transition hover:border-emerald-700">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-stone-500">{pilot.code}</p>
                    <h2 className="mt-1 text-lg font-bold text-stone-950">{pilot.name}</h2>
                  </div>
                  <Badge>{pilot.status}</Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <Fact
                      icon={MapPin}
                      label="Scope"
                      value={`${pilot.district}, ${pilot.region}`}
                    />
                    <Fact
                      icon={CalendarDays}
                      label="Window"
                      value={`${shortDate(pilot.plannedStartDate)} - ${shortDate(pilot.plannedEndDate)}`}
                    />
                    <Fact
                      icon={Users}
                      label="Participants"
                      value={String(pilot._count?.participants ?? 0)}
                    />
                    <Fact
                      icon={ShieldCheck}
                      label="Modes"
                      value={`${pilot.paymentMode} / ${pilot.hederaMode}`}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        {pilots.data?.length === 0 && (
          <EmptyState
            title="No controlled pilots"
            description="Create a draft pilot to begin readiness review."
          />
        )}
      </main>
    </ProtectedPage>
  );
}

type CreateInput = z.input<typeof createPilotSchema>;
export function NewPilotForm() {
  const organizations = useQuery({
    queryKey: ['organizations'],
    queryFn: () => apiRequest<OrganizationListItem[]>('/organizations'),
  });
  const form = useForm<CreateInput, unknown, CreatePilotInput>({
    resolver: zodResolver(createPilotSchema),
    defaultValues: {
      crop: 'COFFEE',
      targetFarmerCount: 25,
      targetAgentCount: 2,
      targetCollectionPointCount: 1,
      targetBuyerCount: 1,
      paymentMode: 'MOCK',
      hederaMode: 'MOCK',
      smsMode: 'MOCK',
      supportModel: 'Assisted pilot support with named escalation owner.',
    },
  });
  const mutation = useMutation({
    mutationFn: (input: CreatePilotInput) =>
      apiRequest<Pilot>('/pilots', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (pilot) => location.assign(`/admin/pilots/${pilot.id}`),
  });
  const submit = form.handleSubmit(async (input) => {
    try {
      await mutation.mutateAsync(input);
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Pilot creation failed',
      });
    }
  });
  return (
    <ProtectedPage>
      <main className="mx-auto max-w-4xl px-4 py-7 sm:px-6">
        <p className="text-sm font-bold uppercase text-emerald-800">Controlled pilot execution</p>
        <h1 className="mt-1 text-3xl font-bold text-stone-950">Create draft pilot</h1>
        <p className="mt-2 text-sm text-stone-600">
          Creation does not approve onboarding or activate providers.
        </p>
        <Card className="mt-6">
          <form className="grid gap-5 p-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
            {pilotFormFields.map(([name, label, type]) => (
              <Field key={name} label={label} error={form.formState.errors[name]?.message}>
                <input
                  type={type}
                  className={inputClass}
                  {...(type === 'number'
                    ? form.register(name, { valueAsNumber: true })
                    : form.register(name))}
                />
              </Field>
            ))}
            <Field label="Cooperative" error={form.formState.errors.organizationId?.message}>
              <select className={inputClass} {...form.register('organizationId')}>
                <option value="">Select cooperative</option>
                {organizations.data
                  ?.filter((organization) => organization.type === 'COOPERATIVE')
                  .map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
              </select>
            </Field>
            {pilotModeFields.map(([name, values]) => (
              <Field
                key={name}
                label={String(name).replace('Mode', ' mode')}
                error={form.formState.errors[name]?.message}
              >
                <select className={inputClass} {...form.register(name)}>
                  {values.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
            ))}
            <Field
              label="Support model"
              className="sm:col-span-2"
              error={form.formState.errors.supportModel?.message}
            >
              <textarea className={`${inputClass} min-h-24`} {...form.register('supportModel')} />
            </Field>
            {form.formState.errors.root && (
              <p className="sm:col-span-2 text-sm font-semibold text-red-700" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating...' : 'Create draft pilot'}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </ProtectedPage>
  );
}

export function PilotWorkspace({
  pilotId,
  section = 'overview',
}: {
  pilotId: string;
  section?: string;
}) {
  const active = sections.includes(section as Section) ? (section as Section) : 'overview';
  const queryClient = useQueryClient();
  const pilot = useQuery({
    queryKey: ['pilot', pilotId],
    queryFn: () => apiRequest<Pilot>(`/pilots/${pilotId}`),
  });
  const participants = useQuery({
    queryKey: ['pilot-participants', pilotId],
    queryFn: () => apiRequest<Participant[]>(`/pilots/${pilotId}/participants`),
    enabled: ['participants', 'training'].includes(active),
  });
  const evidence = useQuery({
    queryKey: ['pilot-evidence', pilotId],
    queryFn: () => apiRequest<Evidence>(`/pilots/${pilotId}/evidence`),
    enabled: ['evidence', 'support'].includes(active),
  });
  const preflight = useQuery({
    queryKey: ['pilot-preflight', pilotId],
    queryFn: () => apiRequest<Preflight>(`/pilots/${pilotId}/preflight`),
    enabled: ['overview', 'readiness'].includes(active),
  });
  const evaluation = useQuery({
    queryKey: ['pilot-evaluation', pilotId],
    queryFn: () => apiRequest<Evaluation>(`/pilots/${pilotId}/evaluation`),
    enabled: active === 'evaluation',
  });
  const transition = useMutation({
    mutationFn: ({ action, version }: { action: string; version: number }) =>
      apiRequest<Pilot>(`/pilots/${pilotId}/transitions`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          version,
          evidence: { source: 'pilot-control-room', humanInitiated: true },
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pilot', pilotId] });
      await queryClient.invalidateQueries({ queryKey: ['pilot-preflight', pilotId] });
    },
  });
  if (pilot.isLoading)
    return (
      <ProtectedPage>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <LoadingIndicator label="Loading pilot" />
        </div>
      </ProtectedPage>
    );
  if (pilot.error || !pilot.data)
    return (
      <ProtectedPage>
        <div className="mx-auto max-w-7xl px-4 py-10">
          <ErrorState
            title="Pilot unavailable"
            message={pilot.error?.message ?? 'Pilot not found'}
          />
        </div>
      </ProtectedPage>
    );
  const data = pilot.data;
  const next = nextAction(data.status);
  return (
    <ProtectedPage>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <header className="border-b border-stone-200 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href="/admin/pilots"
                className="text-sm font-bold text-emerald-800 hover:underline"
              >
                Controlled pilots
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-stone-950">{data.name}</h1>
                <Badge>{data.status}</Badge>
                {data.readOnly && <Badge className="bg-red-100 text-red-800">READ ONLY</Badge>}
              </div>
              <p className="mt-2 text-sm text-stone-600">
                {data.code} · {data.district}, {data.region}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="border border-stone-300 bg-white! text-stone-800! hover:bg-stone-100!"
                onClick={() => void pilot.refetch()}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Refresh
              </Button>
              {next && (
                <Button
                  disabled={transition.isPending}
                  onClick={() => {
                    if (!next.confirm || window.confirm(next.confirm))
                      transition.mutate({ action: next.action, version: data.version });
                  }}
                >
                  {next.label}
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
          <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 sm:grid-cols-4">
            <Mode label="Environment" value={data.environmentLabel} />
            <Mode label="Payment" value={data.paymentMode} />
            <Mode label="Hedera" value={data.hederaMode} />
            <Mode label="SMS" value={data.smsMode} />
          </div>
        </header>
        <div className="mt-5">
          <RouteTabs
            active={title(active)}
            items={sections.map((item) => ({
              label: title(item),
              href:
                item === 'overview'
                  ? `/admin/pilots/${pilotId}`
                  : `/admin/pilots/${pilotId}/${item}`,
            }))}
          />
        </div>
        <div className="mt-6">
          {transition.error && (
            <div className="mb-5">
              <ErrorState title="Transition blocked" message={transition.error.message} />
            </div>
          )}
          {active === 'overview' && <Overview pilot={data} preflight={preflight.data} />}
          {active === 'readiness' && <Readiness pilot={data} preflight={preflight.data} />}
          {active === 'participants' && (
            <Participants
              pilotId={pilotId}
              data={participants.data}
              loading={participants.isLoading}
            />
          )}
          {active === 'training' && (
            <Training pilotId={pilotId} data={participants.data} loading={participants.isLoading} />
          )}
          {active === 'evidence' && (
            <EvidencePanel pilotId={pilotId} data={evidence.data} loading={evidence.isLoading} />
          )}
          {active === 'support' && (
            <Support pilotId={pilotId} organizationId={data.organizationId} />
          )}
          {active === 'evaluation' && (
            <EvaluationPanel
              pilotId={pilotId}
              data={evaluation.data}
              loading={evaluation.isLoading}
            />
          )}
        </div>
      </main>
    </ProtectedPage>
  );
}

function Overview({ pilot, preflight }: { pilot: Pilot; preflight: Preflight | undefined }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader>
          <h2 className="font-bold text-stone-950">Pilot scope</h2>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-5 text-sm">
          <Fact icon={Users} label="Farmers" value={String(pilot.targetFarmerCount)} />
          <Fact icon={Users} label="Agents" value={String(pilot.targetAgentCount)} />
          <Fact
            icon={MapPin}
            label="Collection points"
            value={String(pilot.targetCollectionPointCount)}
          />
          <Fact
            icon={CalendarDays}
            label="Planned window"
            value={`${shortDate(pilot.plannedStartDate)} - ${shortDate(pilot.plannedEndDate)}`}
          />
        </CardContent>
      </Card>
      <PreflightPanel data={preflight} />
    </div>
  );
}
function Readiness({ pilot, preflight }: { pilot: Pilot; preflight: Preflight | undefined }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <h2 className="font-bold">Authoritative readiness gates</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {pilot.readinessGates?.map((gate) => (
            <div
              key={gate.id}
              className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3"
            >
              <div>
                <p className="font-semibold text-stone-900">{gate.name}</p>
                <p className="text-xs text-stone-500">
                  {gate.category}
                  {gate.humanReviewRequired ? ' · human review' : ''}
                </p>
              </div>
              <Badge>{gate.status}</Badge>
            </div>
          ))}
          {pilot.readinessGates?.length === 0 && (
            <p className="text-sm text-stone-600">
              No pilot-specific gates. Global gates still apply.
            </p>
          )}
        </CardContent>
      </Card>
      <PreflightPanel data={preflight} />
    </div>
  );
}
function Participants({
  pilotId,
  data,
  loading,
}: {
  pilotId: string;
  data: Participant[] | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['pilot-participants', pilotId] });
  const enroll = useMutation({
    mutationFn: (input: object) =>
      apiRequest(`/pilots/${pilotId}/participants`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: ({ participantId, reason }: { participantId: string; reason: string }) =>
      apiRequest(`/pilots/${pilotId}/participants/${participantId}/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: refresh,
  });
  if (loading) return <LoadingIndicator />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="font-bold">Enrollment controls</h2>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const participantType = formText(form, 'participantType');
              const referenceId = formText(form, 'referenceId');
              const trainingRequired = form.get('trainingRequired') === 'on';
              enroll.mutate(
                participantType === 'FARMER'
                  ? {
                      participantType,
                      farmerId: referenceId,
                      consentVerifiedAt: new Date().toISOString(),
                      trainingRequired,
                    }
                  : { participantType, userId: referenceId, trainingRequired },
              );
            }}
          >
            <Field label="Participant type">
              <select name="participantType" className={inputClass}>
                {[
                  'FARMER',
                  'COLLECTION_AGENT',
                  'COOPERATIVE_ADMIN',
                  'FINANCE_OFFICER',
                  'QUALITY_INSPECTOR',
                  'BUYER_USER',
                  'SUPPORT_USER',
                  'OBSERVER',
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Existing farmer or user ID">
              <input name="referenceId" required className={inputClass} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input name="trainingRequired" type="checkbox" defaultChecked />
              Training required
            </label>
            <Button type="submit" disabled={enroll.isPending}>
              Enroll participant
            </Button>
          </form>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              withdraw.mutate({
                participantId: formText(form, 'participantId'),
                reason: formText(form, 'reason'),
              });
            }}
          >
            <Field label="Participant">
              <select name="participantId" required className={inputClass}>
                <option value="">Select participant</option>
                {data
                  ?.filter((item) => item.status !== 'WITHDRAWN')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {title(item.participantType)} · {item.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Withdrawal reason">
              <textarea name="reason" required className={`${inputClass} min-h-20`} />
            </Field>
            <Button
              type="submit"
              disabled={withdraw.isPending}
              className="bg-stone-800 hover:bg-stone-900"
            >
              Withdraw participant
            </Button>
          </form>
        </CardContent>
      </Card>
      <MutationError errors={[enroll.error, withdraw.error]} />
      <GridEmpty data={data} empty="No participants enrolled">
        {(participant) => (
          <Card key={participant.id}>
            <CardContent>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-bold">{title(participant.participantType)}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    Training {participant.trainingRequired ? 'required' : 'not required'}
                  </p>
                </div>
                <Badge>{participant.status}</Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </GridEmpty>
    </div>
  );
}
function Training({
  pilotId,
  data,
  loading,
}: {
  pilotId: string;
  data: Participant[] | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const modules = useQuery({
    queryKey: ['training-modules'],
    queryFn: () => apiRequest<TrainingModule[]>('/training/modules'),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['pilot-participants', pilotId] });
  const assign = useMutation({
    mutationFn: (input: object) =>
      apiRequest(`/pilots/${pilotId}/training/assignments`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: ({ assignmentId, score }: { assignmentId: string; score?: number }) =>
      apiRequest(`/training/assignments/${assignmentId}/complete`, {
        method: 'POST',
        body: JSON.stringify(score === undefined ? {} : { score }),
      }),
    onSuccess: refresh,
  });
  const waive = useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: string; reason: string }) =>
      apiRequest(`/training/assignments/${assignmentId}/waive`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: refresh,
  });
  if (loading) return <LoadingIndicator />;
  const assignments =
    data?.flatMap((participant) =>
      participant.trainingAssignments.map((assignment) => ({
        ...assignment,
        participantType: participant.participantType,
      })),
    ) ?? [];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="font-bold">Training controls</h2>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-3">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              assign.mutate({
                participantId: formText(form, 'participantId'),
                trainingModuleId: formText(form, 'trainingModuleId'),
              });
            }}
          >
            <Field label="Participant">
              <select name="participantId" required className={inputClass}>
                <option value="">Select participant</option>
                {data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {title(item.participantType)} · {item.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Module">
              <select name="trainingModuleId" required className={inputClass}>
                <option value="">Select module</option>
                {modules.data
                  ?.filter((item) => item.status === 'ACTIVE')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {item.language} v{item.version}
                    </option>
                  ))}
              </select>
            </Field>
            <Button type="submit" disabled={assign.isPending}>
              Assign module
            </Button>
          </form>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const score = formText(form, 'score');
              complete.mutate({
                assignmentId: formText(form, 'assignmentId'),
                ...(score ? { score: Number(score) } : {}),
              });
            }}
          >
            <AssignmentSelect assignments={assignments} />
            <Field label="Assessment score">
              <input name="score" type="number" min="0" max="100" className={inputClass} />
            </Field>
            <Button type="submit" disabled={complete.isPending}>
              Record completion
            </Button>
          </form>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              waive.mutate({
                assignmentId: formText(form, 'assignmentId'),
                reason: formText(form, 'reason'),
              });
            }}
          >
            <AssignmentSelect assignments={assignments} />
            <Field label="Exceptional waiver reason">
              <textarea name="reason" required className={`${inputClass} min-h-20`} />
            </Field>
            <Button
              type="submit"
              disabled={waive.isPending}
              className="bg-stone-800 hover:bg-stone-900"
            >
              Record waiver
            </Button>
          </form>
        </CardContent>
      </Card>
      <MutationError errors={[modules.error, assign.error, complete.error, waive.error]} />
      <GridEmpty data={assignments} empty="No training assigned">
        {(assignment) => (
          <Card key={assignment.id}>
            <CardContent>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-bold">{assignment.trainingModule.title}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {title(assignment.participantType)} · {assignment.trainingModule.language} · v
                    {assignment.trainingModule.version}
                  </p>
                </div>
                <Badge>{assignment.status}</Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </GridEmpty>
    </div>
  );
}
function EvidencePanel({
  pilotId,
  data,
  loading,
}: {
  pilotId: string;
  data: Evidence | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pilot-evidence', pilotId] });
  const verify = useMutation({
    mutationFn: (baselineId: string) =>
      apiRequest(`/pilots/${pilotId}/baselines/${baselineId}/verify`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: refresh,
  });
  const review = useMutation({
    mutationFn: (input: { observationId: string; status: string; notes?: string }) =>
      apiRequest(`/pilots/${pilotId}/metrics/${input.observationId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: input.status,
          ...(input.notes ? { notes: input.notes } : {}),
        }),
      }),
    onSuccess: refresh,
  });
  const recalculate = useMutation({
    mutationFn: (input: { periodStart: string; periodEnd: string }) =>
      apiRequest(`/pilots/${pilotId}/metrics/recalculate`, {
        method: 'POST',
        body: JSON.stringify({
          periodStart: `${input.periodStart}T00:00:00.000Z`,
          periodEnd: `${input.periodEnd}T23:59:59.999Z`,
        }),
      }),
    onSuccess: refresh,
  });
  if (loading) return <LoadingIndicator />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="font-bold">Metric operations</h2>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              recalculate.mutate({
                periodStart: formText(form, 'periodStart'),
                periodEnd: formText(form, 'periodEnd'),
              });
            }}
          >
            <Field label="Period start">
              <input name="periodStart" type="date" required className={inputClass} />
            </Field>
            <Field label="Period end">
              <input name="periodEnd" type="date" required className={inputClass} />
            </Field>
            <Button type="submit" disabled={recalculate.isPending} className="sm:col-span-2">
              Recalculate supported metrics
            </Button>
          </form>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const notes = formText(form, 'notes');
              review.mutate({
                observationId: formText(form, 'observationId'),
                status: formText(form, 'status'),
                ...(notes ? { notes } : {}),
              });
            }}
          >
            <Field label="Observation">
              <select name="observationId" required className={inputClass}>
                <option value="">Select observation</option>
                {data?.observations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {title(item.metricCode)} · {shortDate(item.periodEnd)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Review status">
              <select name="status" className={inputClass}>
                {['VERIFIED', 'QUESTIONED', 'REJECTED'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Review notes">
              <input name="notes" className={inputClass} />
            </Field>
            <Button type="submit" disabled={review.isPending}>
              Record human review
            </Button>
          </form>
        </CardContent>
      </Card>
      <MutationError errors={[verify.error, review.error, recalculate.error]} />
      <h2 className="text-lg font-bold">Verified baselines</h2>
      <GridEmpty data={data?.baselines} empty="No baseline evidence">
        {(metric) => (
          <Card key={metric.id}>
            <CardContent>
              <MetricValue metric={metric} />
              {!metric.verifiedAt && (
                <Button
                  className="mt-4"
                  disabled={verify.isPending}
                  onClick={() => verify.mutate(metric.id)}
                >
                  Verify baseline
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </GridEmpty>
      <h2 className="text-lg font-bold">Metric observations</h2>
      <GridEmpty data={data?.observations} empty="No metric observations">
        {metricCard}
      </GridEmpty>
    </div>
  );
}
function metricCard(metric: Evidence['baselines'][number] | Evidence['observations'][number]) {
  return (
    <Card key={metric.id}>
      <CardContent>
        <MetricValue metric={metric} />
        {'dataQuality' in metric && (
          <div className="mt-3 flex gap-2">
            <Badge>{metric.dataQuality}</Badge>
            <Badge>{metric.reviewStatus}</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function MetricValue({
  metric,
}: {
  metric: Evidence['baselines'][number] | Evidence['observations'][number];
}) {
  return (
    <>
      <p className="font-bold">{title(metric.metricCode)}</p>
      <p className="mt-2 text-2xl font-bold text-stone-950">
        {metric.decimalValue ?? metric.integerValue ?? metric.textValue}{' '}
        <span className="text-sm font-medium text-stone-500">{metric.unit}</span>
      </p>
    </>
  );
}
function Support({ pilotId, organizationId }: { pilotId: string; organizationId: string }) {
  const queryClient = useQueryClient();
  const cases = useQuery({
    queryKey: ['pilot-support-cases', organizationId],
    queryFn: () => apiRequest<SupportCase[]>(`/organizations/${organizationId}/support-cases`),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['pilot-support-cases', organizationId] });
  const create = useMutation({
    mutationFn: (input: object) =>
      apiRequest(`/organizations/${organizationId}/support-cases`, {
        method: 'POST',
        body: JSON.stringify({ pilotId, ...input }),
      }),
    onSuccess: refresh,
  });
  const resolve = useMutation({
    mutationFn: (input: { caseId: string; resolutionCode: string; summary: string }) =>
      apiRequest(`/organizations/${organizationId}/support-cases/${input.caseId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolutionCode: input.resolutionCode, summary: input.summary }),
      }),
    onSuccess: refresh,
  });
  const escalate = useMutation({
    mutationFn: (input: {
      caseId: string;
      category: string;
      severity: string;
      impactSummary: string;
    }) =>
      apiRequest(`/organizations/${organizationId}/support-cases/${input.caseId}/escalate`, {
        method: 'POST',
        body: JSON.stringify({
          category: input.category,
          severity: input.severity,
          impactSummary: input.impactSummary,
          restricted: false,
        }),
      }),
    onSuccess: refresh,
  });
  const statusAction = useMutation({
    mutationFn: (input: { caseId: string; action: string }) =>
      apiRequest(`/organizations/${organizationId}/support-cases/${input.caseId}/${input.action}`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: refresh,
  });
  if (cases.isLoading) return <LoadingIndicator />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="font-bold">Support operations</h2>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-3">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              create.mutate({
                category: formText(form, 'category'),
                priority: formText(form, 'priority'),
                title: formText(form, 'title'),
                description: formText(form, 'description'),
              });
            }}
          >
            <Field label="Category">
              <input
                name="category"
                defaultValue="GENERAL_SUPPORT"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Priority">
              <select name="priority" className={inputClass}>
                {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input name="title" required className={inputClass} />
            </Field>
            <Field label="Description">
              <textarea name="description" required className={`${inputClass} min-h-20`} />
            </Field>
            <Button type="submit" disabled={create.isPending}>
              Create case
            </Button>
          </form>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              resolve.mutate({
                caseId: formText(form, 'caseId'),
                resolutionCode: formText(form, 'resolutionCode'),
                summary: formText(form, 'summary'),
              });
            }}
          >
            <SupportCaseSelect data={cases.data} />
            <Field label="Resolution code">
              <input
                name="resolutionCode"
                defaultValue="RESOLVED_WITH_GUIDANCE"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Resolution summary">
              <textarea name="summary" required className={`${inputClass} min-h-20`} />
            </Field>
            <Button type="submit" disabled={resolve.isPending}>
              Resolve case
            </Button>
          </form>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              escalate.mutate({
                caseId: formText(form, 'caseId'),
                category: formText(form, 'category'),
                severity: formText(form, 'severity'),
                impactSummary: formText(form, 'impactSummary'),
              });
            }}
          >
            <SupportCaseSelect data={cases.data} />
            <Field label="Incident category">
              <select name="category" className={inputClass}>
                {[
                  'SECURITY',
                  'PRIVACY',
                  'AVAILABILITY',
                  'DATA_INTEGRITY',
                  'PAYMENT',
                  'HEDERA',
                  'OFFLINE_SYNC',
                  'PERFORMANCE',
                  'OTHER',
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select name="severity" className={inputClass}>
                {['SEV1', 'SEV2', 'SEV3', 'SEV4'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Impact summary">
              <textarea name="impactSummary" required className={`${inputClass} min-h-20`} />
            </Field>
            <Button
              type="submit"
              disabled={escalate.isPending}
              className="bg-red-800 hover:bg-red-900"
            >
              Escalate to incident
            </Button>
          </form>
        </CardContent>
      </Card>
      <MutationError
        errors={[cases.error, create.error, resolve.error, escalate.error, statusAction.error]}
      />
      <GridEmpty data={cases.data} empty="No support cases">
        {(item) => (
          <Card key={item.id}>
            <CardContent>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-stone-500">{item.caseNumber}</p>
                  <p className="mt-1 font-bold">{item.title}</p>
                  <p className="mt-2 text-xs text-stone-500">
                    Opened {formatKampalaDateTime(item.openedAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge>{item.priority}</Badge>
                  <Badge>{item.status}</Badge>
                  {item.status === 'RESOLVED' && (
                    <Button
                      onClick={() => statusAction.mutate({ caseId: item.id, action: 'close' })}
                    >
                      Close
                    </Button>
                  )}
                  {item.status === 'CLOSED' && (
                    <Button
                      onClick={() => statusAction.mutate({ caseId: item.id, action: 'reopen' })}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </GridEmpty>
    </div>
  );
}
function EvaluationPanel({
  pilotId,
  data,
  loading,
}: {
  pilotId: string;
  data: Evaluation | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['pilot-evaluation', pilotId] });
  const decide = useMutation({
    mutationFn: (input: { decision: string; summary: string }) =>
      apiRequest(`/pilots/${pilotId}/decisions`, {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          evidenceSnapshotHash: data?.evidenceSnapshotHash,
          strengths: [],
          risks: [],
          blockingIssues: [],
          conditions: [],
        }),
      }),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (decision: Evaluation['decisions'][number]) =>
      apiRequest(`/pilots/${pilotId}/decisions/approve`, {
        method: 'POST',
        body: JSON.stringify({
          decisionVersion: decision.decisionVersion,
          evidenceSnapshotHash: decision.evidenceSnapshotHash,
          approvalNote: 'Human approval recorded from the controlled pilot evaluation workspace.',
        }),
      }),
    onSuccess: refresh,
  });
  if (loading) return <LoadingIndicator />;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card>
        <CardHeader>
          <h2 className="font-bold">Evidence snapshot</h2>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{data?.evidence.verifiedBaselineCount ?? 0}</p>
          <p className="text-sm text-stone-500">Verified baseline metrics</p>
          <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={16} />
            <p>No automated decision is generated. A separate human approver is required.</p>
          </div>
          <form
            className="mt-5 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              decide.mutate({
                decision: formText(form, 'decision'),
                summary: formText(form, 'summary'),
              });
            }}
          >
            <Field label="Human recommendation">
              <select name="decision" className={inputClass}>
                {['GO', 'CONDITIONAL_GO', 'EXTEND_PILOT', 'PAUSE', 'NO_GO'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Evidence-based summary">
              <textarea name="summary" required className={`${inputClass} min-h-24`} />
            </Field>
            <Button type="submit" disabled={!data?.evidenceSnapshotHash || decide.isPending}>
              Record recommendation
            </Button>
          </form>
          <MutationError errors={[decide.error, approve.error]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-bold">Decision history</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {data?.decisions.map((decision) => (
            <div key={decision.id} className="border-b border-stone-100 pb-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {title(decision.decision)} · v{decision.decisionVersion}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">{decision.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge>{decision.approvedAt ? 'APPROVED' : 'DRAFT'}</Badge>
                  {!decision.approvedAt && (
                    <Button disabled={approve.isPending} onClick={() => approve.mutate(decision)}>
                      Approve as second reviewer
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {data?.decisions.length === 0 && (
            <p className="text-sm text-stone-600">No decision recorded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function PreflightPanel({ data }: { data: Preflight | undefined }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="font-bold">Pilot preflight</h2>
        {data && <Badge>{data.passed ? 'PASSED' : 'FAILED'}</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.checks.map((check) => (
          <div key={check.code} className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-stone-900">{title(check.code)}</p>
              <p className="text-xs text-stone-500">{check.message}</p>
            </div>
            <Badge>{check.status}</Badge>
          </div>
        )) ?? <p className="text-sm text-stone-600">Preflight not measured.</p>}
      </CardContent>
    </Card>
  );
}
function Mode({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase text-stone-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-stone-900">{value}</p>
    </div>
  );
}
function Fact({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 shrink-0 text-emerald-800" size={16} aria-hidden="true" />
      <div>
        <p className="text-xs font-bold uppercase text-stone-500">{label}</p>
        <p className="mt-1 font-semibold text-stone-900">{value}</p>
      </div>
    </div>
  );
}
function Field({
  label,
  error,
  className = '',
  children,
}: {
  label: string;
  error?: string | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className={`text-sm font-semibold text-stone-800 ${className}`}>
      {label}
      {children}
      {error && <span className="mt-1 block text-xs text-red-700">{String(error)}</span>}
    </label>
  );
}
function GridEmpty<T>({
  data,
  empty,
  children,
}: {
  data: T[] | undefined;
  empty: string;
  children: (item: T) => React.ReactNode;
}) {
  if (!data?.length)
    return (
      <EmptyState title={empty} description="This pilot has no records in this section yet." />
    );
  return <div className="grid gap-4 md:grid-cols-2">{data.map(children)}</div>;
}
function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-UG', {
    dateStyle: 'medium',
    timeZone: 'Africa/Kampala',
  }).format(new Date(value));
}
function title(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
function nextAction(
  status: string,
): { action: string; label: string; confirm?: string } | undefined {
  const actions: Record<string, { action: string; label: string; confirm?: string }> = {
    DRAFT: { action: 'SUBMIT_READINESS_REVIEW', label: 'Submit readiness' },
    READINESS_REVIEW: {
      action: 'APPROVE_ONBOARDING',
      label: 'Approve onboarding',
      confirm:
        'Confirm that you personally reviewed the readiness evidence and approve onboarding?',
    },
    APPROVED_FOR_ONBOARDING: { action: 'START_ONBOARDING', label: 'Start onboarding' },
    ONBOARDING: { action: 'START_TRAINING', label: 'Start training' },
    TRAINING: { action: 'START_BASELINE', label: 'Start baseline' },
    BASELINE_COLLECTION: {
      action: 'START_SUPERVISED_USE',
      label: 'Start supervised use',
      confirm: 'Start supervised use only after reviewing all blocking evidence?',
    },
    SUPERVISED_LIVE_USE: {
      action: 'ACTIVATE',
      label: 'Activate pilot',
      confirm:
        'Activate this pilot after reviewing preflight, training, baseline, and incident evidence?',
    },
    COMPLETED: { action: 'START_EVALUATION', label: 'Start evaluation' },
  };
  return actions[status];
}
function AssignmentSelect({
  assignments,
}: {
  assignments: Array<Participant['trainingAssignments'][number] & { participantType: string }>;
}) {
  return (
    <Field label="Assignment">
      <select name="assignmentId" required className={inputClass}>
        <option value="">Select assignment</option>
        {assignments
          .filter((item) => !['COMPLETED', 'WAIVED'].includes(item.status))
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.trainingModule.title} · {title(item.participantType)}
            </option>
          ))}
      </select>
    </Field>
  );
}
function SupportCaseSelect({ data }: { data: SupportCase[] | undefined }) {
  return (
    <Field label="Support case">
      <select name="caseId" required className={inputClass}>
        <option value="">Select case</option>
        {data
          ?.filter((item) => !['RESOLVED', 'CLOSED'].includes(item.status))
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.caseNumber} · {item.title}
            </option>
          ))}
      </select>
    </Field>
  );
}
function MutationError({ errors }: { errors: Array<Error | null> }) {
  const error = errors.find((item): item is Error => Boolean(item));
  return error ? (
    <div className="mt-4">
      <ErrorState title="Action blocked" message={error.message} />
    </div>
  ) : null;
}
function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
