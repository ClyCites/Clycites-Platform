import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './environment.js';
import { PlatformEventsWorker } from './platform-events.worker.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment })],
  providers: [PlatformEventsWorker],
})
export class WorkerModule {}
