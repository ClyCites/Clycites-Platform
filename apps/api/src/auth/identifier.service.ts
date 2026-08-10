import { BadRequestException, Injectable } from '@nestjs/common';
import { ROLES } from '@clycites/auth';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type LoginIdentifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'username'; value: string };

const phonePattern = /^\+?[0-9][0-9\s()-]{5,}$/;
const usernamePattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const reservedUsernames = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'help',
  'api',
  'clycites',
  'platform',
  'null',
  'undefined',
  ...Object.values(ROLES).map((role) => role.toLowerCase()),
]);

@Injectable()
export class IdentifierService {
  classify(input: string): LoginIdentifier {
    const value = input.trim();
    if (value.includes('@')) return { kind: 'email', value: value.toLowerCase() };
    if (phonePattern.test(value)) return { kind: 'phone', value: this.normalizePhone(value) };
    return { kind: 'username', value: value.toLowerCase() };
  }

  normalizePhone(input: string): string {
    const compact = input.trim().replace(/[\s()-]/g, '');
    const international = compact.startsWith('256') ? `+${compact}` : compact;
    const phone = parsePhoneNumberFromString(international, 'UG');
    if (!phone?.isValid()) throw new BadRequestException('Invalid phone number');
    return phone.number;
  }

  normalizeUsername(input: string): string {
    const username = input.trim().toLowerCase();
    if (
      username.length < 4 ||
      username.length > 40 ||
      !usernamePattern.test(username) ||
      reservedUsernames.has(username)
    ) {
      throw new BadRequestException('Invalid username');
    }
    return username;
  }
}
