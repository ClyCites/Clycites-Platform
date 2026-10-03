'use client';
import * as contracts from '@clycites/contracts';
import { z } from 'zod';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { WorkflowForm, choices, type WorkflowField } from './ui/workflow-form';
import { RecordRegister, recordText, type RegisterRow } from './ui/record-register';
import { Button } from './ui/button';
import { ErrorState } from '@clycites/ui';
const text = (name: string, label: string, required = true): WorkflowField => ({
  name,
  label,
  required,
});
const select = (name: string, label: string, values: readonly string[]): WorkflowField => ({
  name,
  label,
  type: 'select',
  options: choices(values),
});
const scalarText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const list = (value: string) => value.split(/[\s,]+/).filter(Boolean);
export function PilotRegisters({
  pilotId,
  organizationId,
  readOnly,
  configuration,
}: {
  pilotId: string;
  organizationId: string;
  readOnly: boolean;
  configuration?: unknown;
}) {
  const client = useQueryClient();
  const [participantId, setParticipantId] = useState('');
  const [feedbackId, setFeedbackId] = useState('');
  const [assignment, setAssignment] = useState<RegisterRow>();
  const root = `/pilots/${pilotId}`;
  const existing =
    configuration && typeof configuration === 'object'
      ? (configuration as Record<string, unknown>)
      : {};
  const configValues: Record<string, unknown> = {
    allowedCommodityFormIds: [],
    enabledFeatureFlags: [],
    supportHours: {},
    incidentContacts: [],
    escalationPolicy: {},
  };
  for (const key of Object.keys(contracts.pilotConfigurationSchema.shape)) {
    if (existing[key] != null)
      configValues[key] =
        key.endsWith('Start') || key.endsWith('End')
          ? scalarText(existing[key]).slice(0, 10)
          : existing[key];
  }
  const configDefault = (field: WorkflowField): WorkflowField => {
    let value: unknown = configValues[field.name];
    if (field.name === 'escalationPolicy.contactInstructions')
      value = (configValues.escalationPolicy as Record<string, unknown>).contactInstructions;
    const defaultValue =
      field.name === 'supportHours' && value && typeof value === 'object'
        ? Object.entries(value)
            .map(([day, hours]) => `${day}: ${scalarText(hours)}`)
            .join('\n')
        : field.name === 'incidentContacts' && Array.isArray(value)
          ? value
              .map(
                (contact: { role: string; userId: string }) => `${contact.role}: ${contact.userId}`,
              )
              .join('\n')
          : Array.isArray(value)
            ? value.join(',')
            : value == null
              ? ''
              : scalarText(value);
    return { ...field, defaultValue };
  };
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['register'] });
    void client.invalidateQueries({ queryKey: ['pilot', pilotId] });
  };
  const participant = useQuery({
    queryKey: ['pilot-participant', pilotId, participantId],
    queryFn: () => apiRequest<RegisterRow>(`${root}/participants/${participantId}`),
    enabled: Boolean(participantId),
  });
  const feedback = useQuery({
    queryKey: ['pilot-feedback-detail', pilotId, feedbackId],
    queryFn: () => apiRequest<RegisterRow>(`${root}/feedback/${feedbackId}`),
    enabled: Boolean(feedbackId),
  });
  return (
    <div className="space-y-9">
      <div>
        <p className="ledger-kicker">Field deployment records</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">
          Pilot registers & configuration
        </h2>
      </div>
      <RecordRegister
        title="Participant register"
        path={`${root}/participants`}
        organizationId={organizationId}
        permission="pilot-participant.read"
        columns={[
          { key: 'participantType', title: 'Participant type' },
          { key: 'publicId', title: 'Reference' },
          { key: 'status', title: 'Status', status: true },
        ]}
        actions={(row) => (
          <Button variant="outline" size="sm" onClick={() => setParticipantId(row.id)}>
            Review participant
          </Button>
        )}
      />
      {participant.error && <ErrorState message={participant.error.message} />}
      {participant.data && !readOnly && (
        <WorkflowForm
          title={`Update participant · ${recordText(participant.data, 'participantType')}`}
          path={`${root}/participants/${participantId}`}
          method="PATCH"
          schema={contracts.updatePilotParticipantSchema}
          fields={[
            select('status', 'Participant status', [
              'ENROLLED',
              'ACTIVE',
              'SUSPENDED',
              'COMPLETED',
            ]),
          ]}
          permission="pilot-participant.update"
          organizationId={organizationId}
          onSuccess={() => {
            refresh();
            void participant.refetch();
          }}
        />
      )}
      {!readOnly && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <WorkflowForm
            title="Assign pilot collection point"
            path={`${root}/collection-points`}
            schema={contracts.assignPilotCollectionPointSchema}
            fields={[
              text('collectionPointId', 'Collection point ID'),
              text('readinessNotes', 'Readiness notes', false),
            ]}
            permission="pilot-participant.update"
            organizationId={organizationId}
            onSuccess={refresh}
          />
          <WorkflowForm
            title="Assign field device"
            path={`${root}/devices`}
            schema={contracts.assignPilotDeviceSchema}
            fields={[
              text('deviceId', 'Registered device ID'),
              text('assignedUserId', 'Agent user ID'),
              text('collectionPointId', 'Collection point ID'),
              text('conditionNotes', 'Device condition', false),
            ]}
            permission="pilot-participant.update"
            organizationId={organizationId}
            onSuccess={(data) => {
              if (data && typeof data === 'object' && 'id' in data)
                setAssignment(data as RegisterRow);
              refresh();
            }}
          />
          {assignment && (
            <WorkflowForm
              title="Update assigned device condition"
              path={`${root}/devices/${assignment.id}`}
              method="PATCH"
              schema={contracts.updatePilotDeviceStatusSchema}
              fields={[
                select('status', 'Assignment status', [
                  'ACTIVE',
                  'LOST',
                  'DAMAGED',
                  'RETURNED',
                  'REVOKED',
                ]),
                text('conditionNotes', 'Condition notes', false),
              ]}
              permission="pilot-participant.update"
              organizationId={organizationId}
              onSuccess={refresh}
            />
          )}
        </div>
      )}
      <RecordRegister
        title="Baseline measurements"
        path={`${root}/baselines`}
        organizationId={organizationId}
        permission="pilot-baseline.read"
        columns={[
          { key: 'metricCode', title: 'Metric' },
          { key: 'valueType', title: 'Type' },
          { key: 'decimalValue', title: 'Decimal' },
          { key: 'integerValue', title: 'Integer' },
          { key: 'textValue', title: 'Text' },
          { key: 'verifiedAt', title: 'Verified' },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        New baseline entry requires a backend schema correction: the strict metric schema rejects
        the measurement period and source fields.
      </p>
      <RecordRegister
        title="Metric observations"
        rowsKey="observations"
        path={`${root}/metrics`}
        organizationId={organizationId}
        permission="pilot-metric.read"
        columns={[
          { key: 'metricCode', title: 'Metric' },
          { key: 'decimalValue', title: 'Observed value' },
          { key: 'unit', title: 'Unit' },
          { key: 'status', title: 'Status', status: true },
          { key: 'periodEnd', title: 'Period end' },
        ]}
      />
      <RecordRegister
        title="Pilot feedback"
        path={`${root}/feedback`}
        organizationId={organizationId}
        permission="pilot-feedback.read"
        columns={[
          { key: 'category', title: 'Category' },
          { key: 'respondentType', title: 'Respondent' },
          { key: 'rating', title: 'Rating' },
          { key: 'status', title: 'Status', status: true },
          { key: 'submittedAt', title: 'Submitted' },
        ]}
        actions={(row) => (
          <Button variant="outline" size="sm" onClick={() => setFeedbackId(row.id)}>
            Review feedback
          </Button>
        )}
      />
      {feedback.error && <ErrorState message={feedback.error.message} />}
      {feedback.data && (
        <section className="ledger-surface space-y-4 p-5">
          <h3 className="font-semibold">Feedback detail</h3>
          <p className="text-sm">{recordText(feedback.data, 'message')}</p>
          {!readOnly && (
            <div className="grid items-start gap-3 md:grid-cols-2">
              <WorkflowForm
                title="Triage feedback"
                path={`${root}/feedback/${feedbackId}/triage`}
                schema={contracts.triagePilotFeedbackSchema}
                fields={[
                  select('status', 'Review status', ['TRIAGED', 'IN_REVIEW']),
                  text('assignedToUserId', 'Reviewer user ID', false),
                ]}
                permission="pilot-feedback.triage"
                organizationId={organizationId}
                onSuccess={refresh}
              />
              <WorkflowForm
                title="Resolve feedback"
                path={`${root}/feedback/${feedbackId}/resolve`}
                schema={contracts.resolvePilotFeedbackSchema}
                fields={[{ name: 'resolution', label: 'Resolution', type: 'textarea' }]}
                permission="pilot-feedback.resolve"
                organizationId={organizationId}
                onSuccess={refresh}
              />
            </div>
          )}
        </section>
      )}
      {!readOnly && (
        <>
          <WorkflowForm
            title="Generate evaluation report"
            path={`${root}/evaluation/generate`}
            schema={z.object({}).strict()}
            fields={[]}
            permission="pilot-evaluation.generate"
            organizationId={organizationId}
            submitLabel="Generate evaluation"
            onSuccess={() => {
              refresh();
              void client.invalidateQueries({ queryKey: ['pilot-evaluation', pilotId] });
            }}
          />
          <WorkflowForm
            title="Set pilot operating configuration"
            path={`${root}/configuration`}
            schema={contracts.pilotConfigurationSchema}
            permission="pilot.update"
            organizationId={organizationId}
            fields={[
              {
                ...text(
                  'allowedCommodityFormIds',
                  'Allowed commodity form IDs (comma separated)',
                  false,
                ),
                transform: list,
              },
              {
                ...text('enabledFeatureFlags', 'Enabled flag keys (comma separated)', false),
                transform: list,
              },
              {
                ...select('languages', 'Field languages', ['en-UG', 'lg-UG', 'en-UG,lg-UG']),
                transform: list,
              },
              {
                name: 'supportHours',
                label: 'Support hours (day: hours, one per line)',
                type: 'textarea' as const,
                required: false,
                transform: (value: string) =>
                  Object.fromEntries(
                    value
                      .split('\n')
                      .filter(Boolean)
                      .map((line) => {
                        const index = line.indexOf(':');
                        if (index < 0)
                          throw new Error(
                            'Enter each support day followed by a colon and its hours.',
                          );
                        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
                      }),
                  ),
              },
              ...[
                'baselinePeriodStart',
                'baselinePeriodEnd',
                'activeUsePeriodStart',
                'activeUsePeriodEnd',
                'evaluationPeriodStart',
                'evaluationPeriodEnd',
              ].map((name) => ({
                name,
                label: name.replace(/([A-Z])/g, ' $1'),
                type: 'date' as const,
              })),
              text('dataRetentionPolicyId', 'Retention policy ID', false),
              {
                name: 'offlineSnapshotLimit',
                label: 'Offline snapshot record limit',
                type: 'number' as const,
              },
              {
                name: 'maxSynchronizationBatch',
                label: 'Maximum synchronization batch',
                type: 'number' as const,
              },
              {
                name: 'incidentContacts',
                label: 'Incident contacts (role: user ID, one per line)',
                type: 'textarea' as const,
                required: false,
                transform: (value: string) =>
                  value
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => {
                      const [role, userId] = line.split(':').map((part) => part.trim());
                      return { role, userId };
                    }),
              },
              text(
                'escalationPolicy.contactInstructions',
                'Escalation contact instructions',
                false,
              ),
            ].map(configDefault)}
            values={configValues}
            onSuccess={refresh}
            submitLabel="Save complete configuration"
          />
          <p className="text-xs text-muted-foreground">
            Configuration saves replace the complete pilot configuration. Review every field before
            saving. Assignment history is unavailable because the backend exposes no list endpoint
            for pilot device or collection-point assignments.
          </p>
        </>
      )}
    </div>
  );
}
export function PublicPilotFeedback({ publicId }: { publicId: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Share your field experience</h1>
      <p className="text-muted-foreground">
        Your feedback helps the cooperative improve collection and farmer services.
      </p>
      <WorkflowForm
        title="Pilot feedback"
        path={`/public/pilots/${publicId}/feedback`}
        schema={contracts.submitPublicPilotFeedbackSchema}
        values={{ anonymous: true, consentToContact: false, channel: 'SELF_SERVICE' }}
        fields={[
          select('respondentType', 'Your role', contracts.pilotParticipantTypeSchema.options),
          select('category', 'Feedback category', contracts.pilotFeedbackCategorySchema.options),
          { name: 'rating', label: 'Rating (1–5)', type: 'number' as const, required: false },
          { name: 'message', label: 'Your experience', type: 'textarea' as const, required: false },
          select('language', 'Language', ['en-UG', 'lg-UG']),
        ]}
        submitLabel="Submit anonymous feedback"
        successMessage="Thank you. Your feedback has been received."
      />
    </div>
  );
}
