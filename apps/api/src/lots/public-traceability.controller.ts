import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { LotsService } from './lots.service.js';

@ApiTags('Public traceability')
@Controller('traceability/lots')
export class PublicTraceabilityController {
  constructor(@Inject(LotsService) private readonly lots: LotsService) {}

  @Get(':publicId')
  get(@Param('publicId') publicId: string) {
    return this.lots.publicTrace(publicId);
  }
}
