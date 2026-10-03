import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../observability/request-context.js';

/** Account administration requires a browser session, never a field-device credential. */
@Injectable()
export class BrowserSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { principal } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!principal || principal.deviceId) throw new ForbiddenException('Browser session required');
    return true;
  }
}
