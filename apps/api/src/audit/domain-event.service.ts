import { Injectable } from '@nestjs/common';
import type { Prisma } from '@clycites/database';

export interface DomainEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload?: Prisma.InputJsonObject;
}

@Injectable()
export class DomainEventService {
  create(input: DomainEventInput, transaction: Prisma.TransactionClient) {
    return transaction.outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: '1.0',
        payload: input.payload ?? {},
      },
    });
  }
}
