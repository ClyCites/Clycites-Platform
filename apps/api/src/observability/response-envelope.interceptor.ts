import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { ApiSuccess } from '@clycites/contracts';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import type { RequestWithId } from './request-context.js';

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: { requestId: request.requestId, timestamp: new Date().toISOString() },
      })),
    );
  }
}
