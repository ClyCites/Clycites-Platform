import { ConflictException } from '@nestjs/common';
import { Prisma } from '@clycites/database';

export const rethrowKnownConflict = (error: unknown, message: string): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(message);
  }
  throw error;
};
