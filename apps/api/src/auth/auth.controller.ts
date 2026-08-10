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
import {
  acceptUserInvitationSchema,
  emailVerificationConfirmSchema,
  deviceTokenRequestSchema,
  mfaChallengeVerificationSchema,
  loginRequestSchema,
  passwordChangeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@clycites/contracts';
import type { Request, Response } from 'express';

import { parseWithSchema } from '../common/validation.js';
import { CurrentPrincipal } from '../identity/identity.decorators.js';
import { AuthGuard } from '../identity/auth.guard.js';
import type { AuthenticatedRequest, RequestWithId } from '../observability/request-context.js';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '../config/environment.js';
import { AuthService } from './auth.service.js';
import { CredentialLifecycleService } from './credential-lifecycle.service.js';
import { MfaService } from './mfa.service.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CredentialLifecycleService) private readonly credentials: CredentialLifecycleService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(MfaService) private readonly mfa: MfaService,
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
    if ('mfaRequired' in result) return result;
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

  @Post('device/token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  deviceToken(@Body() body: unknown, @Req() request: RequestWithId) {
    return this.auth.deviceToken(
      parseWithSchema(deviceTokenRequestSchema, body),
      this.details(request),
    );
  }

  @Post('mfa/enroll')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  enrollMfa(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.mfa.beginEnrollment(principal.subjectId, principal.sessionId);
  }

  @Post('mfa/enroll/confirm')
  @HttpCode(200)
  confirmMfaEnrollment(@Body() body: unknown) {
    return this.mfa.confirmEnrollment(parseWithSchema(mfaChallengeVerificationSchema, body));
  }

  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Body() body: unknown,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.completeMfaLogin(
      parseWithSchema(mfaChallengeVerificationSchema, body),
      this.details(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user };
  }

  @Post('invitations/accept')
  @HttpCode(200)
  acceptInvitation(@Body() body: unknown, @Req() request: RequestWithId) {
    return this.credentials.acceptInvitation(
      parseWithSchema(acceptUserInvitationSchema, body),
      request.requestId,
    );
  }

  @Post('password-reset/request')
  @HttpCode(202)
  requestPasswordReset(@Body() body: unknown, @Req() request: RequestWithId) {
    return this.credentials.requestPasswordReset(
      parseWithSchema(passwordResetRequestSchema, body),
      this.details(request),
    );
  }

  @Post('password-reset/confirm')
  @HttpCode(200)
  confirmPasswordReset(@Body() body: unknown, @Req() request: RequestWithId) {
    return this.credentials.confirmPasswordReset(
      parseWithSchema(passwordResetConfirmSchema, body),
      request.requestId,
    );
  }

  @Post('password')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  changePassword(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.credentials.changePassword(
      request.principal.subjectId,
      request.principal.sessionId,
      parseWithSchema(passwordChangeSchema, body),
      request.requestId,
    );
  }

  @Post('email-verification/request')
  @HttpCode(202)
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  requestEmailVerification(@Req() request: AuthenticatedRequest) {
    return this.credentials.requestEmailVerification(
      request.principal.subjectId,
      request.requestId,
    );
  }

  @Post('email-verification/confirm')
  @HttpCode(200)
  confirmEmailVerification(@Body() body: unknown, @Req() request: RequestWithId) {
    const input = parseWithSchema(emailVerificationConfirmSchema, body);
    return this.credentials.confirmEmailVerification(input.token, request.requestId);
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
      secure: this.config.get('AUTH_REFRESH_COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('AUTH_REFRESH_COOKIE_SAME_SITE', { infer: true }),
      path: '/api',
      maxAge: this.config.get('AUTH_SESSION_TTL_DAYS', { infer: true }) * 86_400_000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.config.get('AUTH_REFRESH_COOKIE_NAME', { infer: true }), {
      path: '/api',
      secure: this.config.get('AUTH_REFRESH_COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('AUTH_REFRESH_COOKIE_SAME_SITE', { infer: true }),
    });
  }
}
