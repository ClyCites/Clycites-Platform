import { createHash, randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { type Job, Worker } from 'bullmq';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';
import {
  PILOT_FARMER_IMPORT_PARSE_JOB,
  PILOT_FARMER_IMPORT_QUEUE_NAME,
} from './pilot-import.constants.js';
import { WorkerDatabaseService } from './worker-database.service.js';

const jobSchema = z.object({ farmerImportId: z.uuid() }).strict();
const safeText = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/^[=+\-@]/.test(value), 'Formula-like value is not allowed');
const rowSchema = z
  .object({
    firstName: safeText,
    lastName: safeText,
    primaryPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{9,15}$/)
      .optional()
      .or(z.literal('')),
    district: z.string().trim().min(1).max(120),
    membershipNumber: z.string().trim().max(80).optional().or(z.literal('')),
  })
  .strict();

@Injectable()
export class PilotFarmerImportWorker implements OnApplicationBootstrap, OnModuleDestroy {
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
    this.worker = new Worker(PILOT_FARMER_IMPORT_QUEUE_NAME, (job) => this.process(job), {
      connection: this.connection(),
      concurrency: 2,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async process(job: Pick<Job, 'name' | 'data' | 'id'>) {
    if (job.name !== PILOT_FARMER_IMPORT_PARSE_JOB)
      throw new Error('Unsupported pilot farmer import job');
    const { farmerImportId } = jobSchema.parse(job.data);
    const farmerImport = await this.database.client.pilotFarmerImport.findUnique({
      where: { id: farmerImportId },
      include: { pilot: true },
    });
    if (!farmerImport || !['VALIDATING', 'FAILED'].includes(farmerImport.status))
      return { status: 'NOT_CLAIMED' };
    try {
      const object = await this.storage.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: farmerImport.objectKey }),
      );
      const csv = await object.Body?.transformToString('utf-8');
      if (!csv || Buffer.byteLength(csv) > 10 * 1024 * 1024)
        throw new Error('CSV object is missing or exceeds 10 MiB');
      const checksum = `sha256:${createHash('sha256').update(csv).digest('hex')}`;
      if (checksum !== farmerImport.checksum) throw new Error('CSV checksum verification failed');
      const records: Record<string, unknown>[] = parse(csv, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: false,
      });
      if (records.length === 0 || records.length > 100_000)
        throw new Error('CSV must contain between 1 and 100000 rows');
      const memberships = await this.database.client.farmerOrganizationMembership.findMany({
        where: { organizationId: farmerImport.pilot.organizationId },
        include: { farmer: { select: { id: true, primaryPhone: true } } },
      });
      const phoneIndex = new Map(
        memberships
          .filter((membership) => membership.farmer.primaryPhone)
          .map((membership) => [membership.farmer.primaryPhone!, membership.farmer.id]),
      );
      const membershipIndex = new Map(
        memberships
          .filter((membership) => membership.membershipNumber)
          .map((membership) => [membership.membershipNumber!, membership.farmerId]),
      );
      let validRowCount = 0;
      let errorRowCount = 0;
      let reviewRequired = false;
      const rows = records.map((record, index) => {
        const parsed = rowSchema.safeParse(record);
        const normalized = parsed.success
          ? {
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
              ...(parsed.data.primaryPhone ? { primaryPhone: parsed.data.primaryPhone } : {}),
              district: parsed.data.district,
              ...(parsed.data.membershipNumber
                ? { membershipNumber: parsed.data.membershipNumber }
                : {}),
            }
          : {};
        const duplicateFarmerIds = parsed.success
          ? [
              ...new Set(
                [
                  parsed.data.primaryPhone ? phoneIndex.get(parsed.data.primaryPhone) : undefined,
                  parsed.data.membershipNumber
                    ? membershipIndex.get(parsed.data.membershipNumber)
                    : undefined,
                ].filter((value): value is string => Boolean(value)),
              ),
            ]
          : [];
        const validationErrors = parsed.success
          ? []
          : parsed.error.issues.map((issue) => ({
              path: issue.path.map(String),
              message: issue.message,
              code: issue.code,
            }));
        if (parsed.success) validRowCount += 1;
        else errorRowCount += 1;
        if (!parsed.success || duplicateFarmerIds.length > 0) reviewRequired = true;
        return {
          id: randomUUID(),
          farmerImportId,
          rowNumber: index + 2,
          normalizedData: normalized,
          validationErrors,
          duplicateSignals: { farmerIds: duplicateFarmerIds },
          resolution:
            parsed.success && duplicateFarmerIds.length === 0
              ? ('CREATE_NEW' as const)
              : ('REVIEW_REQUIRED' as const),
          ...(duplicateFarmerIds.length === 1 ? { existingFarmerId: duplicateFarmerIds[0] } : {}),
        };
      });
      await this.database.client.$transaction(async (transaction) => {
        await transaction.pilotFarmerImportRow.deleteMany({ where: { farmerImportId } });
        for (let index = 0; index < rows.length; index += 500)
          await transaction.pilotFarmerImportRow.createMany({
            data: rows.slice(index, index + 500),
          });
        await transaction.pilotFarmerImport.update({
          where: { id: farmerImportId },
          data: {
            status: reviewRequired ? 'REVIEW_REQUIRED' : 'VALIDATED',
            rowCount: rows.length,
            validRowCount,
            errorRowCount,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organizationId: farmerImport.pilot.organizationId,
            actorType: 'SYSTEM',
            action: 'PILOT_FARMER_IMPORT_VALIDATED',
            entityType: 'PILOT_FARMER_IMPORT',
            entityId: farmerImportId,
            requestId: `pilot-import-worker:${job.id ?? farmerImportId}`,
            metadata: { rowCount: rows.length, validRowCount, errorRowCount, reviewRequired },
          },
        });
      });
      return { status: reviewRequired ? 'REVIEW_REQUIRED' : 'VALIDATED', rowCount: rows.length };
    } catch (error) {
      await this.database.client.pilotFarmerImport.update({
        where: { id: farmerImportId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
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
