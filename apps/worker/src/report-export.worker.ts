import { createHash } from 'node:crypto';

import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { type Job, Worker } from 'bullmq';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';
import {
  REPORT_EXPORT_GENERATE_JOB,
  REPORT_EXPORT_QUEUE_NAME,
} from './report-export.constants.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const jobSchema = z.object({ exportId: z.uuid(), organizationId: z.uuid() }).strict();

const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ReportRow = Record<string, string | number | null>;

@Injectable()
export class ReportExportWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private worker?: Worker;
  private readonly storage: S3Client;
  private readonly bucket: string;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
    @Inject(WorkerDatabaseService) private readonly database: WorkerDatabaseService,
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

  onApplicationBootstrap(): void {
    this.worker = new Worker(REPORT_EXPORT_QUEUE_NAME, (job) => this.process(job), {
      connection: this.connection(),
      concurrency: 2,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Pick<Job, 'name' | 'data' | 'id'>) {
    if (job.name !== REPORT_EXPORT_GENERATE_JOB) throw new Error('Unsupported report export job');
    const { exportId, organizationId } = jobSchema.parse(job.data);

    const record = await this.database.client.reportExport.findUnique({
      where: { id: exportId },
      include: { reportDefinition: true },
    });
    if (!record || record.organizationId !== organizationId) return { status: 'NOT_CLAIMED' };
    if (!['PENDING', 'FAILED'].includes(record.status)) return { status: 'NOT_CLAIMED' };

    await this.database.client.reportExport.update({
      where: { id: exportId },
      data: { status: 'PROCESSING' },
    });

    try {
      if (record.format === 'PDF') {
        throw Object.assign(new Error('PDF export is not supported'), {
          failureCode: 'FORMAT_NOT_SUPPORTED',
        });
      }

      const reportType = record.reportDefinition?.reportType ?? 'OPERATIONAL_HEALTH';
      const rows = await this.buildRows(organizationId, reportType);
      const columns = this.resolveColumns(record.reportDefinition?.columns, rows);

      const body =
        record.format === 'JSON'
          ? JSON.stringify(rows, null, 2)
          : this.toCsv(columns, rows);
      const buffer = Buffer.from(body, 'utf-8');
      const checksum = `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
      const extension = record.format === 'JSON' ? 'json' : 'csv';
      const objectKey = `reports/${organizationId}/${exportId}.${extension}`;

      await this.storage.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: record.format === 'JSON' ? 'application/json' : 'text/csv',
        }),
      );

      const completedAt = new Date();
      await this.database.client.$transaction(async (transaction) => {
        await transaction.reportExport.update({
          where: { id: exportId },
          data: {
            status: 'COMPLETED',
            objectKey,
            checksum,
            rowCount: rows.length,
            expiresAt: new Date(completedAt.getTime() + EXPORT_TTL_MS),
            failureCode: null,
            completedAt,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organizationId,
            actorType: 'SYSTEM',
            action: 'report-export.completed',
            entityType: 'ReportExport',
            entityId: exportId,
            requestId: `report-export-worker:${job.id ?? exportId}`,
            metadata: { reportType, rowCount: rows.length, format: record.format },
          },
        });
      });

      return { status: 'COMPLETED', rowCount: rows.length };
    } catch (error) {
      const failureCode =
        typeof error === 'object' && error && 'failureCode' in error
          ? String(error.failureCode)
          : 'REPORT_GENERATION_FAILED';
      await this.database.client.reportExport.update({
        where: { id: exportId },
        data: { status: 'FAILED', failureCode },
      });
      throw error;
    }
  }

  private async buildRows(organizationId: string, reportType: string): Promise<ReportRow[]> {
    switch (reportType) {
      case 'FARMER_REGISTRY': {
        const memberships = await this.database.client.farmerOrganizationMembership.findMany({
          where: { organizationId },
          include: { farmer: true },
          orderBy: { createdAt: 'asc' },
        });
        return memberships.map((membership) => ({
          farmerId: membership.farmerId,
          firstName: membership.farmer.firstName,
          lastName: membership.farmer.lastName,
          primaryPhone: membership.farmer.primaryPhone ?? null,
          membershipNumber: membership.membershipNumber ?? null,
          status: membership.status,
          joinedAt: membership.createdAt.toISOString(),
        }));
      }
      case 'DELIVERY_SUMMARY': {
        const deliveries = await this.database.client.delivery.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'asc' },
          take: 50_000,
        });
        return deliveries.map((delivery) => ({
          deliveryId: delivery.id,
          status: delivery.status,
          createdAt: delivery.createdAt.toISOString(),
          serverReceivedAt: delivery.serverReceivedAt?.toISOString() ?? null,
        }));
      }
      case 'SETTLEMENT_SUMMARY':
      case 'PAYMENT_RECONCILIATION': {
        const settlements = await this.database.client.farmerSettlement.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'asc' },
          take: 50_000,
        });
        return settlements.map((settlement) => ({
          settlementId: settlement.id,
          status: settlement.status,
          currency: settlement.currency,
          grossEntitlement: Number(settlement.grossEntitlementMinor) / 100,
          netEntitlement: Number(settlement.netEntitlementMinor) / 100,
          createdAt: settlement.createdAt.toISOString(),
        }));
      }
      case 'AUDIT_ACTIVITY': {
        const events = await this.database.client.auditEvent.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take: 50_000,
        });
        return events.map((event) => ({
          id: event.id,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          actorType: event.actorType,
          actorUserId: event.actorUserId ?? null,
          createdAt: event.createdAt.toISOString(),
        }));
      }
      case 'OPERATIONAL_HEALTH':
      default: {
        const [farmers, deliveries, settlements, collectionPoints] = await Promise.all([
          this.database.client.farmerOrganizationMembership.count({
            where: { organizationId, status: 'ACTIVE' },
          }),
          this.database.client.delivery.count({ where: { organizationId } }),
          this.database.client.farmerSettlement.count({ where: { organizationId } }),
          this.database.client.collectionPoint.count({ where: { organizationId } }),
        ]);
        return [
          { metric: 'active_farmers', value: farmers },
          { metric: 'deliveries', value: deliveries },
          { metric: 'settlements', value: settlements },
          { metric: 'collection_points', value: collectionPoints },
        ];
      }
    }
  }

  private resolveColumns(columns: unknown, rows: ReportRow[]): string[] {
    if (Array.isArray(columns) && columns.every((value) => typeof value === 'string') && columns.length > 0) {
      return columns;
    }
    return rows.length > 0 ? Object.keys(rows[0]!) : [];
  }

  private toCsv(columns: string[], rows: ReportRow[]): string {
    const escape = (value: string | number | null): string => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = columns.map(escape).join(',');
    const lines = rows.map((row) => columns.map((column) => escape(row[column] ?? null)).join(','));
    return [header, ...lines].join('\r\n');
  }

  private connection() {
    const password = this.config.get('REDIS_PASSWORD', { infer: true });
    return {
      host: this.config.getOrThrow('REDIS_HOST', { infer: true }),
      port: this.config.getOrThrow('REDIS_PORT', { infer: true }),
      ...(password ? { password } : {}),
    };
  }
}
