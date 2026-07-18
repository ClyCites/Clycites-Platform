import { Module } from '@nestjs/common';

import { BatchesModule } from '../batches/batches.module.js';
import { AnchoringModule } from '../anchoring/anchoring.module.js';
import { LotsController } from './lots.controller.js';
import { LotsService } from './lots.service.js';
import { PublicTraceabilityController } from './public-traceability.controller.js';

@Module({
  imports: [BatchesModule, AnchoringModule],
  controllers: [LotsController, PublicTraceabilityController],
  providers: [LotsService],
})
export class LotsModule {}
