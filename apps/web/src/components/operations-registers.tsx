'use client';

import { NotificationRetry } from './notification-retry';

import * as contracts from '@clycites/contracts';
import { z } from 'zod';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import { ProtectedPage } from './protected-page';
import { PageHeader } from './ui/page-header';
import { WorkflowForm, choices, type WorkflowField } from './ui/workflow-form';
import {
  RecordRegister,
  recordText,
  type RegisterColumn,
  type RegisterRow,
} from './ui/record-register';
import { Label } from './ui/label';
import { Select } from './ui/select';

const text = (name: string, label: string, required = true): WorkflowField => ({
  name,
  label,
  required,
});
const area = (name: string, label: string, required = true): WorkflowField => ({
  name,
  label,
  required,
  type: 'textarea',
});
const date = (name: string, label: string, required = true): WorkflowField => ({
  name,
  label,
  required,
  type: 'datetime-local',
});
const pick = (
  name: string,
  label: string,
  values: readonly string[],
  required = true,
): WorkflowField => ({ name, label, required, type: 'select', options: choices(values) });
const check = (name: string, label: string): WorkflowField => ({ name, label, type: 'checkbox' });
const number = (name: string, label: string, required = true): WorkflowField => ({
  name,
  label,
  required,
  type: 'number',
});
const columns = (...keys: string[]): RegisterColumn[] =>
  keys.map((key) => ({ key, title: key.replace(/([A-Z])/g, ' $1'), status: key === 'status' }));
const sections = ['Readiness', 'Incidents', 'Privacy', 'Retention', 'Backups', 'Flags'] as const;

export function OperationsRegisters() {
  const { user } = useAuth();
  const [dryRun, setDryRun] = useState<RegisterRow>();
  const [section, setSection] = useState<(typeof sections)[number]>('Readiness');
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['register'] });
    void client.invalidateQueries({ queryKey: ['operations-overview'] });
  };
  const form = (
    title: string,
    path: string,
    schema: z.ZodType,
    fields: WorkflowField[],
    values?: Record<string, unknown>,
  ) => (
    <WorkflowForm
      title={title}
      path={path}
      schema={schema}
      fields={fields}
      values={values ?? {}}
      onSuccess={refresh}
    />
  );
  return (
    <ProtectedPage>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
        <PageHeader
          eyebrow="Platform operations"
          title="Operational registers"
          description="Evidence, incidents, retention, and recovery records for field deployments."
          action={
            <Link href="/admin/operations" className="text-sm font-semibold text-primary underline">
              Operations overview
            </Link>
          }
        />
        {user?.platformRole !== 'PLATFORM_ADMIN' ? (
          <p>Platform administrator access is required.</p>
        ) : (
          <>
            <Label className="max-w-sm">
              Register
              <Select
                value={section}
                onChange={(event) => setSection(event.target.value as typeof section)}
              >
                {sections.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Label>
            {section === 'Readiness' && (
              <>
                <RecordRegister
                  title="Readiness gates"
                  path="/operations/readiness-gates"
                  columns={columns('code', 'name', 'category', 'status', 'blocking', 'riskLevel')}
                  actions={(row) => (
                    <WorkflowForm
                      title="Record review"
                      path={`/operations/readiness-gates/${row.id}/transitions`}
                      schema={contracts.transitionPilotReadinessGateSchema}
                      values={{ evidence: {} }}
                      fields={[
                        pick(
                          'status',
                          'Readiness status',
                          contracts.pilotReadinessStatusSchema.options,
                        ),
                        area('riskNotes', 'Review evidence and risk notes'),
                        date('nextReviewAt', 'Next review', false),
                      ]}
                      onSuccess={refresh}
                    />
                  )}
                />
                {form(
                  'Create readiness gate',
                  '/operations/readiness-gates',
                  contracts.createPilotReadinessGateSchema,
                  [
                    text('code', 'Gate code'),
                    text('name', 'Gate name'),
                    area('description', 'Description'),
                    pick('category', 'Category', contracts.pilotReadinessCategorySchema.options),
                    pick('riskLevel', 'Risk level', contracts.operationalRiskLevelSchema.options),
                    check('blocking', 'Blocks deployment'),
                    check('humanReviewRequired', 'Human review required'),
                    text('ownerUserId', 'Owner user ID', false),
                    date('nextReviewAt', 'Next review', false),
                  ],
                )}
              </>
            )}
            {section === 'Incidents' && (
              <>
                <NotificationRetry />
                <RecordRegister
                  title="Operational incidents"
                  path="/operations/incidents"
                  columns={columns(
                    'incidentNumber',
                    'title',
                    'category',
                    'severity',
                    'status',
                    'detectedAt',
                  )}
                  actions={(row) => (
                    <WorkflowForm
                      title="Update incident"
                      method="PATCH"
                      path={`/operations/incidents/${row.id}`}
                      schema={contracts.updateOperationalIncidentSchema}
                      fields={[
                        pick('status', 'Incident status', contracts.incidentStatusSchema.options),
                        text('ownerUserId', 'Owner user ID', false),
                        area('impactSummary', 'Impact summary', false),
                        area('rootCauseSummary', 'Root cause', false),
                        area('resolutionSummary', 'Resolution summary', false),
                      ]}
                      onSuccess={refresh}
                    />
                  )}
                />
                {form(
                  'Report incident',
                  '/operations/incidents',
                  contracts.createOperationalIncidentSchema,
                  [
                    text('title', 'Title'),
                    area('description', 'Description'),
                    pick('category', 'Category', contracts.incidentCategorySchema.options),
                    pick('severity', 'Severity', contracts.incidentSeveritySchema.options),
                    date('detectedAt', 'Detected at'),
                    text('organizationId', 'Affected organization ID', false),
                    text('ownerUserId', 'Owner user ID', false),
                    area('impactSummary', 'Impact summary', false),
                    text('externalReference', 'External reference', false),
                    check('restricted', 'Restricted incident'),
                  ],
                )}
              </>
            )}
            {section === 'Privacy' && (
              <>
                <RecordRegister
                  title="Privacy requests"
                  path="/operations/privacy-requests"
                  columns={columns(
                    'publicId',
                    'subjectType',
                    'requestType',
                    'status',
                    'submittedAt',
                  )}
                  actions={(row) => (
                    <WorkflowForm
                      title="Review privacy request"
                      method="PATCH"
                      path={`/operations/privacy-requests/${row.id}`}
                      schema={contracts.updateDataSubjectRequestSchema}
                      fields={[
                        pick(
                          'status',
                          'Request status',
                          contracts.dataSubjectRequestStatusSchema.options,
                        ),
                        text('assignedToUserId', 'Reviewer user ID', false),
                        {
                          name: 'identityVerified',
                          label: 'Identity verification',
                          type: 'select',
                          required: false,
                          options: [
                            { value: 'true', label: 'Verified' },
                            { value: 'false', label: 'Not verified' },
                          ],
                          transform: (value) => value === 'true',
                        },
                        area('rejectionReason', 'Rejection reason', false),
                        text('responseDocumentKey', 'Response document reference', false),
                        area('notes', 'Review notes', false),
                      ]}
                      onSuccess={refresh}
                    />
                  )}
                />
                <p className="text-sm text-muted-foreground">
                  Request creation is unavailable until the backend privacy-subject schema accepts
                  its combined subject and request fields. Existing requests can be reviewed here.
                </p>
              </>
            )}
            {section === 'Retention' && (
              <>
                <RecordRegister
                  title="Retention policies"
                  path="/operations/retention-policies"
                  columns={columns(
                    'dataCategory',
                    'policyVersion',
                    'retentionDays',
                    'deletionMode',
                    'status',
                  )}
                  actions={(row) => (
                    <WorkflowForm
                      title="Preview retention impact"
                      path={`/operations/retention-policies/${row.id}/dry-runs`}
                      schema={z.object({}).strict()}
                      fields={[]}
                      submitLabel="Run non-destructive preview"
                      onSuccess={(data) => {
                        refresh();
                        if (data && typeof data === 'object' && 'id' in data)
                          setDryRun(data as RegisterRow);
                      }}
                    />
                  )}
                />
                {dryRun && (
                  <div role="status" className="ledger-surface space-y-2 p-4">
                    <h3 className="font-semibold">Retention preview completed</h3>
                    <p className="text-sm">
                      Immutable audit records retained:{' '}
                      {recordText(dryRun, 'immutableRecordsRetained')}
                    </p>
                    <p className="text-sm">Cutoff: {recordText(dryRun, 'report.cutoff')}</p>
                    <p className="text-xs text-muted-foreground">
                      This preview does not delete or anonymize records.
                    </p>
                  </div>
                )}
                {form(
                  'Record retention policy',
                  '/operations/retention-policies',
                  contracts.createRetentionPolicySchema,
                  [
                    text('organizationId', 'Organization ID (blank for platform)', false),
                    text('dataCategory', 'Data category'),
                    number('retentionDays', 'Retention days'),
                    number('archiveAfterDays', 'Archive after days', false),
                    pick(
                      'deletionMode',
                      'Retention action',
                      contracts.retentionDeletionModeSchema.options,
                    ),
                    number('policyVersion', 'Policy version'),
                    { name: 'effectiveFrom', label: 'Effective from', type: 'date' },
                    {
                      name: 'effectiveTo',
                      label: 'Effective until',
                      type: 'date',
                      required: false,
                    },
                    check('legalHoldSupported', 'Supports legal hold'),
                  ],
                )}
              </>
            )}
            {section === 'Backups' && (
              <>
                <RecordRegister
                  title="Backup verifications"
                  path="/operations/backups"
                  columns={columns(
                    'backupType',
                    'environment',
                    'status',
                    'restoreStatus',
                    'startedAt',
                    'sizeBytes',
                  )}
                />
                {form(
                  'Record backup verification',
                  '/operations/backups',
                  contracts.recordBackupVerificationSchema,
                  [
                    text('backupType', 'Backup type'),
                    text('environment', 'Environment'),
                    text('backupReference', 'Backup reference'),
                    date('startedAt', 'Started at'),
                    date('completedAt', 'Completed at', false),
                    pick('status', 'Backup status', ['STARTED', 'COMPLETED', 'FAILED', 'VERIFIED']),
                    text('sizeBytes', 'Size in bytes', false),
                    check('encrypted', 'Encrypted'),
                    date('retentionUntil', 'Retain until', false),
                    date('restoreTestedAt', 'Restore tested at', false),
                    pick(
                      'restoreStatus',
                      'Restore test result',
                      ['NOT_TESTED', 'PASSED', 'FAILED'],
                      false,
                    ),
                    check('recoveryPointObjectiveMet', 'Recovery point objective met'),
                    check('recoveryTimeObjectiveMet', 'Recovery time objective met'),
                    area('notes', 'Evidence notes', false),
                  ],
                )}
              </>
            )}
            {section === 'Flags' && (
              <>
                <RecordRegister
                  title="Feature flags"
                  path="/operations/feature-flags"
                  columns={columns(
                    'key',
                    'scope',
                    'organizationId',
                    'enabled',
                    'highRisk',
                    'reason',
                  )}
                />
                {form(
                  'Set feature flag',
                  '/operations/feature-flags',
                  contracts.setFeatureFlagSchema,
                  [
                    text('key', 'Flag key'),
                    pick('scope', 'Scope', contracts.featureFlagScopeSchema.options),
                    text('organizationId', 'Organization ID (organization scope)', false),
                    check('enabled', 'Enabled'),
                    check('highRisk', 'High risk change'),
                    area('reason', 'Reason'),
                  ],
                )}
              </>
            )}
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
