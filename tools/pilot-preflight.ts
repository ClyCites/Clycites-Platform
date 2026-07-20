import { createDatabaseClient } from '../packages/database/src/index.js';

const argument = (name: string) =>
  process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
async function main() {
  const pilotId = argument('--pilot-id');
  const allowBlocked = process.argv.includes('--allow-blocked');
  const database = createDatabaseClient();
  try {
    const pilots = await database.pilot.findMany({
      where: pilotId ? { id: pilotId } : {},
      orderBy: { code: 'asc' },
      include: { configuration: true },
    });
    if (pilots.length === 0) throw new Error('No matching pilot found');
    let blocked = false;
    for (const pilot of pilots) {
      const [gates, incidents, participants, requiredTraining, completedTraining, baselines] =
        await Promise.all([
          database.pilotReadinessGate.count({
            where: {
              OR: [{ pilotId: null }, { pilotId: pilot.id }],
              blocking: true,
              status: { notIn: ['READY', 'READY_WITH_RISK', 'NOT_APPLICABLE'] },
            },
          }),
          database.operationalIncident.count({
            where: {
              organizationId: pilot.organizationId,
              severity: { in: ['SEV1', 'SEV2'] },
              status: { notIn: ['RESOLVED', 'CLOSED'] },
            },
          }),
          database.pilotParticipant.count({
            where: { pilotId: pilot.id, status: { in: ['ENROLLED', 'ACTIVE'] } },
          }),
          database.pilotParticipant.count({
            where: {
              pilotId: pilot.id,
              trainingRequired: true,
              status: { in: ['ENROLLED', 'ACTIVE'] },
            },
          }),
          database.trainingAssignment.count({
            where: { pilotId: pilot.id, status: { in: ['COMPLETED', 'WAIVED'] } },
          }),
          database.pilotBaselineMetric.count({
            where: { pilotId: pilot.id, verifiedAt: { not: null } },
          }),
        ]);
      const checks = {
        configuration: Boolean(pilot.configuration),
        readinessGates: gates === 0,
        severeIncidents: incidents === 0,
        participants: participants > 0,
        training: requiredTraining === 0 || completedTraining >= requiredTraining,
        verifiedBaseline: baselines > 0,
        humanApproval: Boolean(pilot.approvedAt),
        noMainnetMode: pilot.hederaMode !== ('MAINNET' as never),
      };
      const passed = Object.values(checks).every(Boolean);
      blocked ||= !passed;
      console.log(
        JSON.stringify(
          {
            pilotId: pilot.id,
            code: pilot.code,
            status: pilot.status,
            passed,
            checks,
            counts: {
              gates,
              incidents,
              participants,
              requiredTraining,
              completedTraining,
              baselines,
            },
          },
          null,
          2,
        ),
      );
    }
    if (blocked && !allowBlocked) process.exitCode = 2;
  } finally {
    await database.$disconnect();
  }
}

void main();
