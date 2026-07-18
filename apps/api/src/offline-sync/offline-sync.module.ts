import { Module } from '@nestjs/common';

import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { OfflineSyncController } from './offline-sync.controller.js';
import { OfflineSyncService } from './offline-sync.service.js';

@Module({
  imports: [DeliveriesModule],
  controllers: [OfflineSyncController],
  providers: [OfflineSyncService],
})
export class OfflineSyncModule {}
