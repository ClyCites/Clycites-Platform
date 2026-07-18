import { createHash } from 'node:crypto';

import { ForbiddenException, HttpException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@clycites/auth';
import type { OfflineOperationRequest, OfflineSyncBatch } from '@clycites/contracts';
import { Prisma } from '@clycites/database';

import { DatabaseService } from '../database/database.service.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';

interface OperationResult {
  clientOperationId: string;
  status: 'PROCESSED' | 'REJECTED' | 'CONFLICT';
  serverEntityId: string | null;
  serverVersion: number | null;
  error: { code: string; message: string } | null;
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

@Injectable()
export class OfflineSyncService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(DeliveriesService) private readonly deliveries: DeliveriesService,
  ) {}

  async synchronize(
    organizationId: string,
    batch: OfflineSyncBatch,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    const device = await this.database.client.registeredDevice.findFirst({
      where: {
        id: batch.deviceId,
        organizationId,
        assignedUserId: principal.subjectId,
        status: 'ACTIVE',
      },
    });
    if (!device) {
      throw new ForbiddenException({
        code: 'DEVICE_REVOKED',
        message: 'An active device assigned to the current user is required',
      });
    }

    const operations: OperationResult[] = [];
    for (const operation of batch.operations) {
      operations.push(
        await this.processOperation(
          organizationId,
          batch.deviceId,
          operation,
          principal,
          requestId,
        ),
      );
    }
    const serverTime = new Date().toISOString();
    return { operations, serverTime, nextSnapshotCursor: serverTime };
  }

  private async processOperation(
    organizationId: string,
    deviceId: string,
    operation: OfflineOperationRequest,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<OperationResult> {
    const payloadHash = createHash('sha256').update(stableJson(operation)).digest('hex');
    const existing = await this.database.client.offlineOperation.findUnique({
      where: {
        deviceId_clientOperationId: { deviceId, clientOperationId: operation.clientOperationId },
      },
    });
    if (existing) return this.replay(existing, payloadHash, operation.clientOperationId);

    try {
      await this.database.client.offlineOperation.create({
        data: {
          organizationId,
          deviceId,
          userId: principal.subjectId,
          clientOperationId: operation.clientOperationId,
          operationType: operation.operationType,
          entityType:
            operation.operationType === 'REQUEST_DELIVERY_CORRECTION'
              ? 'DELIVERY_CORRECTION'
              : 'DELIVERY',
          clientEntityId: operation.clientEntityId,
          payloadHash,
          status: 'PROCESSING',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.database.client.offlineOperation.findUniqueOrThrow({
          where: {
            deviceId_clientOperationId: {
              deviceId,
              clientOperationId: operation.clientOperationId,
            },
          },
        });
        return this.replay(concurrent, payloadHash, operation.clientOperationId);
      }
      throw error;
    }

    try {
      const response = await this.dispatch(
        organizationId,
        deviceId,
        operation,
        principal,
        requestId,
      );
      const result: OperationResult = {
        clientOperationId: operation.clientOperationId,
        status: 'PROCESSED',
        serverEntityId: this.responseId(response),
        serverVersion: this.responseVersion(response),
        error: null,
      };
      await this.storeResult(deviceId, operation.clientOperationId, result, 200);
      return result;
    } catch (error) {
      const normalized = this.normalizeError(error);
      const result: OperationResult = {
        clientOperationId: operation.clientOperationId,
        status: normalized.status,
        serverEntityId: null,
        serverVersion: null,
        error: { code: normalized.code, message: normalized.message },
      };
      await this.storeResult(deviceId, operation.clientOperationId, result, normalized.httpStatus);
      return result;
    }
  }

  private dispatch(
    organizationId: string,
    deviceId: string,
    operation: OfflineOperationRequest,
    principal: AuthenticatedPrincipal,
    requestId: string,
  ) {
    if (operation.operationType === 'CREATE_DELIVERY') {
      if (operation.payload.deviceId !== deviceId) {
        throw new ForbiddenException('Operation device does not match the sync device');
      }
      return this.deliveries.create(
        organizationId,
        operation.clientOperationId,
        operation.payload,
        principal,
        requestId,
        'OFFLINE_SYNC',
      );
    }
    if (operation.operationType === 'CONFIRM_DELIVERY') {
      if (!operation.baseVersion)
        throw new ForbiddenException('Confirmation base version is required');
      return this.deliveries.confirm(
        organizationId,
        operation.payload.deliveryId,
        { lockVersion: operation.baseVersion, confirmation: operation.payload.confirmation },
        principal,
        requestId,
      );
    }
    if (operation.operationType === 'SUBMIT_DELIVERY') {
      return this.deliveries.submit(
        organizationId,
        operation.payload.deliveryId,
        operation.payload.lockVersion,
        principal,
        requestId,
      );
    }
    return this.deliveries.requestCorrection(
      organizationId,
      operation.payload.deliveryId,
      operation.payload.correction,
      principal,
      requestId,
    );
  }

  private async storeResult(
    deviceId: string,
    clientOperationId: string,
    result: OperationResult,
    responseStatus: number,
  ) {
    await this.database.client.offlineOperation.update({
      where: { deviceId_clientOperationId: { deviceId, clientOperationId } },
      data: {
        status: result.status,
        responseStatus,
        responseBody: {
          clientOperationId: result.clientOperationId,
          status: result.status,
          serverEntityId: result.serverEntityId,
          serverVersion: result.serverVersion,
          error: result.error,
        },
        errorCode: result.error?.code ?? null,
        processedAt: new Date(),
      },
    });
  }

  private replay(
    operation: {
      payloadHash: string;
      status: string;
      responseBody: Prisma.JsonValue;
    },
    payloadHash: string,
    clientOperationId: string,
  ): OperationResult {
    if (operation.payloadHash !== payloadHash) {
      return {
        clientOperationId,
        status: 'CONFLICT',
        serverEntityId: null,
        serverVersion: null,
        error: {
          code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
          message: 'Client operation ID was already used with a different payload',
        },
      };
    }
    if (operation.responseBody && typeof operation.responseBody === 'object') {
      return operation.responseBody as unknown as OperationResult;
    }
    return {
      clientOperationId,
      status: 'CONFLICT',
      serverEntityId: null,
      serverVersion: null,
      error: {
        code: 'OFFLINE_OPERATION_IN_PROGRESS',
        message: 'This operation is already processing; retry with the same operation ID',
      },
    };
  }

  private normalizeError(error: unknown) {
    const httpStatus = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : undefined;
    const objectBody =
      typeof body === 'object' && body !== null
        ? (body as { code?: string; message?: string })
        : undefined;
    return {
      status: httpStatus === 409 ? ('CONFLICT' as const) : ('REJECTED' as const),
      httpStatus,
      code:
        objectBody?.code ??
        (httpStatus === 409 ? 'DELIVERY_VERSION_CONFLICT' : 'OFFLINE_OPERATION_REJECTED'),
      message:
        objectBody?.message ??
        (typeof body === 'string' ? body : undefined) ??
        (error instanceof Error ? error.message : 'Offline operation failed'),
    };
  }

  private responseId(response: unknown): string | null {
    if (
      response &&
      typeof response === 'object' &&
      'id' in response &&
      typeof response.id === 'string'
    ) {
      return response.id;
    }
    return null;
  }

  private responseVersion(response: unknown): number | null {
    if (
      response &&
      typeof response === 'object' &&
      'lockVersion' in response &&
      typeof response.lockVersion === 'number'
    ) {
      return response.lockVersion;
    }
    return null;
  }
}
