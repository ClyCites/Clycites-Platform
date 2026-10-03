import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSecurity } from './account-security';

const mocks = vi.hoisted(() => ({
  enabled: false,
  apiRequest: vi.fn(),
  confirmMfaEnrollment: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  apiRequest: mocks.apiRequest,
  confirmMfaEnrollment: mocks.confirmMfaEnrollment,
}));
vi.mock('./auth-provider', () => ({
  useAuth: () => ({
    user: { platformRole: 'PLATFORM_ADMIN', organizations: [] },
    signOutAll: vi.fn(),
  }),
}));
vi.mock('./protected-page', () => ({
  ProtectedPage: ({ children }: { children: ReactNode }) => children,
}));
const setup = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccountSecurity />
    </QueryClientProvider>,
  );

afterEach(cleanup);
beforeEach(() => {
  mocks.enabled = false;
  mocks.apiRequest.mockReset();
  mocks.confirmMfaEnrollment.mockReset();
  mocks.apiRequest.mockImplementation((path: string) => {
    if (path === '/auth/me')
      return Promise.resolve({
        firstName: 'Account',
        lastName: 'Owner',
        email: 'owner@test.local',
        mfaEnabled: mocks.enabled,
      });
    if (path === '/auth/sessions') return Promise.resolve([]);
    if (path === '/auth/mfa/enroll')
      return Promise.resolve({
        challengeToken: 'test-challenge',
        secret: 'test-setup-secret',
        uri: 'otpauth://test',
        expiresAt: '2026-10-03T12:05:00Z',
      });
    return Promise.reject(new Error(`Unexpected API route ${path}`));
  });
  mocks.confirmMfaEnrollment.mockImplementation(() => {
    mocks.enabled = true;
    return Promise.resolve({ recoveryCodes: ['one-time-code-a', 'one-time-code-b'] });
  });
});

describe('account authenticator operations', () => {
  it('shows existing enrollment rather than offering a setup that would fail', async () => {
    mocks.enabled = true;
    setup();
    expect(await screen.findByText('Authenticator sign-in is enabled.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Set up authenticator' })).not.toBeInTheDocument();
  });
  it('confirms the entered code, refreshes enrollment state and lets the user dismiss recovery codes', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
    const code = await screen.findByLabelText('Authenticator code');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm setup' }).closest('form')!);
    expect(await screen.findByText('one-time-code-a')).toBeVisible();
    expect(mocks.confirmMfaEnrollment).toHaveBeenCalledWith('test-challenge', '123456');
    expect(await screen.findByText('Authenticator sign-in is enabled.')).toBeVisible();
    expect(screen.queryByDisplayValue('test-setup-secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I have saved my codes' }));
    await waitFor(() => expect(screen.queryByText('one-time-code-a')).not.toBeInTheDocument());
  });
  it('allows a fresh setup after an expired challenge without keeping the old setup key', async () => {
    mocks.confirmMfaEnrollment.mockRejectedValue(new Error('Invalid MFA challenge'));
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
    fireEvent.change(await screen.findByLabelText('Authenticator code'), {
      target: { value: '123456' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm setup' }).closest('form')!);
    expect(await screen.findByText('Invalid MFA challenge')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(await screen.findByRole('button', { name: 'Set up authenticator' })).toBeVisible();
    expect(screen.queryByDisplayValue('test-setup-secret')).not.toBeInTheDocument();
  });
});
