import {
  apiSuccessSchema,
  healthDataSchema,
  type ApiSuccess,
  type HealthData,
} from '@clycites/contracts';
import { z } from 'zod';

const browserEnvironmentSchema = z.object({ NEXT_PUBLIC_API_BASE_URL: z.url() });

export class ApiUnavailableError extends Error {
  override name = 'ApiUnavailableError';
}

const getApiBaseUrl = (): string => {
  const result = browserEnvironmentSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
  if (!result.success) throw new Error('NEXT_PUBLIC_API_BASE_URL must be a valid URL');
  return result.data.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, '');
};

export const getApiHealth = async (): Promise<ApiSuccess<HealthData>> => {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/health`, {
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('NEXT_PUBLIC_API_BASE_URL')) throw error;
    throw new ApiUnavailableError('The API could not be reached');
  }
  if (!response.ok) throw new ApiUnavailableError(`The API returned HTTP ${response.status}`);
  return apiSuccessSchema(healthDataSchema).parse(await response.json());
};
