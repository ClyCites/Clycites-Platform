import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthData, ReadinessData } from '@clycites/contracts';

import { HealthService } from './health.service.js';

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Confirm that the API process is running' })
  health(): HealthData {
    return this.healthService.health();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check required PostgreSQL and Redis dependencies' })
  async ready(): Promise<ReadinessData> {
    const readiness = await this.healthService.readiness();
    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException('One or more required dependencies are unavailable');
    }
    return readiness;
  }
}
