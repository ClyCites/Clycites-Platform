import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { LotsService } from './lots.service.js';
import { AnchorVerificationService } from '../anchoring/anchor-verification.service.js';

@ApiTags('Public traceability')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller(['traceability/lots', 'public/verify/lots'])
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
