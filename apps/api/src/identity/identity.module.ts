import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from './auth.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { ScopeResolverService } from './scope-resolver.service.js';

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard, PermissionsGuard, ScopeResolverService],
  exports: [AuthGuard, PermissionsGuard, ScopeResolverService],
})
export class IdentityModule {}
