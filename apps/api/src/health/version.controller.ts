import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { VersionData } from '@clycites/contracts';

import { VersionService } from './version.service.js';

@ApiTags('system')
@Controller('version')
export class VersionController {
  constructor(@Inject(VersionService) private readonly versionService: VersionService) {}

  @Get()
  @ApiOperation({ summary: 'Return application and build version information' })
  version(): VersionData {
    return this.versionService.version();
  }
}
