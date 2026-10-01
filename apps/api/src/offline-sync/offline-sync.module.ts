import { Module } from '@nestjs/common';

import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { BatchesModule } from '../batches/batches.module.js';
import { OfflineSyncController } from './offline-sync.controller.js';
import { OfflineSyncService } from './offline-sync.service.js';
import { OfflineSyncRateLimiterService } from './offline-sync-rate-limiter.service.js';

@Module({
  imports: [DeliveriesModule, BatchesModule],
  controllers: [OfflineSyncController],
  providers: [OfflineSyncService, OfflineSyncRateLimiterService],
})
export class OfflineSyncModule {}
