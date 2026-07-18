import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedPrincipal } from '@clycites/auth';
import {
  collectionPointStatusSchema,
  createCollectionPointSchema,
  paginationQuerySchema,
  updateCollectionPointSchema,
} from '@clycites/contracts';
import { parseWithSchema } from '../common/validation.js';
import { AuthGuard } from '../identity/auth.guard.js';
import { CurrentPrincipal, RequirePermissions } from '../identity/identity.decorators.js';
import { PermissionsGuard } from '../identity/permissions.guard.js';
import type { AuthenticatedRequest } from '../observability/request-context.js';
import { CollectionPointsService } from './collection-points.service.js';

@ApiTags('Collection points')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('organizations/:organizationId/collection-points')
export class CollectionPointsController {
  constructor(@Inject(CollectionPointsService) private readonly points: CollectionPointsService) {}
  @Post()
  @RequirePermissions(PERMISSIONS.COLLECTION_POINT_CREATE)
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.points.create(
      organizationId,
      parseWithSchema(createCollectionPointSchema, body),
      principal,
      request.requestId,
    );
  }
  @Get()
  @RequirePermissions(PERMISSIONS.COLLECTION_POINT_READ)
  list(@Param('organizationId') organizationId: string, @Query() query: Record<string, unknown>) {
    const page = parseWithSchema(paginationQuerySchema, query);
    const statusResult = query.status
      ? collectionPointStatusSchema.safeParse(query.status)
      : undefined;
    return this.points.list(
      organizationId,
      page.page,
      page.pageSize,
      statusResult?.success ? statusResult.data : undefined,
    );
  }
  @Get(':collectionPointId')
  @RequirePermissions(PERMISSIONS.COLLECTION_POINT_READ)
  get(@Param('organizationId') organizationId: string, @Param('collectionPointId') id: string) {
    return this.points.get(organizationId, id);
  }
  @Patch(':collectionPointId')
  @RequirePermissions(PERMISSIONS.COLLECTION_POINT_UPDATE)
  update(
    @Param('organizationId') organizationId: string,
    @Param('collectionPointId') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.points.update(
      organizationId,
      id,
      parseWithSchema(updateCollectionPointSchema, body),
      principal,
      request.requestId,
    );
  }
}
