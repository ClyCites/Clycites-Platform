'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  updateFarmSchema,
  createFarmPlotSchema,
  farmLocationMethodSchema,
} from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import { RecordRegister, recordText, type RegisterRow } from './ui/record-register';
import { WorkflowForm, choices, useOrgPermission } from './ui/workflow-form';
import { ErrorState, LoadingIndicator } from '@clycites/ui';
import Link from 'next/link';
export function FarmDetailView({
  organizationId,
  farmerId,
  farmId,
}: {
  organizationId: string;
  farmerId: string;
  farmId: string;
}) {
  const can = useOrgPermission(organizationId);
  const client = useQueryClient();
  const root = `/organizations/${organizationId}/farmers/${farmerId}/farms/${farmId}`;
  const farm = useQuery({
    queryKey: ['farm-detail', root],
    queryFn: () => apiRequest<RegisterRow>(root),
    enabled: can('farm.read'),
  });
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Land & survey ledger"
          title={farm.data ? recordText(farm.data, 'name') : 'Farm detail'}
          description="Farm registration and surveyed plot boundaries."
          action={
            <Link
              className="text-primary underline"
              href={`/organizations/${organizationId}/farmers/${farmerId}`}
            >
              Farmer record
            </Link>
          }
        />
        {farm.isLoading && <LoadingIndicator label="Loading farm" />}
        {farm.error && <ErrorState message={farm.error.message} />}
        {!can('farm.read') && <p>Your role does not include farm access.</p>}
        {farm.data && (
          <>
            <dl className="grid gap-5 border-y border-border py-5 sm:grid-cols-3">
              {[
                'district',
                'village',
                'totalArea',
                'areaUnit',
                'ownershipType',
                'waterSource',
                'status',
              ].map((field) => (
                <div key={field}>
                  <dt className="ledger-kicker">{field.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd className="mt-1 font-semibold">{recordText(farm.data, field)}</dd>
                </div>
              ))}
            </dl>
            <WorkflowForm
              title="Update farm registration"
              path={root}
              method="PATCH"
              schema={updateFarmSchema}
              permission="farm.update"
              organizationId={organizationId}
              fields={[
                'name',
                'district',
                'subCounty',
                'parish',
                'village',
                'ownershipType',
                'waterSource',
              ].map((name) => ({
                name,
                label: name.replace(/([A-Z])/g, ' $1'),
                required: false,
                defaultValue:
                  recordText(farm.data, name) === '—' ? '' : recordText(farm.data, name),
              }))}
              submitLabel="Save farm details"
              onSuccess={() => void farm.refetch()}
            />
            <RecordRegister
              title="Surveyed farm plots"
              path={`${root}/plots`}
              organizationId={organizationId}
              permission="farm.read"
              columns={[
                { key: 'plotNumber', title: 'Plot' },
                { key: 'computedHectares', title: 'Area (ha)' },
                { key: 'surveyMethod', title: 'Survey method' },
                { key: 'vertexCount', title: 'Vertices' },
                { key: 'surveyedAt', title: 'Surveyed' },
                { key: 'areaDiscrepancyFlagged', title: 'Area discrepancy' },
              ]}
            />
            <WorkflowForm
              title="Record surveyed plot"
              path={`${root}/plots`}
              schema={createFarmPlotSchema}
              permission="farm.create"
              organizationId={organizationId}
              fields={[
                { name: 'plotNumber', label: 'Plot reference' },
                {
                  name: 'surveyMethod',
                  label: 'Survey method',
                  type: 'select',
                  options: choices(farmLocationMethodSchema.options),
                },
                {
                  name: 'surveyAccuracyMeters',
                  label: 'Survey accuracy (m)',
                  type: 'number',
                  required: false,
                },
                { name: 'surveyedAt', label: 'Surveyed at', type: 'datetime-local' },
                {
                  name: 'boundary',
                  label: 'Boundary vertices (latitude, longitude — one pair per line)',
                  type: 'textarea',
                  description:
                    'Enter at least three different corners in boundary order. The closing vertex is added automatically. Coordinates must be within Uganda.',
                  transform: (value) => {
                    const points = value
                      .split('\n')
                      .filter((line) => line.trim())
                      .map((line) => {
                        const pair = line.split(',').map((part) => Number(part.trim()));
                        if (pair.length !== 2 || !pair.every(Number.isFinite))
                          throw new Error('Each boundary line must contain latitude, longitude.');
                        return [pair[1]!, pair[0]!];
                      });
                    if (points.length < 3) throw new Error('Enter at least three plot corners.');
                    const first = points[0]!;
                    const last = points[points.length - 1]!;
                    if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
                    return { type: 'Polygon', coordinates: [points] };
                  },
                },
              ]}
              submitLabel="Save surveyed plot"
              onSuccess={() =>
                void client.invalidateQueries({ queryKey: ['register', `${root}/plots`] })
              }
            />
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
