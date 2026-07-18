import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from './auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard, PermissionsGuard],
  exports: [AuthGuard, PermissionsGuard],
})
export class IdentityModule {}
