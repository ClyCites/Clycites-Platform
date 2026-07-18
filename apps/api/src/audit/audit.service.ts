import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@clycites/database';

import { DatabaseService } from '../database/database.service.js';

export interface AuditInput {
  organizationId?: string;
  actorUserId?: string;
  actorType?: 'USER' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  create(input: AuditInput, transaction?: Prisma.TransactionClient) {
    const client = transaction ?? this.database.client;
    const data: Prisma.AuditEventUncheckedCreateInput = {
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      actorType: input.actorType ?? (input.actorUserId ? 'USER' : 'SYSTEM'),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId,
      metadata: input.metadata ?? {},
    };
    return client.auditEvent.create({
      data,
    });
  }
}
