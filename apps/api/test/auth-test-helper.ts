import type { INestApplication } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import request from 'supertest';

const platformAdminEmail = 'platform.admin@clycites.local';
const platformTotpSecret = process.env.SEED_PLATFORM_ADMIN_TOTP_SECRET ?? 'JBSWY3DPEHPK3PXP';

export const loginForTest = async (
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> => {
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(201);
  if (!login.body.data.mfaRequired) return login.body.data.accessToken as string;
  if (email !== platformAdminEmail || login.body.data.enrollmentRequired) {
    throw new Error(`Unexpected MFA challenge for ${email}`);
  }
  const code = new OTPAuth.TOTP({
    issuer: 'ClyCites',
    label: email,
    secret: OTPAuth.Secret.fromBase32(platformTotpSecret),
  }).generate();
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/mfa/verify')
    .send({ challengeToken: login.body.data.challengeToken, code })
    .expect(200);
  return verified.body.data.accessToken as string;
};
