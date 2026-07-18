import { Module } from '@nestjs/common';

import { CollectionOperationsController } from './collection-operations.controller.js';
import { CollectionOperationsService } from './collection-operations.service.js';

@Module({
  controllers: [CollectionOperationsController],
  providers: [CollectionOperationsService],
  exports: [CollectionOperationsService],
})
export class CollectionOperationsModule {}
