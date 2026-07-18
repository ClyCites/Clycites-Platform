import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from '../auth/auth.service.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.bearerToken(request);
    if (!token) throw new UnauthorizedException('Authentication required');
    request.principal = await this.auth.authenticateAccessToken(token);
    return true;
  }

  private bearerToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
