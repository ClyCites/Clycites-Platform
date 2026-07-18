import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { RequestWithId } from './request-context.js';

interface HttpErrorBody {
  message?: string | string[];
  error?: string;
  code?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const normalized =
      typeof body === 'object' && body !== null ? (body as HttpErrorBody) : undefined;
    const messages = Array.isArray(normalized?.message) ? normalized.message : undefined;
    const message =
      messages?.join('; ') ??
      (typeof normalized?.message === 'string' ? normalized.message : undefined) ??
      (typeof body === 'string' ? body : undefined) ??
      (status === 500 ? 'Internal server error' : 'Request failed');

    response.status(status).json({
      error: {
        code: normalized?.code ?? this.errorCode(status),
        message,
        details: messages ?? null,
      },
      meta: {
        requestId: request.requestId ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  }

  private errorCode(status: number): string {
    if (status === 400) return 'VALIDATION_FAILED';
    if (status === 401) return 'AUTHENTICATION_REQUIRED';
    if (status === 403) return 'PERMISSION_DENIED';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 422) return 'VALIDATION_FAILED';
    if (status === 429) return 'RATE_LIMITED';
    if (status === 503) return 'DEPENDENCY_UNAVAILABLE';
    return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
}
