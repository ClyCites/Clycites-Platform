import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import VerificationPage from './page';
vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));
describe('verification page', () => {
  it('requests published evidence using the public ID and reports an unavailable record honestly', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('No published record found'));
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {await VerificationPage({ params: Promise.resolve({ publicId: 'coffee-lot-public-42' }) })}
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Traceability record unavailable')).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith('/traceability/lots/coffee-lot-public-42');
    expect(screen.getByRole('button', { name: 'Retry lookup' })).toBeInTheDocument();
  });
});
