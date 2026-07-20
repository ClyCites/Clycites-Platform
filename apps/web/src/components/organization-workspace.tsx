'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, ErrorState, LoadingIndicator, StatusBadge } from '@clycites/ui';
import {
  createCollectionPointSchema,
  createOrganizationMembershipSchema,
  type CreateCollectionPoint,
  type CreateOrganizationMembership,
  type UpdateOrganizationMembership,
} from '@clycites/contracts';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { apiRequest } from '@/lib/api-client';
import type {
  CollectionPointDetail,
  CollectionPointListItem,
  OrganizationDetail,
  OrganizationMembership,
  Paginated,
} from '@/lib/domain-types';
import { ProtectedPage } from './protected-page';

const fieldClass =
  'mt-1 min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 focus:border-leaf-700 focus:outline-2 focus:outline-leaf-700';
type CollectionPointInput = z.input<typeof createCollectionPointSchema>;
type MembershipInput = z.input<typeof createOrganizationMembershipSchema>;

function Workspace({
  organizationId,
  title,
  action,
  children,
}: {
  organizationId: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const links = [
    ['overview', 'Overview'],
    ['members', 'Members'],
    ['collection-points', 'Collection points'],
    ['farmers', 'Farmers'],
    ['marketplace', 'Marketplace'],
    ['finance', 'Finance'],
  ];
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav
          className="mb-8 overflow-x-auto border-b border-stone-300"
          aria-label="Organization workspace"
        >
          <div className="flex min-w-max gap-6">
            {links.map(([path, label]) => (
              <Link
                className="border-b-2 border-transparent py-3 text-sm font-bold text-stone-600 hover:border-leaf-700 hover:text-leaf-800"
                key={path}
                href={`/organizations/${organizationId}/${path}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-leaf-700">ORGANIZATION WORKSPACE</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-leaf-900">{title}</h1>
          </div>
          {action}
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </ProtectedPage>
  );
}

export function OrganizationOverview({ organizationId }: { organizationId: string }) {
  const organization = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => apiRequest<OrganizationDetail>(`/organizations/${organizationId}`),
  });
  const farmers = useQuery({
    queryKey: ['farmers', organizationId, 'summary'],
    queryFn: () =>
      apiRequest<Paginated<unknown>>(`/organizations/${organizationId}/farmers?pageSize=1`),
  });
  const points = useQuery({
    queryKey: ['collection-points', organizationId, 'summary'],
    queryFn: () =>
      apiRequest<Paginated<unknown>>(
        `/organizations/${organizationId}/collection-points?pageSize=1`,
      ),
  });
  return (
    <Workspace organizationId={organizationId} title={organization.data?.name ?? 'Overview'}>
      {organization.isLoading && <LoadingIndicator />}
      {organization.error && <ErrorState message={organization.error.message} />}
      {organization.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm font-semibold text-stone-500">Farmers</p>
              <p className="mt-2 text-3xl font-bold">
                {farmers.data?.pagination.totalItems ?? '—'}
              </p>
            </Card>
            <Card>
              <p className="text-sm font-semibold text-stone-500">Collection points</p>
              <p className="mt-2 text-3xl font-bold">{points.data?.pagination.totalItems ?? '—'}</p>
            </Card>
            <Card>
              <p className="text-sm font-semibold text-stone-500">Status</p>
              <div className="mt-3">
                <StatusBadge tone={organization.data.status === 'ACTIVE' ? 'positive' : 'warning'}>
                  {organization.data.status}
                </StatusBadge>
              </div>
            </Card>
          </div>
          <Card className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-stone-500">Registration</p>
              <p>{organization.data.registrationNumber ?? 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-stone-500">Location</p>
              <p>
                {[organization.data.district, organization.data.subCounty]
                  .filter(Boolean)
                  .join(', ') || 'Not set'}
              </p>
            </div>
          </Card>
        </>
      )}
    </Workspace>
  );
}

export function OrganizationMembers({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['members', organizationId],
    queryFn: () => apiRequest<OrganizationMembership[]>(`/organizations/${organizationId}/members`),
  });
  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateOrganizationMembership }) =>
      apiRequest(`/organizations/${organizationId}/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', organizationId] }),
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<MembershipInput, unknown, CreateOrganizationMembership>({
    resolver: zodResolver(createOrganizationMembershipSchema),
    defaultValues: { role: 'VIEWER', status: 'ACTIVE' },
  });
  const create = useMutation({
    mutationFn: (body: CreateOrganizationMembership) =>
      apiRequest(`/organizations/${organizationId}/members`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      reset();
      await queryClient.invalidateQueries({ queryKey: ['members', organizationId] });
    },
  });
  const submit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Unable to add member',
      });
    }
  });
  return (
    <Workspace organizationId={organizationId} title="Members">
      <Card>
        <form
          className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => void submit(event)}
        >
          <label className="font-semibold">
            User ID
            <input className={fieldClass} {...register('userId')} />
          </label>
          <label className="font-semibold">
            Role
            <select className={fieldClass} {...register('role')}>
              {[
                'COOPERATIVE_ADMIN',
                'COLLECTION_AGENT',
                'FINANCE_OFFICER',
                'QUALITY_INSPECTOR',
                'BUYER',
                'VIEWER',
              ].map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <Button className="self-end" type="submit">
            Add member
          </Button>
          {errors.root && <p className="text-red-700 md:col-span-3">{errors.root.message}</p>}
        </form>
      </Card>
      {query.isLoading && (
        <div className="mt-6">
          <LoadingIndicator />
        </div>
      )}
      {query.error && (
        <div className="mt-6">
          <ErrorState message={query.error.message} />
        </div>
      )}
      <div className="mt-6 space-y-3">
        {query.data?.map((member) => (
          <Card className="flex flex-wrap items-center justify-between gap-4 py-4" key={member.id}>
            <div>
              <p className="font-bold">
                {member.user.firstName} {member.user.lastName}
              </p>
              <p className="text-sm text-stone-600">
                {member.user.email ?? 'No email'} · {member.role.replaceAll('_', ' ')}
              </p>
            </div>
            <select
              aria-label={`Status for ${member.user.firstName}`}
              className="rounded-md border border-stone-300 px-3 py-2"
              value={member.status}
              onChange={(event) =>
                mutation.mutate({
                  id: member.id,
                  body: { status: event.target.value as UpdateOrganizationMembership['status'] },
                })
              }
            >
              {['ACTIVE', 'SUSPENDED', 'REMOVED'].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </Card>
        ))}
      </div>
    </Workspace>
  );
}

export function CollectionPoints({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: ['collection-points', organizationId],
    queryFn: () =>
      apiRequest<Paginated<CollectionPointListItem>>(
        `/organizations/${organizationId}/collection-points?pageSize=100`,
      ),
  });
  return (
    <Workspace
      organizationId={organizationId}
      title="Collection points"
      action={
        <Link
          className="rounded-md bg-emerald-700 px-4 py-3 font-semibold text-white"
          href={`/organizations/${organizationId}/collection-points/new`}
        >
          Add collection point
        </Link>
      }
    >
      {query.isLoading && <LoadingIndicator />}
      {query.error && <ErrorState message={query.error.message} />}
      <div className="grid gap-4 md:grid-cols-2">
        {query.data?.items.map((point) => (
          <Card key={point.id}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold">{point.name}</h2>
              <StatusBadge tone={point.status === 'ACTIVE' ? 'positive' : 'neutral'}>
                {point.status}
              </StatusBadge>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              {point.code} · {[point.district, point.subCounty].filter(Boolean).join(', ')}
            </p>
          </Card>
        ))}
      </div>
      {query.data?.items.length === 0 && (
        <EmptyState
          title="No collection points"
          description="Add the cooperative's first physical collection point."
        />
      )}
    </Workspace>
  );
}

export function NewCollectionPoint({ organizationId }: { organizationId: string }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CollectionPointInput, unknown, CreateCollectionPoint>({
    resolver: zodResolver(createCollectionPointSchema),
    defaultValues: {
      status: 'ACTIVE',
      timezone: 'Africa/Kampala',
      subCounty: null,
      parish: null,
      village: null,
      latitude: null,
      longitude: null,
    },
  });
  const submit = handleSubmit(async (values) => {
    try {
      await apiRequest<CollectionPointDetail>(
        `/organizations/${organizationId}/collection-points`,
        { method: 'POST', body: JSON.stringify(values) },
      );
      location.assign(`/organizations/${organizationId}/collection-points`);
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Creation failed' });
    }
  });
  return (
    <Workspace organizationId={organizationId} title="Add collection point">
      <Card className="max-w-3xl">
        <form className="grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          {[
            ['name', 'Name'],
            ['code', 'Code'],
            ['district', 'District'],
            ['subCounty', 'Sub-county'],
            ['parish', 'Parish'],
            ['village', 'Village'],
            ['latitude', 'Latitude'],
            ['longitude', 'Longitude'],
            ['timezone', 'Timezone'],
          ].map(([name, label]) => (
            <label className="font-semibold" key={name}>
              {label}
              <input className={fieldClass} {...register(name as keyof CollectionPointInput)} />
            </label>
          ))}
          <label className="font-semibold">
            Status
            <select className={fieldClass} {...register('status')}>
              {['ACTIVE', 'INACTIVE', 'CLOSED'].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          {errors.root && <p className="text-red-700 sm:col-span-2">{errors.root.message}</p>}
          <div className="sm:col-span-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Creating...' : 'Create collection point'}
            </Button>
          </div>
        </form>
      </Card>
    </Workspace>
  );
}
