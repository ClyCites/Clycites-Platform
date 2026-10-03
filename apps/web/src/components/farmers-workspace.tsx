'use client';

import { FarmerIdentityLookup } from './farmer-identity-lookup';
import { FarmerAccount } from './farmer-account';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, ErrorState, LoadingIndicator, StatusBadge } from '@clycites/ui';
import {
  createFarmSchema,
  createFarmerSchema,
  grantConsentSchema,
  type CreateFarm,
  type CreateFarmer,
  type GrantConsent,
  type UpdateFarmStatus,
  type UpdateFarmerStatus,
} from '@clycites/contracts';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { DataTable } from './ui/data-table';
import { apiRequest } from '@/lib/api-client';
import type {
  ConsentRecord,
  FarmDetail,
  FarmerDetail,
  FarmerListItem,
  Paginated,
  QrIdentity,
} from '@/lib/domain-types';
import { PageHeader } from './ui/page-header';
import { ProtectedPage } from './protected-page';

const fieldClass =
  'mt-1 min-h-11 w-full rounded-md border border-border bg-card px-3 focus:border-primary focus:outline-2 focus:outline-ring';
type FarmerInput = z.input<typeof createFarmerSchema>;
type FarmInput = z.input<typeof createFarmSchema>;
type ConsentInput = z.input<typeof grantConsentSchema>;

function FarmerWorkspace({
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
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          className="text-sm font-semibold text-primary"
          href={`/organizations/${organizationId}/overview`}
        >
          ← Organization overview
        </Link>
        <div className="mt-5">
          <PageHeader eyebrow="Farmer records" title={title} action={action} />
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </ProtectedPage>
  );
}

export function FarmersList({ organizationId }: { organizationId: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['farmers', organizationId, search, status, page],
    queryFn: () =>
      apiRequest<Paginated<FarmerListItem>>(
        `/organizations/${organizationId}/farmers?page=${page}&pageSize=25&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`,
      ),
  });
  return (
    <FarmerWorkspace
      organizationId={organizationId}
      title="Farmers"
      action={
        <Link
          className="rounded-md bg-emerald-700 px-4 py-3 font-semibold text-white"
          href={`/organizations/${organizationId}/farmers/new`}
        >
          <FarmerIdentityLookup organizationId={organizationId} />
          Register farmer
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <label className="font-semibold">
          Search
          <input
            className={fieldClass}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Name or farmer number"
          />
        </label>
        <label className="font-semibold">
          Status
          <select
            className={fieldClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {['DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'DECEASED'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
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
      {query.data && query.data.items.length > 0 && (
        <div className="mt-6">
          <DataTable
            caption="Farmer directory"
            rows={query.data.items}
            pagination={query.data.pagination}
            onPageChange={setPage}
            columns={[
              {
                key: 'name',
                title: 'Farmer',
                render: (farmer) => (
                  <Link
                    className="font-semibold text-primary hover:underline"
                    href={`/organizations/${organizationId}/farmers/${farmer.id}`}
                  >
                    {farmer.displayName}
                  </Link>
                ),
              },
              {
                key: 'number',
                title: 'Farmer number',
                render: (farmer) => (
                  <span className="whitespace-nowrap font-mono text-xs">{farmer.farmerNumber}</span>
                ),
              },
              {
                key: 'membership',
                title: 'Membership',
                render: (farmer) => farmer.membershipNumber ?? '—',
              },
              {
                key: 'location',
                title: 'Location',
                render: (farmer) =>
                  [farmer.village, farmer.district].filter(Boolean).join(', ') || '—',
              },
              {
                key: 'status',
                title: 'Status',
                render: (farmer) => (
                  <StatusBadge
                    tone={
                      farmer.status === 'ACTIVE'
                        ? 'positive'
                        : farmer.status === 'SUSPENDED'
                          ? 'negative'
                          : 'neutral'
                    }
                  >
                    {farmer.status}
                  </StatusBadge>
                ),
              },
            ]}
          />
        </div>
      )}
      {query.data?.items.length === 0 && (
        <EmptyState
          title="No farmers found"
          description="Adjust the filter or register a farmer."
        />
      )}
    </FarmerWorkspace>
  );
}

export function NewFarmer({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FarmerInput, unknown, CreateFarmer>({
    resolver: zodResolver(createFarmerSchema),
    defaultValues: {
      issueQrIdentity: true,
      initialFarm: { areaUnit: 'ACRE' },
      initialConsents: [
        { consentType: 'DATA_PROCESSING', policyVersion: '1.0', captureMethod: 'CHECKBOX' },
      ],
    },
  });
  const submit = handleSubmit(async (values) => {
    try {
      const farmer = await apiRequest<FarmerDetail>(`/organizations/${organizationId}/farmers`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push(`/organizations/${organizationId}/farmers/${farmer.id}`);
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Registration failed' });
    }
  });
  return (
    <FarmerWorkspace organizationId={organizationId} title="Register farmer">
      <form className="space-y-6" onSubmit={(event) => void submit(event)}>
        <Card>
          <h2 className="text-lg font-bold">Identity and contact</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['farmerNumber', 'Farmer number'],
              ['membershipNumber', 'Membership number'],
              ['firstName', 'First name'],
              ['middleName', 'Middle name'],
              ['lastName', 'Last name'],
              ['preferredName', 'Preferred name'],
              ['primaryPhone', 'Primary phone'],
              ['alternativePhone', 'Alternative phone'],
              ['email', 'Email'],
              ['dateOfBirth', 'Date of birth'],
              ['district', 'District'],
              ['subCounty', 'Sub-county'],
              ['parish', 'Parish'],
              ['village', 'Village'],
            ].map(([name, label]) => (
              <label className="font-semibold" key={name}>
                {label}
                <input
                  className={fieldClass}
                  type={name === 'dateOfBirth' ? 'date' : 'text'}
                  {...register(name as keyof FarmerInput)}
                />
              </label>
            ))}
            <label className="font-semibold">
              Gender
              <select className={fieldClass} {...register('gender')}>
                <option value="">Not recorded</option>
                {['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Initial farm</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['initialFarm.name', 'Farm name'],
              ['initialFarm.district', 'District'],
              ['initialFarm.subCounty', 'Sub-county'],
              ['initialFarm.parish', 'Parish'],
              ['initialFarm.village', 'Village'],
              ['initialFarm.totalArea', 'Total area'],
              ['initialFarm.ownershipType', 'Ownership type'],
              ['initialFarm.waterSource', 'Water source'],
            ].map(([name, label]) => (
              <label className="font-semibold" key={name}>
                {label}
                <input className={fieldClass} {...register(name as 'initialFarm.name')} />
              </label>
            ))}
            <label className="font-semibold">
              Area unit
              <select className={fieldClass} {...register('initialFarm.areaUnit')}>
                <option>ACRE</option>
                <option>HECTARE</option>
              </select>
            </label>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Consent and QR identity</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            <label className="font-semibold">
              Policy version
              <input className={fieldClass} {...register('initialConsents.0.policyVersion')} />
            </label>
            <label className="font-semibold">
              Capture method
              <select className={fieldClass} {...register('initialConsents.0.captureMethod')}>
                {['CHECKBOX', 'DIGITAL_SIGNATURE', 'PAPER_FORM', 'VERBAL_WITNESSED'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label className="flex items-center gap-3 self-end py-3 font-semibold">
              <input className="size-5" type="checkbox" {...register('issueQrIdentity')} /> Issue
              opaque QR identity
            </label>
          </div>
        </Card>
        {Object.keys(errors).length > 0 && (
          <ErrorState
            title="Check the registration"
            message={errors.root?.message ?? 'One or more fields are incomplete or invalid.'}
          />
        )}
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Registering...' : 'Register farmer'}
        </Button>
      </form>
    </FarmerWorkspace>
  );
}

function QrCard({
  identity,
  onAction,
}: {
  identity: QrIdentity;
  onAction: (action: 'revoke' | 'replace') => void;
}) {
  const [image, setImage] = useState('');
  useEffect(() => {
    void QRCode.toDataURL(identity.payload, { width: 320, margin: 2 }).then(setImage);
  }, [identity.payload]);
  const download = () => {
    const link = document.createElement('a');
    link.href = image;
    link.download = `farmer-qr-${identity.publicId}.png`;
    link.click();
  };
  return (
    <Card className="break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge tone={identity.status === 'ACTIVE' ? 'positive' : 'neutral'}>
            {identity.status}
          </StatusBadge>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{identity.publicId}</p>
        </div>
        {image && (
          <Image
            className="size-40"
            src={image}
            width={160}
            height={160}
            unoptimized
            alt={`QR identity ${identity.publicId}`}
          />
        )}
      </div>
      {identity.status === 'ACTIVE' && (
        <div className="mt-4 flex flex-wrap gap-2 print:hidden">
          <Button onClick={download}>Download</Button>
          <Button
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button className="bg-amber-700 hover:bg-amber-800" onClick={() => onAction('replace')}>
            Replace
          </Button>
          <Button className="bg-red-700 hover:bg-red-800" onClick={() => onAction('revoke')}>
            Revoke
          </Button>
        </div>
      )}
    </Card>
  );
}

export function FarmerDetailView({
  organizationId,
  farmerId,
}: {
  organizationId: string;
  farmerId: string;
}) {
  const client = useQueryClient();
  const path = `/organizations/${organizationId}/farmers/${farmerId}`;
  const farmer = useQuery({
    queryKey: ['farmer', organizationId, farmerId],
    queryFn: () => apiRequest<FarmerDetail>(path),
  });
  const farms = useQuery({
    queryKey: ['farms', organizationId, farmerId],
    queryFn: () => apiRequest<FarmDetail[]>(`${path}/farms`),
  });
  const consents = useQuery({
    queryKey: ['consents', organizationId, farmerId],
    queryFn: () => apiRequest<ConsentRecord[]>(`${path}/consents`),
  });
  const identities = useQuery({
    queryKey: ['qr-identities', organizationId, farmerId],
    queryFn: () => apiRequest<QrIdentity[]>(`${path}/qr-identities`),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ['qr-identities', organizationId, farmerId] });
  const qrAction = async (identity: QrIdentity, action: 'revoke' | 'replace') => {
    await apiRequest(
      `${path}/qr-identities/${identity.id}/${action}`,
      action === 'replace' ? { method: 'POST', body: '{}' } : { method: 'POST' },
    );
    await refresh();
  };
  const setFarmerStatus = async (status: UpdateFarmerStatus['status']) => {
    await apiRequest(`${path}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await client.invalidateQueries({ queryKey: ['farmer', organizationId, farmerId] });
  };
  const setFarmStatus = async (farmId: string, status: UpdateFarmStatus['status']) => {
    await apiRequest(`${path}/farms/${farmId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await client.invalidateQueries({ queryKey: ['farms', organizationId, farmerId] });
  };
  const withdraw = async (consentId: string) => {
    await apiRequest(`${path}/consents/${consentId}/withdraw`, { method: 'POST', body: '{}' });
    await client.invalidateQueries({ queryKey: ['consents', organizationId, farmerId] });
  };
  const issueQrIdentity = async () => {
    await apiRequest(`${path}/qr-identities`, { method: 'POST', body: '{}' });
    await refresh();
  };
  return (
    <FarmerWorkspace
      organizationId={organizationId}
      title={farmer.data?.displayName ?? 'Farmer profile'}
      action={
        <Link
          className="rounded-md bg-emerald-700 px-4 py-3 font-semibold text-white"
          href={`${path}/farms/new`}
        >
          Add farm
        </Link>
      }
    >
      <FarmerAccount organizationId={organizationId} farmerId={farmerId} />
      {farmer.isLoading && <LoadingIndicator />}
      {farmer.error && <ErrorState message={farmer.error.message} />}
      {farmer.data && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm text-muted-foreground">
                  {farmer.data.farmerNumber}
                </p>
                <p className="mt-2">
                  {[farmer.data.village, farmer.data.subCounty, farmer.data.district]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {farmer.data.primaryPhone ?? 'No phone'} · {farmer.data.email ?? 'No email'}
                </p>
              </div>
              <select
                className="rounded-md border border-border px-3 py-2"
                value={farmer.data.status}
                onChange={(event) =>
                  void setFarmerStatus(event.target.value as UpdateFarmerStatus['status'])
                }
              >
                {['DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'DECEASED'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
          </Card>
          <section className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Farms</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {farms.data?.map((farm) => (
                <Card key={farm.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        className="font-bold text-primary underline"
                        href={`${path}/farms/${farm.id}`}
                      >
                        {farm.name}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {farm.totalArea} {farm.areaUnit.toLowerCase()} · {farm.district}
                      </p>
                    </div>
                    <select
                      className="rounded-md border border-border p-2 text-sm"
                      value={farm.status}
                      onChange={(event) =>
                        void setFarmStatus(
                          farm.id,
                          event.target.value as UpdateFarmStatus['status'],
                        )
                      }
                    >
                      {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                </Card>
              ))}
            </div>
          </section>
          <ConsentSection
            path={path}
            records={consents.data ?? []}
            refresh={() =>
              client.invalidateQueries({ queryKey: ['consents', organizationId, farmerId] })
            }
            withdraw={withdraw}
          />
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">QR identities</h2>
              {!identities.data?.some((identity) => identity.status === 'ACTIVE') && (
                <Button onClick={() => void issueQrIdentity()}>Issue QR identity</Button>
              )}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {identities.data?.map((identity) => (
                <QrCard
                  key={identity.id}
                  identity={identity}
                  onAction={(action) => void qrAction(identity, action)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </FarmerWorkspace>
  );
}

function ConsentSection({
  path,
  records,
  refresh,
  withdraw,
}: {
  path: string;
  records: ConsentRecord[];
  refresh: () => Promise<unknown>;
  withdraw: (id: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ConsentInput, unknown, GrantConsent>({
    resolver: zodResolver(grantConsentSchema),
    defaultValues: {
      consentType: 'DATA_PROCESSING',
      policyVersion: '1.0',
      captureMethod: 'CHECKBOX',
    },
  });
  const submit = handleSubmit(async (values) => {
    try {
      await apiRequest(`${path}/consents`, { method: 'POST', body: JSON.stringify(values) });
      reset();
      await refresh();
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Unable to record consent',
      });
    }
  });
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">Consent history</h2>
      <Card className="mt-4">
        <form
          className="grid gap-4 md:grid-cols-[1fr_10rem_1fr_auto]"
          onSubmit={(event) => void submit(event)}
        >
          <label className="font-semibold">
            Consent type
            <select className={fieldClass} {...register('consentType')}>
              {[
                'DATA_PROCESSING',
                'SMS_NOTIFICATIONS',
                'TRACEABILITY',
                'MARKETPLACE_VISIBILITY',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="font-semibold">
            Policy
            <input className={fieldClass} {...register('policyVersion')} />
          </label>
          <label className="font-semibold">
            Capture method
            <select className={fieldClass} {...register('captureMethod')}>
              {['CHECKBOX', 'DIGITAL_SIGNATURE', 'PAPER_FORM', 'VERBAL_WITNESSED'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Button className="self-end" type="submit">
            Record
          </Button>
          {errors.root && <p className="text-red-700 md:col-span-4">{errors.root.message}</p>}
        </form>
      </Card>
      <div className="mt-4 space-y-3">
        {records.map((record) => (
          <Card className="flex flex-wrap items-center justify-between gap-4 py-4" key={record.id}>
            <div>
              <p className="font-bold">{record.consentType.replaceAll('_', ' ')}</p>
              <p className="text-sm text-muted-foreground">
                Policy {record.policyVersion} · {record.captureMethod.replaceAll('_', ' ')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge tone={record.status === 'GRANTED' ? 'positive' : 'neutral'}>
                {record.status}
              </StatusBadge>
              {record.status === 'GRANTED' && (
                <Button
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  onClick={() => void withdraw(record.id)}
                >
                  Withdraw
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function NewFarm({
  organizationId,
  farmerId,
}: {
  organizationId: string;
  farmerId: string;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FarmInput, unknown, CreateFarm>({
    resolver: zodResolver(createFarmSchema),
    defaultValues: { areaUnit: 'ACRE' },
  });
  const submit = handleSubmit(async (values) => {
    try {
      await apiRequest(`/organizations/${organizationId}/farmers/${farmerId}/farms`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push(`/organizations/${organizationId}/farmers/${farmerId}`);
    } catch (error) {
      setError('root', {
        message: error instanceof Error ? error.message : 'Unable to create farm',
      });
    }
  });
  return (
    <FarmerWorkspace organizationId={organizationId} title="Add farm">
      <Card className="max-w-3xl">
        <form className="grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          {[
            ['name', 'Farm name'],
            ['district', 'District'],
            ['subCounty', 'Sub-county'],
            ['parish', 'Parish'],
            ['village', 'Village'],
            ['totalArea', 'Total area'],
            ['ownershipType', 'Ownership type'],
            ['waterSource', 'Water source'],
          ].map(([name, label]) => (
            <label className="font-semibold" key={name}>
              {label}
              <input className={fieldClass} {...register(name as keyof FarmInput)} />
            </label>
          ))}
          <label className="font-semibold">
            Area unit
            <select className={fieldClass} {...register('areaUnit')}>
              <option>ACRE</option>
              <option>HECTARE</option>
            </select>
          </label>
          {errors.root && <p className="text-red-700 sm:col-span-2">{errors.root.message}</p>}
          <div className="sm:col-span-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Creating...' : 'Create farm'}
            </Button>
          </div>
        </form>
      </Card>
    </FarmerWorkspace>
  );
}
