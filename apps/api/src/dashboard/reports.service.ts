import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PHASE_NINE_ERROR_CODES,
  type CreateReportDefinitionInput,
  type ReportDefinition,
  type ReportExport,
  type RequestReportExportInput,
  type UpdateReportDefinitionInput,
} from '@clycites/contracts';
import type { Prisma } from '@clycites/database';
import type { Queue } from 'bullmq';

import { AuditService } from '../audit/audit.service.js';
import type { ApiEnvironment } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { REPORT_EXPORT_GENERATE_JOB, REPORT_EXPORT_QUEUE } from '../queue/queue.constants.js';

const toJsonInput = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class ReportsService {
  private readonly storage: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(REPORT_EXPORT_QUEUE) private readonly queue: Queue,
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

  // -- Definitions ----------------------------------------------------------

  async listDefinitions(organizationId: string): Promise<ReportDefinition[]> {
    const definitions = await this.database.client.reportDefinition.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return definitions.map((definition) => this.mapDefinition(definition));
  }

  async createDefinition(
    organizationId: string,
    input: CreateReportDefinitionInput,
    actorUserId: string,
    requestId: string,
  ): Promise<ReportDefinition> {
    const definition = await this.database.client.$transaction(async (transaction) => {
      const created = await transaction.reportDefinition.create({
        data: {
          organizationId,
          createdByUserId: actorUserId,
          name: input.name,
          reportType: input.reportType,
          filters: toJsonInput(input.filters),
          columns: toJsonInput(input.columns),
          format: input.format,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: 'report-definition.created',
          entityType: 'ReportDefinition',
          entityId: created.id,
          requestId,
          metadata: { reportType: created.reportType },
        },
        transaction,
      );
      return created;
    });
    return this.mapDefinition(definition);
  }

  async updateDefinition(
    organizationId: string,
    definitionId: string,
    input: UpdateReportDefinitionInput,
    actorUserId: string,
    requestId: string,
  ): Promise<ReportDefinition> {
    const existing = await this.database.client.reportDefinition.findFirst({
      where: { id: definitionId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.REPORT_DEFINITION_NOT_FOUND,
        message: 'Report definition not found',
      });
    }
    const definition = await this.database.client.$transaction(async (transaction) => {
      const updated = await transaction.reportDefinition.update({
        where: { id: definitionId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.filters ? { filters: toJsonInput(input.filters) } : {}),
          ...(input.columns ? { columns: toJsonInput(input.columns) } : {}),
          ...(input.format ? { format: input.format } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: 'report-definition.updated',
          entityType: 'ReportDefinition',
          entityId: definitionId,
          requestId,
        },
        transaction,
      );
      return updated;
    });
    return this.mapDefinition(definition);
  }

  // -- Exports --------------------------------------------------------------

  async listExports(organizationId: string): Promise<ReportExport[]> {
    const exports = await this.database.client.reportExport.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return exports.map((entry) => this.mapExport(entry));
  }

  async requestExport(
    organizationId: string,
    input: RequestReportExportInput,
    actorUserId: string,
    requestId: string,
  ): Promise<ReportExport> {
    let reportDefinitionId: string | null = null;
    let format = input.format ?? 'CSV';
    if (input.reportDefinitionId) {
      const definition = await this.database.client.reportDefinition.findFirst({
        where: { id: input.reportDefinitionId, organizationId, status: 'ACTIVE' },
      });
      if (!definition) {
        throw new NotFoundException({
          code: PHASE_NINE_ERROR_CODES.REPORT_DEFINITION_NOT_FOUND,
          message: 'Report definition not found',
        });
      }
      reportDefinitionId = definition.id;
      format = input.format ?? definition.format;
    }

    const created = await this.database.client.$transaction(async (transaction) => {
      const entry = await transaction.reportExport.create({
        data: {
          organizationId,
          reportDefinitionId,
          requestedByUserId: actorUserId,
          format,
          status: 'PENDING',
          requestId,
        },
      });
      await this.audit.create(
        {
          organizationId,
          actorUserId,
          action: 'report-export.requested',
          entityType: 'ReportExport',
          entityId: entry.id,
          requestId,
          metadata: { format, reportDefinitionId },
        },
        transaction,
      );
      return entry;
    });

    await this.queue.add(
      REPORT_EXPORT_GENERATE_JOB,
      { exportId: created.id, organizationId },
      { jobId: created.id },
    );
    return this.mapExport(created);
  }

  async getExport(organizationId: string, exportId: string): Promise<ReportExport> {
    const entry = await this.database.client.reportExport.findFirst({
      where: { id: exportId, organizationId },
    });
    if (!entry) {
      throw new NotFoundException({
        code: PHASE_NINE_ERROR_CODES.REPORT_EXPORT_NOT_FOUND,
        message: 'Report export not found',
      });
    }
    let downloadUrl: string | null = null;
    if (entry.status === 'COMPLETED' && entry.objectKey) {
      if (entry.expiresAt && entry.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException({
          code: PHASE_NINE_ERROR_CODES.REPORT_EXPORT_EXPIRED,
          message: 'This export has expired',
        });
      }
      downloadUrl = await getSignedUrl(
        this.storage,
        new GetObjectCommand({ Bucket: this.bucket, Key: entry.objectKey }),
        { expiresIn: 300 },
      );
    }
    return this.mapExport(entry, downloadUrl);
  }

  private mapDefinition(definition: {
    id: string;
    organizationId: string;
    name: string;
    reportType: string;
    filters: unknown;
    columns: unknown;
    format: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): ReportDefinition {
    return {
      id: definition.id,
      organizationId: definition.organizationId,
      name: definition.name,
      reportType: definition.reportType as ReportDefinition['reportType'],
      filters: (definition.filters as Record<string, unknown>) ?? {},
      columns: (definition.columns as string[]) ?? [],
      format: definition.format as ReportDefinition['format'],
      status: definition.status as ReportDefinition['status'],
      createdAt: definition.createdAt.toISOString(),
      updatedAt: definition.updatedAt.toISOString(),
    };
  }

  private mapExport(
    entry: {
      id: string;
      organizationId: string;
      reportDefinitionId: string | null;
      format: string;
      status: string;
      rowCount: number | null;
      checksum: string | null;
      expiresAt: Date | null;
      failureCode: string | null;
      createdAt: Date;
      completedAt: Date | null;
    },
    downloadUrl: string | null = null,
  ): ReportExport {
    return {
      id: entry.id,
      organizationId: entry.organizationId,
      reportDefinitionId: entry.reportDefinitionId,
      format: entry.format as ReportExport['format'],
      status: entry.status as ReportExport['status'],
      rowCount: entry.rowCount,
      checksum: entry.checksum,
      downloadUrl,
      expiresAt: entry.expiresAt?.toISOString() ?? null,
      failureCode: entry.failureCode,
      createdAt: entry.createdAt.toISOString(),
      completedAt: entry.completedAt?.toISOString() ?? null,
    };
  }
}
