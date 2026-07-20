import { createHash, randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';
import { PHASE_EIGHT_ERROR_CODES } from '@clycites/contracts';
import type { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import {
  PILOT_FARMER_IMPORT_PARSE_JOB,
  PILOT_FARMER_IMPORT_QUEUE,
} from '../queue/queue.constants.js';

interface ImportRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
}

@Injectable()
export class PilotImportService {
  private readonly storage: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PILOT_FARMER_IMPORT_QUEUE) private readonly queue: Queue,
    @Inject(ConfigService) config: ConfigService<ApiEnvironment, true>,
  ) {
    this.bucket = config.getOrThrow('S3_BUCKET', { infer: true });
    this.storage = new S3Client({
      endpoint: config.getOrThrow('S3_ENDPOINT', { infer: true }),
      region: config.getOrThrow('S3_REGION', { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.getOrThrow('S3_SECRET_KEY', { infer: true }),
      },
    });
  }

  async list(pilotId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    return this.database.client.pilotFarmerImport.findMany({
      where: { pilotId },
      orderBy: { createdAt: 'desc' },
      include: { rows: { orderBy: { rowNumber: 'asc' }, take: 500 } },
    });
  }

  async detail(pilotId: string, importId: string, principal: AuthenticatedPrincipal) {
    await this.accessiblePilot(pilotId, principal);
    const farmerImport = await this.database.client.pilotFarmerImport.findFirst({
      where: { id: importId, pilotId },
      include: { rows: { orderBy: { rowNumber: 'asc' }, take: 500 } },
    });
    if (!farmerImport) throw new NotFoundException('Pilot farmer import not found');
    return farmerImport;
  }

  async create(
    pilotId: string,
    input: ImportRequest,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const pilot = await this.accessiblePilot(pilotId, principal);
    if (pilot.readOnly)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.PILOT_INVALID_STATE_TRANSITION,
        message: 'Pilot is read-only',
      });
    const id = randomUUID();
    const objectKey = `protected/pilot-imports/${pilotId}/${id}.csv`;
    const checksumHex = input.checksum.slice('sha256:'.length);
    const record = await this.database.client.$transaction(async (transaction) => {
      const created = await transaction.pilotFarmerImport.create({
        data: {
          id,
          pilotId,
          publicId: `pfi_${randomUUID().replaceAll('-', '')}`,
          objectKey,
          originalFilenameHash: `sha256:${createHash('sha256').update(input.filename).digest('hex')}`,
          contentType: input.contentType,
          sizeBytes: BigInt(input.sizeBytes),
          checksum: input.checksum,
          dryRun: true,
          createdByUserId: principal.subjectId,
        },
      });
      await this.audit.create(
        {
          organizationId: pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_FARMER_IMPORT_UPLOAD_CREATED',
          entityType: 'PILOT_FARMER_IMPORT',
          entityId: id,
          requestId,
          metadata: { pilotId, sizeBytes: input.sizeBytes },
        },
        transaction,
      );
      return created;
    });
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      Metadata: { sha256: checksumHex },
    });
    return {
      import: record,
      upload: {
        method: 'PUT',
        url: await getSignedUrl(this.storage, command, { expiresIn: 900 }),
        expiresInSeconds: 900,
        requiredHeaders: { 'content-type': input.contentType, 'x-amz-meta-sha256': checksumHex },
      },
    };
  }

  async confirmUpload(
    importId: string,
    checksum: string,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const farmerImport = await this.importForPrincipal(importId, principal);
    if (farmerImport.checksum !== checksum)
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.FARMER_IMPORT_INVALID_FILE,
        message: 'Import checksum does not match registration',
      });
    const object = await this.storage.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: farmerImport.objectKey }),
    );
    if (
      object.ContentLength !== Number(farmerImport.sizeBytes) ||
      object.Metadata?.sha256 !== checksum.slice('sha256:'.length)
    )
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.FARMER_IMPORT_INVALID_FILE,
        message: 'Uploaded object metadata does not match registration',
      });
    await this.database.client.pilotFarmerImport.update({
      where: { id: importId },
      data: { status: 'VALIDATING' },
    });
    await this.queue.add(
      PILOT_FARMER_IMPORT_PARSE_JOB,
      { farmerImportId: importId },
      { jobId: `pilot-farmer-import:${importId}` },
    );
    await this.audit.create({
      organizationId: farmerImport.pilot.organizationId,
      actorUserId: principal.subjectId,
      action: 'PILOT_FARMER_IMPORT_VALIDATION_QUEUED',
      entityType: 'PILOT_FARMER_IMPORT',
      entityId: importId,
      requestId,
      metadata: { pilotId: farmerImport.pilotId },
    });
    return { id: importId, status: 'VALIDATING' };
  }

  async confirm(
    importId: string,
    expectedRowCount: number,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const farmerImport = await this.importForPrincipal(importId, principal);
    if (
      farmerImport.status !== 'VALIDATED' ||
      farmerImport.rowCount !== expectedRowCount ||
      farmerImport.errorRowCount > 0
    )
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.FARMER_IMPORT_DUPLICATE_REVIEW_REQUIRED,
        message: 'Import validation or duplicate review is incomplete',
      });
    const rows = await this.database.client.pilotFarmerImportRow.findMany({
      where: { farmerImportId: importId, resolution: 'CREATE_NEW' },
      orderBy: { rowNumber: 'asc' },
    });
    return this.database.client.$transaction(async (transaction) => {
      for (const row of rows) {
        const data = row.normalizedData as {
          firstName: string;
          lastName: string;
          primaryPhone?: string;
          district: string;
          membershipNumber?: string;
        };
        const farmerId = randomUUID();
        await transaction.farmer.create({
          data: {
            id: farmerId,
            farmerNumber: `PIL-${randomUUID().slice(0, 12).toUpperCase()}`,
            firstName: data.firstName,
            lastName: data.lastName,
            ...(data.primaryPhone ? { primaryPhone: data.primaryPhone } : {}),
            district: data.district,
            status: 'DRAFT',
            registeredByUserId: principal.subjectId,
          },
        });
        await transaction.farmerOrganizationMembership.create({
          data: {
            farmerId,
            organizationId: farmerImport.pilot.organizationId,
            ...(data.membershipNumber ? { membershipNumber: data.membershipNumber } : {}),
            status: 'PENDING',
          },
        });
        await transaction.pilotFarmerImportRow.update({
          where: { id: row.id },
          data: { importedFarmerId: farmerId },
        });
      }
      const confirmed = await transaction.pilotFarmerImport.update({
        where: { id: importId },
        data: {
          status: 'CONFIRMED',
          dryRun: false,
          confirmedByUserId: principal.subjectId,
          confirmedAt: new Date(),
        },
      });
      await this.audit.create(
        {
          organizationId: farmerImport.pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_FARMER_IMPORT_CONFIRMED',
          entityType: 'PILOT_FARMER_IMPORT',
          entityId: importId,
          requestId,
          metadata: {
            pilotId: farmerImport.pilotId,
            importedCount: rows.length,
            enrollmentCreated: false,
          },
        },
        transaction,
      );
      return confirmed;
    });
  }

  async cancel(importId: string, principal: AuthenticatedPrincipal, requestId: string) {
    const farmerImport = await this.importForPrincipal(importId, principal);
    if (['CONFIRMED', 'CANCELLED'].includes(farmerImport.status))
      throw new ConflictException({
        code: PHASE_EIGHT_ERROR_CODES.FARMER_IMPORT_INVALID_FILE,
        message: 'Confirmed or cancelled imports cannot be cancelled',
      });
    return this.database.client.$transaction(async (transaction) => {
      const cancelled = await transaction.pilotFarmerImport.update({
        where: { id: importId },
        data: { status: 'CANCELLED' },
      });
      await this.audit.create(
        {
          organizationId: farmerImport.pilot.organizationId,
          actorUserId: principal.subjectId,
          action: 'PILOT_FARMER_IMPORT_CANCELLED',
          entityType: 'PILOT_FARMER_IMPORT',
          entityId: importId,
          requestId,
          metadata: { pilotId: farmerImport.pilotId, priorStatus: farmerImport.status },
        },
        transaction,
      );
      return cancelled;
    });
  }

  private async importForPrincipal(importId: string, principal: AuthenticatedPrincipal) {
    const farmerImport = await this.database.client.pilotFarmerImport.findUnique({
      where: { id: importId },
      include: { pilot: true },
    });
    if (
      !farmerImport ||
      (!principal.roles.includes(ROLES.PLATFORM_ADMIN) &&
        !principal.organizations?.some(
          (organization) => organization.organizationId === farmerImport.pilot.organizationId,
        ))
    )
      throw new NotFoundException('Pilot farmer import not found');
    return farmerImport;
  }

  private async accessiblePilot(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.database.client.pilot.findUnique({ where: { id: pilotId } });
    if (
      !pilot ||
      (!principal.roles.includes(ROLES.PLATFORM_ADMIN) &&
        !principal.organizations?.some(
          (organization) => organization.organizationId === pilot.organizationId,
        ))
    )
      throw new NotFoundException('Pilot not found');
    return pilot;
  }
}
