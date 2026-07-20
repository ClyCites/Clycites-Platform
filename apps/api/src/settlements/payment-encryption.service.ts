import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiEnvironment } from '../config/environment.js';

const algorithm = 'aes-256-gcm';
const version = 'v1';

@Injectable()
export class PaymentEncryptionService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  encrypt(plaintext: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.key(), initializationVector);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      version,
      initializationVector.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string): string {
    const [envelopeVersion, initializationVector, authenticationTag, ciphertext, ...extra] =
      envelope.split('.');
    if (
      envelopeVersion !== version ||
      !initializationVector ||
      !authenticationTag ||
      ciphertext === undefined ||
      extra.length > 0
    ) {
      throw new Error('Invalid encrypted payment identifier');
    }
    const decipher = createDecipheriv(
      algorithm,
      this.key(),
      Buffer.from(initializationVector, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(authenticationTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  lastFour(identifier: string): string {
    return identifier.slice(-4);
  }

  private key(): Buffer {
    const encodedKey = String(
      this.config.getOrThrow('PAYMENT_ENCRYPTION_KEY_BASE64', { infer: true }),
    );
    return Buffer.from(encodedKey, 'base64');
  }
}
