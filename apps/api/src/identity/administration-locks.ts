import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@clycites/database';

/** Serialize changes that could remove the last usable administrator of a tenant. */
export async function lockOrganizationAdministration(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  await transaction.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId}::uuid FOR UPDATE`;
}

export async function assertAnotherOrganizationAdmin(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  excluding: { membershipId?: string; userId?: string },
) {
  const count = await transaction.organizationMembership.count({
    where: {
      organizationId,
      role: 'COOPERATIVE_ADMIN',
      status: 'ACTIVE',
      ...(excluding.membershipId ? { id: { not: excluding.membershipId } } : {}),
      ...(excluding.userId ? { userId: { not: excluding.userId } } : {}),
      user: { status: 'ACTIVE', deletedAt: null },
    },
  });
  if (count === 0)
    throw new ConflictException('Assign another active cooperative administrator first');
}
