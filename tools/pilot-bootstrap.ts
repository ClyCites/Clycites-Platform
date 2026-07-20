import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { createPilotSchema } from '../packages/contracts/src/phase-eight.js';
import { createDatabaseClient } from '../packages/database/src/index.js';

const argument = (name: string) =>
  process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
async function main() {
  const configPath = argument('--config');
  if (!configPath)
    throw new Error(
      'Usage: pilot:bootstrap -- --config=path/to/pilot.json [--apply --confirm=CREATE_DRAFT_PILOT]',
    );
  const workspace = process.env.INIT_CWD ?? process.cwd();
  const input = createPilotSchema.parse(
    JSON.parse(await readFile(resolve(workspace, configPath), 'utf8')),
  );
  const apply = process.argv.includes('--apply');
  const confirmed = argument('--confirm') === 'CREATE_DRAFT_PILOT';
  const plan = {
    mode: apply ? 'APPLY_REQUESTED' : 'DRY_RUN',
    mutation: 'CREATE_DRAFT_PILOT',
    organizationId: input.organizationId,
    code: input.code,
    providerModes: { payment: input.paymentMode, hedera: input.hederaMode, sms: input.smsMode },
    legalApprovalRecorded: false,
    participantsImported: false,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!apply) {
    console.log('Dry run complete. No records were changed.');
    return;
  }
  if (!confirmed) throw new Error('Apply requires --confirm=CREATE_DRAFT_PILOT');

  const database = createDatabaseClient();
  try {
    const createdByUserId = argument('--actor-user-id');
    if (!createdByUserId) throw new Error('Apply requires --actor-user-id=<platform-admin-uuid>');
    const actor = await database.user.findUnique({
      where: { id: createdByUserId },
      select: { platformRole: true },
    });
    if (actor?.platformRole !== 'PLATFORM_ADMIN')
      throw new Error('Bootstrap actor must be a platform administrator');
    const id = randomUUID();
    const pilot = await database.pilot.create({
      data: {
        id,
        publicId: `pilot_${randomUUID().replaceAll('-', '')}`,
        ...input,
        plannedStartDate: new Date(input.plannedStartDate),
        plannedEndDate: new Date(input.plannedEndDate),
        createdByUserId,
        statusEvents: {
          create: {
            toStatus: 'DRAFT',
            actorUserId: createdByUserId,
            evidence: { source: 'pilot-bootstrap-cli', externalApproval: false },
          },
        },
      },
    });
    console.log(
      JSON.stringify({ created: true, pilotId: pilot.id, status: pilot.status }, null, 2),
    );
  } finally {
    await database.$disconnect();
  }
}

void main();
