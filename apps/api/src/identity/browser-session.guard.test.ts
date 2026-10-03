import { ForbiddenException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { describe, expect, it } from 'vitest';
import { BrowserSessionGuard } from './browser-session.guard.js';

describe('browser account administration', () => {
  const guard = new BrowserSessionGuard();
  it('requires authentication', () =>
    expect(() => guard.canActivate(new ExecutionContextHost([{}]))).toThrow(ForbiddenException));
  it('rejects a device principal', () =>
    expect(() =>
      guard.canActivate(new ExecutionContextHost([{ principal: { deviceId: 'device-1' } }])),
    ).toThrow(ForbiddenException));
  it('accepts a browser principal', () =>
    expect(
      guard.canActivate(new ExecutionContextHost([{ principal: { sessionId: 'session-1' } }])),
    ).toBe(true));
});
