import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { PasswordPolicyService } from './password-policy.service.js';

describe('PasswordPolicyService', () => {
  const policy = new PasswordPolicyService();

  it('uses the explicitly declared class for a dual-role account', () => {
    expect(() => policy.validatePassword('field-42', 'FARMER')).not.toThrow();
    expect(() => policy.validatePassword('field-42', 'STAFF')).toThrow(BadRequestException);
  });

  it('requires twelve characters for staff and eight for farmers', () => {
    expect(() => policy.validatePassword('staff-pass-12', 'STAFF')).not.toThrow();
    expect(() => policy.validatePassword('farm-123', 'FARMER')).not.toThrow();
    expect(() => policy.validatePassword('farm-12', 'FARMER')).toThrow(BadRequestException);
  });

  it('rejects locally screened common passwords without composition rules', () => {
    expect(() => policy.validatePassword('password1234', 'STAFF')).toThrow(BadRequestException);
    expect(() => policy.validatePassword('password', 'FARMER')).toThrow(BadRequestException);
    expect(() =>
      policy.validatePassword('a simple but sufficiently long phrase', 'STAFF'),
    ).not.toThrow();
  });
});
