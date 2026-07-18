import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@clycites/auth';

export interface RequestWithId extends Request {
  requestId: string;
}

export interface AuthenticatedRequest extends RequestWithId {
  principal: AuthenticatedPrincipal;
}
