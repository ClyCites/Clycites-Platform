import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { VersionController } from './version.controller.js';
import { VersionService } from './version.service.js';

@Module({
  controllers: [HealthController, VersionController],
  providers: [HealthService, VersionService],
})
export class HealthModule {}
