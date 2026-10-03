import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { BrowserSessionGuard } from '../identity/browser-session.guard.js';

describe('credential endpoint guard coverage', () => {
  const handlers = Object.getOwnPropertyNames(AuthController.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => Object.getOwnPropertyDescriptor(AuthController.prototype, name)?.value as object)
    .filter((handler) => Reflect.hasMetadata(PATH_METADATA, handler));
  const guardsFor = (path: string) => {
    const handler = handlers.find((item) => Reflect.getMetadata(PATH_METADATA, item) === path);
    expect(handler, `Missing auth route ${path}`).toBeDefined();
    return Reflect.getMetadata(GUARDS_METADATA, handler!) as unknown[];
  };
  it('keeps every anonymous credential route behind the HTTP throttler', () => {
    for (const handler of handlers) {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? [];
      if (!guards.includes(AuthGuard)) expect(guards).toContain(ThrottlerGuard);
    }
  });
  it.each([
    'login',
    'refresh',
    'device/token',
    'mfa/enroll/confirm',
    'mfa/verify',
    'invitations/accept',
    'password-reset/request',
    'password-reset/confirm',
    'farmer-account-reset/redeem',
    'email-verification/confirm',
  ])('rate limits the public credential endpoint %s', (path) =>
    expect(guardsFor(path)).toContain(ThrottlerGuard),
  );
  it.each([
    'mfa/enroll',
    'password',
    'email-verification/request',
    'logout-all',
    'sessions',
    'sessions/:sessionId',
  ])('keeps account administration behind browser authentication: %s', (path) => {
    expect(guardsFor(path)).toContain(AuthGuard);
    expect(guardsFor(path)).toContain(BrowserSessionGuard);
  });
});
