import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { IdentifierService } from './identifier.service.js';

const identifiers = new IdentifierService();

describe('IdentifierService', () => {
  it('classifies exactly one canonical identifier branch', () => {
    expect(identifiers.classify(' Farmer@Example.COM ')).toEqual({
      kind: 'email',
      value: 'farmer@example.com',
    });
    expect(identifiers.classify('Farmer.Name')).toEqual({
      kind: 'username',
      value: 'farmer.name',
    });
  });

  it.each(['0772123456', '+256772123456', '256772123456'])(
    'normalizes %s to the same Ugandan phone identifier',
    (input) => {
      expect(identifiers.classify(input)).toEqual({
        kind: 'phone',
        value: '+256772123456',
      });
    },
  );

  it.each(['256772123456', 'admin', 'platform_admin', 'farmer..name', '-farmer'])(
    'rejects unsafe username %s',
    (username) => {
      expect(() => identifiers.normalizeUsername(username)).toThrow(BadRequestException);
    },
  );

  it('derives a canonical farmer username from the printed farmer number', () => {
    expect(identifiers.normalizeUsername('UG-KSE-0001')).toBe('ug-kse-0001');
  });
});
