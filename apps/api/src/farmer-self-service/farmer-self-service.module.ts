import { Module } from '@nestjs/common';

import { FarmerSelfServiceController } from './farmer-self-service.controller.js';
import { FarmerSelfServiceService } from './farmer-self-service.service.js';

@Module({
  controllers: [FarmerSelfServiceController],
  providers: [FarmerSelfServiceService],
})
export class FarmerSelfServiceModule {}
