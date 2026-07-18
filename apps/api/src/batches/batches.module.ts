import { Module } from '@nestjs/common';

import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';
import { TransformationsController } from './transformations.controller.js';
import { TransformationsService } from './transformations.service.js';

@Module({
  controllers: [BatchesController, TransformationsController],
  providers: [BatchesService, TransformationsService],
  exports: [BatchesService],
})
export class BatchesModule {}
