import Link from 'next/link';
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { SeriesTable } from './series-table';
import type { CategoricalSeries, KpiCard as KpiCardData, TimeSeries } from '@clycites/contracts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const formatNumber = (value: number, unit?: string | null): string => {
  const formatted =
    Math.abs(value) >= 1000
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  if (!unit) return formatted;
  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
};

export function KpiCard({ kpi, href }: { kpi: KpiCardData; href?: string | undefined }) {
  const trendColor =
    kpi.trend === 'UP'
      ? 'text-primary'
      : kpi.trend === 'DOWN'
        ? 'text-muted-foreground'
        : 'text-muted-foreground';
  const TrendIcon = kpi.trend === 'UP' ? TrendingUp : kpi.trend === 'DOWN' ? TrendingDown : Minus;
  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {href ? (
            <Link
              href={href}
              className="flex items-center justify-between gap-2 after:absolute after:inset-0"
            >
              {kpi.label}
              <ArrowUpRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
            </Link>
          ) : (
            kpi.label
          )}
        </p>
        <p className="mt-4 font-display text-3xl font-semibold tabular-nums text-foreground">
          {formatNumber(kpi.value, kpi.unit)}
        </p>
        {kpi.deltaPercent !== null && (
          <p className={cn('mt-3 flex items-center gap-1.5 text-xs font-medium', trendColor)}>
            <TrendIcon className="size-3.5" aria-hidden="true" />{' '}
            {formatNumber(Math.abs(kpi.deltaPercent), '%')} vs previous
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface ChartGeometry {
  width: number;
  height: number;
  padding: number;
}

const geometry: ChartGeometry = { width: 640, height: 220, padding: 28 };

export function LineChart({ series, unit }: { series: TimeSeries; unit?: string | null }) {
  const { width, height, padding } = geometry;
  const points = series.points;
  const max = Math.max(1, ...points.map((point) => point.value));
  const min = Math.min(0, ...points.map((point) => point.value));
  const range = max - min;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = padding + index * stepX;
    const y = padding + innerHeight - ((point.value - min) / range) * innerHeight;
    return { x, y, value: point.value, bucket: point.bucket };
  });

  const linePath = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`)
    .join(' ');
  const baseline = padding + innerHeight - ((0 - min) / range) * innerHeight;
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1]!.x} ${baseline} L ${coords[0]!.x} ${baseline} Z`
      : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{series.label}</CardTitle>
        {unit && <p className="text-xs text-muted-foreground">Values in {unit}</p>}
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data for this range</p>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-56 w-full"
            role="img"
            aria-label={`${series.label} time series`}
          >
            {[0, 0.5, 1].map((ratio) => (
              <g key={ratio}>
                <line
                  x1={padding}
                  x2={width - padding}
                  y1={padding + innerHeight * ratio}
                  y2={padding + innerHeight * ratio}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding}
                  y={padding + innerHeight * ratio - 6}
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  {formatNumber(max - range * ratio)}
                </text>
              </g>
            ))}
            <path d={areaPath} fill="var(--chart-1)" opacity={0.12} />
            <path
              d={linePath}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            {coords.map((coord) => (
              <circle
                tabIndex={0}
                aria-label={`${coord.bucket}: ${formatNumber(coord.value, unit)}`}
                key={coord.bucket}
                cx={coord.x}
                cy={coord.y}
                r={3}
                fill="var(--chart-1)"
              >
                <title>{`${coord.bucket}: ${formatNumber(coord.value, unit)}`}</title>
              </circle>
            ))}
          </svg>
        )}
        {points.length > 0 && (
          <>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{points[0]?.bucket}</span>
              <span>{points.at(-1)?.bucket}</span>
            </div>
            <SeriesTable
              label={series.label}
              unit={unit}
              rows={points.map((point) => ({ label: point.bucket, value: point.value }))}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function BarChart({ series }: { series: CategoricalSeries }) {
  const data = series.data;
  const max = Math.max(1, ...data.map((datum) => datum.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{series.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data for this range</p>
        ) : (
          data.map((datum) => (
            <div key={datum.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{datum.label}</span>
                <span className="text-muted-foreground">{formatNumber(datum.value)}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, (datum.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
        {data.length > 0 && <SeriesTable label={series.label} rows={data} />}
      </CardContent>
    </Card>
  );
}
