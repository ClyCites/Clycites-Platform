import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES, type AuthenticatedPrincipal } from '@clycites/auth';

import { DatabaseService } from '../database/database.service.js';

interface Check {
  code: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'NOT_MEASURED';
  blocking: boolean;
  message: string;
}

@Injectable()
export class PilotPreflightService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async run(pilotId: string, principal: AuthenticatedPrincipal) {
    const pilot = await this.database.client.pilot.findUnique({
      where: { id: pilotId },
      include: { configuration: true },
    });
    if (
      !pilot ||
      (principal.platformRole !== ROLES.PLATFORM_ADMIN &&
        !principal.memberships.has(pilot.organizationId))
    )
      throw new NotFoundException('Pilot not found');
    const [
      blockingGates,
      severeIncidents,
      participants,
      requiredTraining,
      completedTraining,
      baselines,
    ] = await Promise.all([
      this.database.client.pilotReadinessGate.count({
        where: {
          OR: [{ pilotId: null }, { pilotId }],
          blocking: true,
          status: { notIn: ['READY', 'READY_WITH_RISK', 'NOT_APPLICABLE'] },
        },
      }),
      this.database.client.operationalIncident.count({
        where: {
          organizationId: pilot.organizationId,
          severity: { in: ['SEV1', 'SEV2'] },
          status: { notIn: ['RESOLVED', 'CLOSED'] },
        },
      }),
      this.database.client.pilotParticipant.count({
        where: { pilotId, status: { in: ['ENROLLED', 'ACTIVE'] } },
      }),
      this.database.client.pilotParticipant.count({
        where: { pilotId, trainingRequired: true, status: { in: ['ENROLLED', 'ACTIVE'] } },
      }),
      this.database.client.trainingAssignment.count({
        where: { pilotId, status: { in: ['COMPLETED', 'WAIVED'] } },
      }),
      this.database.client.pilotBaselineMetric.count({
        where: { pilotId, verifiedAt: { not: null } },
      }),
    ]);
    const checks: Check[] = [
      this.check(
        'configuration',
        Boolean(pilot.configuration),
        true,
        'Pilot configuration is present',
      ),
      this.check(
        'readiness-gates',
        blockingGates === 0,
        true,
        `${blockingGates} blocking readiness gates remain`,
      ),
      this.check(
        'severe-incidents',
        severeIncidents === 0,
        true,
        `${severeIncidents} open SEV1/SEV2 incidents remain`,
      ),
      this.check(
        'participants',
        participants > 0,
        true,
        `${participants} participants are enrolled or active`,
      ),
      this.check(
        'training',
        requiredTraining === 0 || completedTraining >= requiredTraining,
        true,
        `${completedTraining}/${requiredTraining} required training assignments are complete or waived`,
      ),
      this.check(
        'verified-baseline',
        baselines > 0,
        true,
        `${baselines} verified baseline metrics are available`,
      ),
      this.check(
        'payment-mode',
        pilot.paymentMode !== 'SANDBOX_PROVIDER',
        false,
        `Payment mode is ${pilot.paymentMode}`,
      ),
      this.check(
        'hedera-mainnet-disabled',
        pilot.hederaMode !== 'DISABLED',
        false,
        `Hedera mode is ${pilot.hederaMode}; mainnet is not supported by pilot configuration`,
      ),
      this.check(
        'human-approval',
        Boolean(pilot.approvedAt),
        true,
        'Human onboarding approval is recorded',
      ),
    ];
    return {
      pilotId,
      passed: checks.every((check) => !check.blocking || check.status === 'PASS'),
      generatedAt: new Date().toISOString(),
      checks,
    };
  }

  private check(code: string, passed: boolean, blocking: boolean, message: string): Check {
    return { code, status: passed ? 'PASS' : blocking ? 'FAIL' : 'WARN', blocking, message };
  }
}
