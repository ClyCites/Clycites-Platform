import { randomUUID } from 'node:crypto';

import pino, { type Logger, type LoggerOptions } from 'pino';

export const REQUEST_ID_HEADER = 'x-request-id';

export const createRequestId = (): string => randomUUID();

export interface LogContext {
  application: string;
  environment: string;
  requestId?: string;
  organizationId?: string;
  userId?: string;
}

const sensitivePaths = [
  'password',
  '*.password',
  'authorization',
  'headers.authorization',
  'token',
  '*.token',
  'otp',
  '*.otp',
  'phone',
  '*.phone',
  'phoneNumber',
  '*.phoneNumber',
  'paymentAccountId',
  '*.paymentAccountId',
  'privateKey',
  '*.privateKey',
];

export const createLogger = (context: LogContext, level = 'info'): Logger => {
  const options: LoggerOptions = {
    base: context,
    level,
    redact: { paths: sensitivePaths, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return pino(options);
};
