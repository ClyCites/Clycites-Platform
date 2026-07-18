'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, ErrorState, LoadingIndicator, StatusBadge } from '@clycites/ui';
import { createOrganizationSchema, type CreateOrganization } from '@clycites/contracts';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { apiRequest } from '@/lib/api-client';
import type { OrganizationDetail, OrganizationListItem } from '@/lib/domain-types';
import { ProtectedPage } from './protected-page';

const fieldClass =
  'mt-1 min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 focus:border-leaf-700 focus:outline-2 focus:outline-leaf-700';
type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

export function OrganizationsAdmin() {
  const query = useQuery({
    queryKey: ['organizations'],
    queryFn: () => apiRequest<OrganizationListItem[]>('/organizations'),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-leaf-700">PLATFORM ADMINISTRATION</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-leaf-900">Organizations</h1>
          </div>
          <Link
            className="rounded-md bg-emerald-700 px-4 py-3 font-semibold text-white"
            href="/admin/organizations/new"
          >
            Create organization
          </Link>
        </div>
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
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {query.data?.map((organization) => (
            <Link key={organization.id} href={`/admin/organizations/${organization.id}`}>
              <Card className="h-full hover:border-leaf-700">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold">{organization.name}</h2>
                  <StatusBadge tone={organization.status === 'ACTIVE' ? 'positive' : 'warning'}>
                    {organization.status}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-stone-600">
                  {organization.type.replaceAll('_', ' ')} ·{' '}
                  {organization.district ?? 'District not set'}
                </p>
              </Card>
            </Link>
          ))}
        </div>
        {query.data?.length === 0 && (
          <EmptyState
            title="No organizations"
            description="Create the first organization to begin onboarding staff and farmers."
          />
        )}
      </div>
    </ProtectedPage>
  );
}

export function NewOrganizationForm() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateOrganizationInput, unknown, CreateOrganization>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      type: 'COOPERATIVE',
      status: 'ACTIVE',
      registrationNumber: null,
      phone: null,
      email: null,
      district: null,
      subCounty: null,
      address: null,
    },
  });
  const mutation = useMutation({
    mutationFn: (values: CreateOrganization) =>
      apiRequest<OrganizationDetail>('/organizations', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
      location.assign('/admin/organizations');
    },
  });
  const submit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Creation failed' });
    }
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm font-bold text-leaf-700">PLATFORM ADMINISTRATION</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-leaf-900">Create organization</h1>
        <Card className="mt-8">
          <form className="grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
            {[
              ['name', 'Name'],
              ['slug', 'Slug'],
              ['registrationNumber', 'Registration number'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['district', 'District'],
              ['subCounty', 'Sub-county'],
              ['address', 'Address'],
            ].map(([name, label]) => (
              <label key={name} className="font-semibold text-stone-800">
                {label}
                <input
                  className={fieldClass}
                  {...register(name as keyof CreateOrganizationInput)}
                />
                {errors[name as keyof CreateOrganizationInput]?.message && (
                  <span className="mt-1 block text-sm text-red-700">
                    {String(errors[name as keyof CreateOrganizationInput]?.message)}
                  </span>
                )}
              </label>
            ))}
            <label className="font-semibold text-stone-800">
              Type
              <select className={fieldClass} {...register('type')}>
                {['COOPERATIVE', 'BUYER', 'PROCESSOR', 'EXPORTER', 'LOGISTICS_PROVIDER'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label className="font-semibold text-stone-800">
              Status
              <select className={fieldClass} {...register('status')}>
                {['ACTIVE', 'PENDING', 'SUSPENDED', 'ARCHIVED'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {errors.root && (
              <p className="sm:col-span-2 text-red-700" role="alert">
                {errors.root.message}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create organization'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </ProtectedPage>
  );
}

export function OrganizationAdminDetail({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => apiRequest<OrganizationDetail>(`/organizations/${organizationId}`),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {query.isLoading && <LoadingIndicator />}
        {query.error && <ErrorState message={query.error.message} />}
        {query.data && (
          <>
            <p className="text-sm font-bold text-leaf-700">PLATFORM ORGANIZATION</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-display text-3xl font-bold text-leaf-900">{query.data.name}</h1>
              <StatusBadge tone={query.data.status === 'ACTIVE' ? 'positive' : 'warning'}>
                {query.data.status}
              </StatusBadge>
            </div>
            <Card className="mt-8 grid gap-5 sm:grid-cols-2">
              {Object.entries({
                Type: query.data.type,
                Slug: query.data.slug,
                Registration: query.data.registrationNumber,
                District: query.data.district,
                'Sub-county': query.data.subCounty,
                Phone: query.data.phone,
                Email: query.data.email,
                Address: query.data.address,
              }).map(([label, value]) => (
                <div key={label}>
                  <p className="text-sm font-semibold text-stone-500">{label}</p>
                  <p className="mt-1">{value ?? 'Not set'}</p>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
