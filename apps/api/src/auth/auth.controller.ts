import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { loginRequestSchema } from '@clycites/contracts';
import type { Request, Response } from 'express';

import { parseWithSchema } from '../common/validation.js';
import { CurrentPrincipal } from '../identity/identity.decorators.js';
import { AuthGuard } from '../identity/auth.guard.js';
import type { AuthenticatedRequest, RequestWithId } from '../observability/request-context.js';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '../config/environment.js';
import { AuthService } from './auth.service.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: unknown,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      parseWithSchema(loginRequestSchema, body),
      this.details(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(@Req() request: RequestWithId, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(this.readRefreshCookie(request), this.details(request));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(
      this.readOptionalRefreshCookie(request),
      request.principal.subjectId,
      request.requestId,
    );
    this.clearRefreshCookie(response);
    return { loggedOut: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(request.principal.subjectId, request.requestId);
    this.clearRefreshCookie(response);
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  me(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.auth.currentUser(principal.subjectId);
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  sessions(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.auth.listSessions(principal.subjectId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async revoke(@Param('sessionId') sessionId: string, @Req() request: AuthenticatedRequest) {
    await this.auth.revokeSession(request.principal.subjectId, sessionId, request.requestId);
    return { revoked: true };
  }

  private details(request: RequestWithId) {
    return {
      requestId: request.requestId,
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    };
  }

  private readRefreshCookie(request: Request): string {
    const token = this.readOptionalRefreshCookie(request);
    if (!token) throw new UnauthorizedException('Refresh session required');
    return token;
  }

  private readOptionalRefreshCookie(request: Request): string | undefined {
    const name = this.config.get('AUTH_REFRESH_COOKIE_NAME', { infer: true });
    return request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(this.config.get('AUTH_REFRESH_COOKIE_NAME', { infer: true }), token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: this.config.get('AUTH_SESSION_TTL_DAYS', { infer: true }) * 86_400_000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.config.get('AUTH_REFRESH_COOKIE_NAME', { infer: true }), {
      path: '/api/v1/auth',
    });
  }
}
