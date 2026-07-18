import { Global, Module } from '@nestjs/common';

import { AnchorEligibilityService } from '../anchoring/anchor-eligibility.service.js';
import { AuditService } from './audit.service.js';
import { DomainEventService } from './domain-event.service.js';

@Global()
@Module({
  providers: [AuditService, DomainEventService, AnchorEligibilityService],
  exports: [AuditService, DomainEventService, AnchorEligibilityService],
})
export class AuditModule {}
