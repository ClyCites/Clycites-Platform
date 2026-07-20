import { describe, expect, it } from 'vitest';

import { PaymentEncryptionService } from './payment-encryption.service.js';

const key = Buffer.from('test-payment-encryption-key-32b!').toString('base64');
const service = new PaymentEncryptionService({
  getOrThrow: () => key,
} as never);

describe('PaymentEncryptionService', () => {
  it('round trips identifiers with randomized authenticated ciphertext', () => {
    const first = service.encrypt('256700123456');
    const second = service.encrypt('256700123456');

    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe('256700123456');
    expect(service.lastFour('256700123456')).toBe('3456');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = service.encrypt('256700123456');
    const tampered = `${encrypted.slice(0, -1)}A`;

    expect(() => service.decrypt(tampered)).toThrow();
  });
});
