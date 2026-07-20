import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './config/environment.js';
import { AuditModule } from './audit/audit.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { QueueModule } from './queue/queue.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { UsersModule } from './users/users.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { MembershipsModule } from './memberships/memberships.module.js';
import { CollectionPointsModule } from './collection-points/collection-points.module.js';
import { FarmersModule } from './farmers/farmers.module.js';
import { FarmsModule } from './farms/farms.module.js';
import { ConsentsModule } from './consents/consents.module.js';
import { FarmerQrModule } from './farmer-qr/farmer-qr.module.js';
import { CoffeeConfigurationModule } from './coffee-configuration/coffee-configuration.module.js';
import { CollectionOperationsModule } from './collection-operations/collection-operations.module.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { OfflineSyncModule } from './offline-sync/offline-sync.module.js';
import { BatchesModule } from './batches/batches.module.js';
import { LotsModule } from './lots/lots.module.js';
import { AnchoringModule } from './anchoring/anchoring.module.js';
import { MarketplaceModule } from './marketplace/marketplace.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    ObservabilityModule,
    DatabaseModule,
    QueueModule,
    AuditModule,
    IdentityModule,
    UsersModule,
    OrganizationsModule,
    MembershipsModule,
    CollectionPointsModule,
    FarmersModule,
    FarmsModule,
    ConsentsModule,
    FarmerQrModule,
    CoffeeConfigurationModule,
    CollectionOperationsModule,
    DeliveriesModule,
    OfflineSyncModule,
    BatchesModule,
    LotsModule,
    AnchoringModule,
    MarketplaceModule,
    HealthModule,
  ],
})
export class AppModule {}
