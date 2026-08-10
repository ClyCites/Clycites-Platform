import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = {
  accessToken: 'access-token-1',
  expiresIn: 900,
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'staff@example.com',
    phone: null,
    firstName: 'Amina',
    lastName: 'Nabirye',
    status: 'ACTIVE',
    platformRole: null,
    organizations: [],
  },
};

describe('api client session handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
  });

  it('keeps the access token in module memory and sends it as a bearer token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: session }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'organization-1' } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest, login } = await import('./api-client');

    await login({ identifier: 'staff@example.com', password: 'valid-password' });
    await apiRequest('/organizations/organization-1');

    const organizationRequest = fetchMock.mock.calls[1];
    expect(organizationRequest?.[0]).toBe(
      'http://localhost:4000/api/v1/organizations/organization-1',
    );
    expect(organizationRequest?.[1]?.credentials).toBe('include');
    expect(organizationRequest?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(organizationRequest?.[1]?.headers).get('authorization')).toBe(
      'Bearer access-token-1',
    );
    expect(localStorage).toHaveLength(0);
  });

  it('refreshes once after a 401 and retries with the rotated access token', async () => {
    const rotatedSession = { ...session, accessToken: 'access-token-2' };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: rotatedSession }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'organization-1' }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('./api-client');

    await expect(apiRequest('/organizations')).resolves.toEqual([{ id: 'organization-1' }]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const refreshRequest = fetchMock.mock.calls[1];
    expect(refreshRequest?.[0]).toBe('http://localhost:4000/api/v1/auth/refresh');
    expect(refreshRequest?.[1]?.method).toBe('POST');
    expect(refreshRequest?.[1]?.credentials).toBe('include');
    const retriedRequest = fetchMock.mock.calls[2];
    expect(retriedRequest?.[0]).toBe('http://localhost:4000/api/v1/organizations');
    expect(new Headers(retriedRequest?.[1]?.headers).get('authorization')).toBe(
      'Bearer access-token-2',
    );
  });
});
