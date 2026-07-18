import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service.js';
import { DomainEventService } from './domain-event.service.js';

@Global()
@Module({
  providers: [AuditService, DomainEventService],
  exports: [AuditService, DomainEventService],
})
export class AuditModule {}
