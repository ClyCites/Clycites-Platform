import { BadRequestException, Injectable } from '@nestjs/common';

export type AccountClass = 'STAFF' | 'FARMER';

const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  'password',
  'password1',
  'password123',
  'password1234',
  'qwerty123',
  'welcome123',
]);

@Injectable()
export class PasswordPolicyService {
  validatePassword(password: string, accountClass: AccountClass): void {
    const minimumLength = accountClass === 'STAFF' ? 12 : 8;
    const normalized = password.trim();
    if (
      normalized.length < minimumLength ||
      password.length > 128 ||
      COMMON_PASSWORDS.has(normalized.toLowerCase())
    ) {
      throw new BadRequestException('Password does not meet policy');
    }
  }
}
