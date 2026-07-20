import { Module } from '@nestjs/common';

import { PaymentEncryptionService } from './payment-encryption.service.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  controllers: [SettlementsController],
  providers: [PaymentEncryptionService, SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
