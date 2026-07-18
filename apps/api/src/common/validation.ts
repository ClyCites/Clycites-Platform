import { UnprocessableEntityException } from '@nestjs/common';
import type { z } from 'zod';

export const parseWithSchema = <T extends z.ZodType>(schema: T, value: unknown): z.output<T> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new UnprocessableEntityException({
      message: 'Request validation failed',
      details: result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      })),
    });
  }
  return result.data;
};
