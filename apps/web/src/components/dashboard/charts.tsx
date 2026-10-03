'use client';

import Link from 'next/link';
import { useId } from 'react';
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoricalSeries, KpiCard as KpiCardData, TimeSeries } from '@clycites/contracts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { SeriesTable } from './series-table';

export const formatNumber = (value: number, unit?: string | null): string => {
  const formatted = new Intl.NumberFormat('en-UG', {
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 2,
  }).format(value);
  return !unit ? formatted : unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
};

export function KpiCard({ kpi, href }: { kpi: KpiCardData; href?: string | undefined }) {
  const TrendIcon = kpi.trend === 'UP' ? TrendingUp : kpi.trend === 'DOWN' ? TrendingDown : Minus;
  return (
    <article className="ledger-metric relative min-w-0 px-1 pb-2">
      <p className="ledger-kicker">
        {href ? (
          <Link
            href={href}
            className="flex items-center justify-between gap-2 after:absolute after:inset-0"
          >
            {kpi.label}
            <ArrowUpRight className="size-3.5 text-primary" aria-hidden="true" />
          </Link>
        ) : (
          kpi.label
        )}
      </p>
      <p className="mt-3 font-display text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
        {formatNumber(kpi.value, kpi.unit)}
      </p>
      {kpi.deltaPercent !== null && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendIcon className="size-3.5" aria-hidden="true" />
          {formatNumber(Math.abs(kpi.deltaPercent), '%')} vs previous
        </p>
      )}
    </article>
  );
}

const shortBucket = (value: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(value)
    ? new Intl.DateTimeFormat('en-UG', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Africa/Kampala',
      }).format(new Date(value.slice(0, 10)))
    : value;

export function LineChart({ series, unit }: { series: TimeSeries; unit?: string | null }) {
  const gradient = `ledger-area-${useId().replaceAll(':', '')}`;
  const config = { value: { label: series.label, color: 'var(--chart-1)' } } satisfies ChartConfig;
  const rows = series.points.map((point) => ({ label: point.bucket, value: point.value }));
  return (
    <section className="ledger-surface min-w-0 rounded-md p-5 sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="ledger-kicker">Intake & movement</p>
          <h2 className="mt-1 font-display text-lg font-semibold">{series.label}</h2>
        </div>
        <span className="ledger-kicker">{unit ?? 'Recorded count'}</span>
      </header>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No data for this range</p>
      ) : (
        <ChartContainer
          config={config}
          className="h-[260px] w-full"
          aria-label={`${series.label} time series`}
        >
          <AreaChart
            accessibilityLayer
            data={rows}
            margin={{ left: -20, right: 8, top: 8, bottom: 8 }}
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="2 5" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              minTickGap={30}
              tickMargin={12}
              tickFormatter={shortBucket}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(value: number) =>
                new Intl.NumberFormat('en-UG', { notation: 'compact' }).format(value)
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => String(value)}
                  formatter={(value) => (
                    <span className="font-mono font-semibold tabular-nums">
                      {formatNumber(Number(value), unit)}
                    </span>
                  )}
                />
              }
            />
            <Area
              type="linear"
              dataKey="value"
              stroke="var(--color-value)"
              fill={`url(#${gradient})`}
              strokeWidth={2}
              isAnimationActive={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ChartContainer>
      )}
      {rows.length > 0 && <SeriesTable label={series.label} unit={unit} rows={rows} />}
    </section>
  );
}

export function BarChart({ series }: { series: CategoricalSeries }) {
  const config = { value: { label: 'Records', color: 'var(--chart-1)' } } satisfies ChartConfig;
  const color = (label: string, index: number) =>
    /reject|fail|cancel/i.test(label)
      ? 'var(--chart-4)'
      : /pending|draft|review/i.test(label)
        ? 'var(--chart-3)'
        : `var(--chart-${(index % 3) + 1})`;
  return (
    <section className="ledger-surface min-w-0 rounded-md p-5 sm:p-6">
      <header className="mb-5">
        <p className="ledger-kicker">Record distribution</p>
        <h2 className="mt-1 font-display text-lg font-semibold">{series.label}</h2>
      </header>
      {series.data.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No data for this range</p>
      ) : (
        <>
          <ChartContainer
            config={config}
            className="w-full"
            style={{ height: Math.max(220, Math.min(420, series.data.length * 44)) }}
            aria-label={series.label}
          >
            <RechartsBarChart
              accessibilityLayer
              data={series.data}
              layout="vertical"
              margin={{ left: 0, right: 8 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="2 5" />
              <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={100}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="label" />} />
              <Bar dataKey="value" radius={[0, 2, 2, 0]} barSize={14} isAnimationActive={false}>
                {series.data.map((datum, index) => (
                  <Cell key={datum.label} fill={color(datum.label, index)} />
                ))}
              </Bar>
            </RechartsBarChart>
          </ChartContainer>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {series.data.map((datum, index) => (
              <li key={datum.label} className="flex items-center gap-2">
                <span className="size-2" style={{ background: color(datum.label, index) }} />
                {datum.label}
                <span className="font-mono font-medium text-foreground">
                  {formatNumber(datum.value)}
                </span>
              </li>
            ))}
          </ul>
          <SeriesTable label={series.label} rows={series.data} />
        </>
      )}
    </section>
  );
}
