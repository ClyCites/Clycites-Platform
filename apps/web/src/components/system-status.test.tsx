import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@/lib/api-client';
import { ApiUnavailableError, getApiHealth } from '@/lib/api-client';
import { SystemStatus } from './system-status';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const original = await importOriginal<typeof ApiClient>();
  return { ...original, getApiHealth: vi.fn() };
});

const mockedHealth = vi.mocked(getApiHealth);
const renderStatus = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SystemStatus />
    </QueryClientProvider>,
  );

describe('system status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows loading', () => {
    mockedHealth.mockReturnValue(new Promise(() => undefined));
    renderStatus();
    expect(screen.getByText('Checking API availability')).toBeInTheDocument();
  });

  it('shows online after a successful health response', async () => {
    mockedHealth.mockResolvedValue({
      data: { status: 'ok' },
      meta: { requestId: '1', timestamp: '2026-01-01T00:00:00.000Z' },
    });
    renderStatus();
    expect(await screen.findByText('API online')).toBeInTheDocument();
  });

  it('shows unavailable for a transport failure', async () => {
    mockedHealth.mockRejectedValue(new ApiUnavailableError('offline'));
    renderStatus();
    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
  });

  it('shows request error for an invalid response', async () => {
    mockedHealth.mockRejectedValue(new Error('invalid response'));
    renderStatus();
    expect(await screen.findByText('Request error')).toBeInTheDocument();
  });
});
