'use client';
import { z } from 'zod';
import {
  deliveryVersionCommandSchema,
  reweighDeliverySchema,
  confirmDeliverySchema,
  rejectDeliverySchema,
  confirmationMethodSchema,
  confirmationStatusSchema,
} from '@clycites/contracts';
import Link from 'next/link';
import { WorkflowForm, choices } from './ui/workflow-form';
export function DeliveryActions({
  organizationId,
  delivery,
  onSuccess,
}: {
  organizationId: string;
  delivery: { id: string; lockVersion: number; status: string };
  onSuccess: () => void;
}) {
  const root = `/organizations/${organizationId}/deliveries/${delivery.id}`;
  const values = { lockVersion: delivery.lockVersion };
  return (
    <section className="mt-6 space-y-4 border-t border-border pt-5">
      <h2 className="font-display text-xl font-semibold">Delivery desk actions</h2>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {delivery.status === 'DRAFT' && (
          <WorkflowForm
            title="Submit draft delivery"
            path={`${root}/submit`}
            schema={deliveryVersionCommandSchema}
            values={values}
            fields={[]}
            permission="delivery.submit"
            organizationId={organizationId}
            onSuccess={onSuccess}
            submitLabel="Submit for confirmation"
          />
        )}
        {['DRAFT', 'SUBMITTED', 'PENDING_CONFIRMATION'].includes(delivery.status) && (
          <>
            <WorkflowForm
              title="Record new weight measurement"
              path={`${root}/measurements/weight`}
              schema={reweighDeliverySchema}
              values={{
                ...values,
                weight: { mode: 'DIRECT_NET', unit: 'KG', captureMethod: 'MANUAL' },
              }}
              fields={[
                { name: 'weight.netQuantity', label: 'Net quantity (kg)' },
                { name: 'capturedAt', label: 'Measurement time', type: 'datetime-local' },
                { name: 'weight.instrumentId', label: 'Registered scale ID', required: false },
              ]}
              permission="delivery.record"
              organizationId={organizationId}
              onSuccess={onSuccess}
              submitLabel="Record superseding weight"
            />
            <WorkflowForm
              title="Reject delivery"
              path={`${root}/reject`}
              schema={rejectDeliverySchema}
              values={values}
              fields={[{ name: 'reason', label: 'Reason for rejection', type: 'textarea' }]}
              permission="delivery.reject"
              organizationId={organizationId}
              onSuccess={onSuccess}
              submitLabel="Reject delivery"
            />
          </>
        )}
        {['SUBMITTED', 'PENDING_CONFIRMATION'].includes(delivery.status) && (
          <WorkflowForm
            title="Record farmer confirmation"
            path={`${root}/confirm`}
            schema={confirmDeliverySchema}
            values={values}
            fields={[
              {
                name: 'confirmation.method',
                label: 'Confirmation method',
                type: 'select',
                options: choices(confirmationMethodSchema.options),
              },
              {
                name: 'confirmation.status',
                label: 'Farmer decision',
                type: 'select',
                options: choices(confirmationStatusSchema.options),
              },
              {
                name: 'confirmation.confirmedByName',
                label: 'Confirming farmer name',
                required: false,
              },
              {
                name: 'confirmation.confirmationReference',
                label: 'Acknowledgement reference',
                required: false,
              },
              {
                name: 'confirmation.confirmedAt',
                label: 'Confirmation time',
                type: 'datetime-local',
              },
            ]}
            permission="delivery.confirm"
            organizationId={organizationId}
            onSuccess={onSuccess}
            submitLabel="Record farmer decision"
          />
        )}
        {delivery.status === 'SUBMITTED' && (
          <WorkflowForm
            title="Accept confirmed delivery"
            path={`${root}/accept`}
            schema={deliveryVersionCommandSchema}
            values={values}
            fields={[]}
            permission="delivery.accept"
            organizationId={organizationId}
            onSuccess={onSuccess}
            submitLabel="Accept delivery"
          />
        )}
        {delivery.status === 'ACCEPTED' && (
          <WorkflowForm
            title="Record receipt reprint"
            path={`${root}/receipt/reprint`}
            schema={z.object({}).strict()}
            fields={[]}
            permission="delivery-receipt.reprint"
            organizationId={organizationId}
            successMessage="Receipt reprint recorded. Open the printable receipt below."
            submitLabel="Record reprint"
          >
            <Link href={`${root}/receipt`} className="text-sm text-primary underline">
              Open printable receipt
            </Link>
          </WorkflowForm>
        )}
      </div>
    </section>
  );
}
