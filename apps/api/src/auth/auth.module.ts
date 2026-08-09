import { Global, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginLimiterService } from './login-limiter.service.js';

@Global()
@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }])],
  controllers: [AuthController],
  providers: [AuthService, LoginLimiterService],
  exports: [AuthService],
})
export class AuthModule {}
