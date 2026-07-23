import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AdministrationService } from './administration.service.js';

@ApiTags('Public branding')
@Controller('public/organizations')
export class PublicBrandingController {
  constructor(@Inject(AdministrationService) private readonly administration: AdministrationService) {}

  @Get(':slug/branding')
  branding(@Param('slug') slug: string) {
    return this.administration.publicBranding(slug);
  }
}
