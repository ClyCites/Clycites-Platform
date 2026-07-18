import { Module } from '@nestjs/common';

import { AnchorVerificationService } from './anchor-verification.service.js';
import { AnchorsController } from './anchors.controller.js';
import { HederaAdminController } from './hedera-admin.controller.js';
import { HederaAdminService } from './hedera-admin.service.js';

@Module({
  controllers: [AnchorsController, HederaAdminController],
  providers: [AnchorVerificationService, HederaAdminService],
  exports: [AnchorVerificationService],
})
export class AnchoringModule {}
