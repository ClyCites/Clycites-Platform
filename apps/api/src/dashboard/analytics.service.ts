import { Inject, Injectable } from '@nestjs/common';
import type {
  AnalyticsFilter,
  CategoricalSeries,
  DashboardOverview,
  FinanceAnalytics,
  KpiCard,
  TimeSeries,
} from '@clycites/contracts';

import { DatabaseService } from '../database/database.service.js';

type Granularity = AnalyticsFilter['granularity'];

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async overview(organizationId: string, filter: AnalyticsFilter): Promise<DashboardOverview> {
    const from = new Date(`${filter.dateRange.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${filter.dateRange.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const [
      activeFarmers,
      totalDeliveries,
      acceptedDeliveries,
      activeCollectionPoints,
      deliveriesInRange,
      deliveriesByStatus,
    ] = await Promise.all([
      this.database.client.farmerOrganizationMembership.count({
        where: { organizationId, status: 'ACTIVE' },
      }),
      this.database.client.delivery.count({
        where: { organizationId, serverReceivedAt: { gte: from, lt: toExclusive } },
      }),
      this.database.client.delivery.count({
        where: {
          organizationId,
          status: 'ACCEPTED',
          serverReceivedAt: { gte: from, lt: toExclusive },
        },
      }),
      this.database.client.collectionPoint.count({
        where: { organizationId, status: 'ACTIVE' },
      }),
      this.database.client.delivery.findMany({
        where: { organizationId, serverReceivedAt: { gte: from, lt: toExclusive } },
        select: { serverReceivedAt: true },
        orderBy: { serverReceivedAt: 'asc' },
        take: 20_000,
      }),
      this.database.client.delivery.groupBy({
        by: ['status'],
        where: { organizationId, serverReceivedAt: { gte: from, lt: toExclusive } },
        _count: { _all: true },
      }),
    ]);

    const acceptanceRate =
      totalDeliveries > 0 ? Math.round((acceptedDeliveries / totalDeliveries) * 1000) / 10 : 0;

    const kpis: KpiCard[] = [
      this.kpi('active_farmers', 'Active farmers', activeFarmers, null),
      this.kpi('deliveries', 'Deliveries', totalDeliveries, null),
      this.kpi('accepted_deliveries', 'Accepted deliveries', acceptedDeliveries, null),
      this.kpi('acceptance_rate', 'Acceptance rate', acceptanceRate, '%'),
      this.kpi('collection_points', 'Active collection points', activeCollectionPoints, null),
    ];

    const deliveriesSeries: TimeSeries = {
      key: 'deliveries',
      label: 'Deliveries',
      granularity: filter.granularity,
      points: this.bucketByDate(
        deliveriesInRange.map((delivery) => delivery.serverReceivedAt),
        filter.granularity,
      ),
    };

    const statusBreakdown: CategoricalSeries = {
      key: 'delivery_status',
      label: 'Deliveries by status',
      data: deliveriesByStatus.map((row) => ({
        label: this.humanize(row.status),
        value: row._count._all,
      })),
    };

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      kpis,
      timeSeries: [deliveriesSeries],
      breakdowns: [statusBreakdown],
    };
  }

  async finance(organizationId: string, filter: AnalyticsFilter): Promise<FinanceAnalytics> {
    const from = new Date(`${filter.dateRange.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${filter.dateRange.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

    const settlements = await this.database.client.farmerSettlement.findMany({
      where: { organizationId, createdAt: { gte: from, lt: toExclusive } },
      select: {
        currency: true,
        status: true,
        netEntitlementMinor: true,
        grossEntitlementMinor: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 20_000,
    });

    const currency = settlements[0]?.currency ?? 'UGX';
    const grossMinor = settlements.reduce((total, row) => total + row.grossEntitlementMinor, 0n);
    const netMinor = settlements.reduce((total, row) => total + row.netEntitlementMinor, 0n);
    const approvedCount = settlements.filter((row) => row.status === 'APPROVED').length;

    const kpis: KpiCard[] = [
      this.kpi('settlements', 'Settlements', settlements.length, null),
      this.kpi('approved_settlements', 'Approved settlements', approvedCount, null),
      this.kpi('gross_entitlement', 'Gross entitlement', this.minorToMajor(grossMinor), currency),
      this.kpi('net_entitlement', 'Net entitlement', this.minorToMajor(netMinor), currency),
    ];

    const netByDay = new Map<string, bigint>();
    for (const settlement of settlements) {
      const bucket = this.truncate(settlement.createdAt, filter.granularity);
      netByDay.set(bucket, (netByDay.get(bucket) ?? 0n) + settlement.netEntitlementMinor);
    }
    const settlementTimeSeries: TimeSeries = {
      key: 'net_entitlement',
      label: 'Net entitlement',
      granularity: filter.granularity,
      points: [...netByDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([bucket, value]) => ({ bucket, value: this.minorToMajor(value) })),
    };

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      currency,
      kpis,
      settlementTimeSeries: [settlementTimeSeries],
    };
  }

  private kpi(key: string, label: string, value: number, unit: string | null): KpiCard {
    return { key, label, value, unit, deltaPercent: null, trend: null };
  }

  private minorToMajor(minor: bigint): number {
    return Number(minor) / 100;
  }

  private bucketByDate(dates: readonly Date[], granularity: Granularity) {
    const counts = new Map<string, number>();
    for (const date of dates) {
      const bucket = this.truncate(date, granularity);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, value]) => ({ bucket, value }));
  }

  private truncate(date: Date, granularity: Granularity): string {
    const copy = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    if (granularity === 'MONTH') {
      copy.setUTCDate(1);
    } else if (granularity === 'WEEK') {
      const day = copy.getUTCDay();
      const diff = (day + 6) % 7; // Monday as first day of week
      copy.setUTCDate(copy.getUTCDate() - diff);
    }
    return copy.toISOString().slice(0, 10);
  }

  private humanize(value: string): string {
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
