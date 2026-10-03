import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { reverseSaleProceedsSchema, createContractAmendmentSchema } from '@clycites/contracts';
import { apiRequest } from '@/lib/api-client';
import { WorkflowForm, minorAmount } from './workflow-form';
const auth = vi.hoisted((): {platformRole: string | undefined} => ({ platformRole: 'PLATFORM_ADMIN' }));
vi.mock('@/components/auth-provider', () => ({
  useAuth: () => ({ user: { platformRole: auth.platformRole, organizations: [] } }),
}));
vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  auth.platformRole = 'PLATFORM_ADMIN';
  vi.mocked(apiRequest).mockResolvedValue({});
});
const mount = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
describe('financial workflow validation', () => {
  it('converts amounts without floating point loss', () => {
    expect(minorAmount('9007199254740993.01')).toBe('900719925474099301');
    expect(minorAmount('0.05')).toBe('5');
    expect(minorAmount('123.4')).toBe('12340');
  });
  it('rejects negative amounts and excessive precision', () => {
    expect(() => minorAmount('-1')).toThrow();
    expect(() => minorAmount('1.001')).toThrow();
  });
  it('sends the backend version with the entered reversal reason', async () => {
    const view = mount(
      <WorkflowForm
        title="Reverse receipt"
        path="/finance/receipt/reverse"
        schema={reverseSaleProceedsSchema}
        fields={[{ name: 'reason', label: 'Reversal reason' }]}
        values={{ version: 3 }}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reversal reason'), {
      target: { value: 'Duplicate bank receipt' },
    });
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('/finance/receipt/reverse', {
        method: 'POST',
        body: JSON.stringify({ version: 3, reason: 'Duplicate bank receipt' }),
      }),
    );
  });
  it('does not call a write API when schema validation fails', () => {
    const view = mount(
      <WorkflowForm
        title="Version action"
        path="/finance/reverse"
        schema={reverseSaleProceedsSchema}
        fields={[{ name: 'reason', label: 'Reason' }]}
        values={{ version: 0 }}
      />,
    );
    fireEvent.submit(view.container.querySelector('form')!);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('version');
  });
  it('preserves nested contract changes rather than sending dotted keys', async () => {
    const view = mount(
      <WorkflowForm
        title="Amend agreement"
        path="/contracts/amendments"
        schema={createContractAmendmentSchema}
        fields={[
          { name: 'reason', label: 'Reason' },
          { name: 'proposedChanges.deliveryTerm', label: 'Delivery term' },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Buyer requested collection' },
    });
    fireEvent.change(screen.getByLabelText('Delivery term'), {
      target: { value: 'Warehouse pickup' },
    });
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('/contracts/amendments', {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Buyer requested collection',
          proposedChanges: { deliveryTerm: 'Warehouse pickup' },
        }),
      }),
    );
  });
  it('hides an action when the organization permission is absent', () => {
    auth.platformRole = undefined;
    mount(
      <WorkflowForm
        title="Approve payment"
        path="/payments/approve"
        permission="payment-instruction.approve"
        organizationId="cooperative-a"
        schema={z.object({})}
        fields={[]}
      />,
    );
    expect(screen.queryByText('Approve payment')).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
