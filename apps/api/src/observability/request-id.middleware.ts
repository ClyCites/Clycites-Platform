import { Injectable, type NestMiddleware } from '@nestjs/common';
import { createRequestId, REQUEST_ID_HEADER } from '@clycites/observability';
import type { NextFunction, Request, Response } from 'express';

import type { RequestWithId } from './request-context.js';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header(REQUEST_ID_HEADER)?.trim();
    const requestId = incoming && incoming.length <= 128 ? incoming : createRequestId();
    (request as RequestWithId).requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
