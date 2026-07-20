import { Module } from '@nestjs/common';

import { MarketplaceController } from './marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';
import { CommerceController } from './commerce.controller.js';
import { CommerceService } from './commerce.service.js';

@Module({
  controllers: [MarketplaceController, CommerceController],
  providers: [MarketplaceService, CommerceService],
  exports: [MarketplaceService, CommerceService],
})
export class MarketplaceModule {}
