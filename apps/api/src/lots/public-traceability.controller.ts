import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { LotsService } from './lots.service.js';
import { AnchorVerificationService } from '../anchoring/anchor-verification.service.js';

@ApiTags('Public traceability')
@Controller('traceability/lots')
export class PublicTraceabilityController {
  constructor(
    @Inject(LotsService) private readonly lots: LotsService,
    @Inject(AnchorVerificationService) private readonly verification: AnchorVerificationService,
  ) {}

  @Get(':publicId')
  @ApiOperation({ summary: 'Get privacy-safe lot traceability and Hedera integrity evidence' })
  async get(@Param('publicId') publicId: string) {
    const [traceability, ledgerVerification] = await Promise.all([
      this.lots.publicTrace(publicId),
      this.verification.publicLot(publicId),
    ]);
    return { ...traceability, ledgerVerification };
  }
}
