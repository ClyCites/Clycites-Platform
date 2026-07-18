import { Module } from '@nestjs/common';
import { FarmersController } from './farmers.controller.js';
import { FarmersService } from './farmers.service.js';
@Module({
  controllers: [FarmersController],
  providers: [FarmersService],
  exports: [FarmersService],
})
export class FarmersModule {}
