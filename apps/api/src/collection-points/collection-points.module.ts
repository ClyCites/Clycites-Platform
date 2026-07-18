import { Module } from '@nestjs/common';
import { CollectionPointsController } from './collection-points.controller.js';
import { CollectionPointsService } from './collection-points.service.js';
@Module({ controllers: [CollectionPointsController], providers: [CollectionPointsService] })
export class CollectionPointsModule {}
