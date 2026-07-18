import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './environment.js';
import { PlatformEventsWorker } from './platform-events.worker.js';
import { HederaConfirmationWorker } from './hedera-confirmation.worker.js';
import { HederaProviderService } from './hedera-provider.service.js';
import { HederaReconciliationWorker } from './hedera-reconciliation.worker.js';
import { HederaSubmissionWorker } from './hedera-submission.worker.js';
import { OutboxDispatcherService } from './outbox-dispatcher.service.js';
import { WorkerDatabaseService } from './worker-database.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment })],
  providers: [
    PlatformEventsWorker,
    WorkerDatabaseService,
    HederaProviderService,
    OutboxDispatcherService,
    HederaSubmissionWorker,
    HederaConfirmationWorker,
    HederaReconciliationWorker,
  ],
})
export class WorkerModule {}
