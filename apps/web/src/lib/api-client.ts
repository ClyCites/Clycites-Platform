import {
  type ApiError,
  apiSuccessSchema,
  healthDataSchema,
  type ApiSuccess,
  type HealthData,
  type LoginRequest,
  type LoginResponse,
} from '@clycites/contracts';
import { z } from 'zod';

const browserEnvironmentSchema = z.object({ NEXT_PUBLIC_API_BASE_URL: z.url() });
const requestTimeoutMs = 15_000;
let accessToken: string | undefined;
let refreshPromise: Promise<LoginResponse | undefined> | undefined;

export class ApiUnavailableError extends Error {
  override name = 'ApiUnavailableError';
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'REQUEST_FAILED',
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

const getApiBaseUrl = (): string => {
  const result = browserEnvironmentSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
  if (!result.success) throw new Error('NEXT_PUBLIC_API_BASE_URL must be a valid URL');
  return result.data.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, '');
};

const requestSignal = (signal?: AbortSignal | null): AbortSignal =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])
    : AbortSignal.timeout(requestTimeoutMs);

export const setAccessToken = (token?: string): void => {
  accessToken = token;
};

const parseError = async (response: Response): Promise<ApiRequestError> => {
  const body = (await response.json().catch(() => undefined)) as ApiError | undefined;
  return new ApiRequestError(
    body?.error.message ?? `Request failed with HTTP ${response.status}`,
    response.status,
    body?.error.code,
    body?.error.details,
  );
};

const refreshSession = async (): Promise<LoginResponse | undefined> => {
  refreshPromise ??= fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { accept: 'application/json' },
    signal: requestSignal(),
  })
    .then(async (response) => {
      if (!response.ok) {
        accessToken = undefined;
        return undefined;
      }
      const body = (await response.json()) as ApiSuccess<LoginResponse>;
      accessToken = body.data.accessToken;
      return body.data;
    })
    .finally(() => {
      refreshPromise = undefined;
    });
  return refreshPromise;
};

export const apiRequest = async <T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      signal: requestSignal(init.signal),
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiUnavailableError('The API could not be reached');
  }
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return apiRequest<T>(path, init, false);
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as ApiSuccess<T>;
  return body.data;
};

export const login = async (input: LoginRequest): Promise<LoginResponse> => {
  const data = await apiRequest<LoginResponse>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify(input) },
    false,
  );
  accessToken = data.accessToken;
  return data;
};

export const restoreSession = refreshSession;

export const logout = async (): Promise<void> => {
  try {
    await apiRequest('/auth/logout', { method: 'POST' }, false);
  } finally {
    accessToken = undefined;
  }
};

export const getApiHealth = async (): Promise<ApiSuccess<HealthData>> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/health`, {
      headers: { accept: 'application/json' },
      signal: requestSignal(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('NEXT_PUBLIC_API_BASE_URL')) throw error;
    throw new ApiUnavailableError('The API could not be reached');
  }
  if (!response.ok) throw new ApiUnavailableError(`The API returned HTTP ${response.status}`);
  return apiSuccessSchema(healthDataSchema).parse(await response.json());
};
