import { Module } from '@nestjs/common';

import { CoffeeConfigurationController } from './coffee-configuration.controller.js';
import { CoffeeConfigurationService } from './coffee-configuration.service.js';

@Module({
  controllers: [CoffeeConfigurationController],
  providers: [CoffeeConfigurationService],
  exports: [CoffeeConfigurationService],
})
export class CoffeeConfigurationModule {}
