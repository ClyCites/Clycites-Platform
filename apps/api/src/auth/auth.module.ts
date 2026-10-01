import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CredentialLifecycleService } from './credential-lifecycle.service.js';
import { DeviceCredentialService } from './device-credential.service.js';
import { IdentifierService } from './identifier.service.js';
import { LoginLimiterService } from './login-limiter.service.js';
import { MfaService } from './mfa.service.js';
import { PasswordPolicyService } from './password-policy.service.js';

@Global()
@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [AuthController],
  providers: [
    AuthService,
    CredentialLifecycleService,
    DeviceCredentialService,
    IdentifierService,
    LoginLimiterService,
    MfaService,
    PasswordPolicyService,
  ],
  exports: [
    AuthService,
    CredentialLifecycleService,
    DeviceCredentialService,
    IdentifierService,
    MfaService,
  ],
})
export class AuthModule {}
