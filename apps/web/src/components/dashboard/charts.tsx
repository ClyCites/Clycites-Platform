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

export function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const trendColor =
    kpi.trend === 'UP'
      ? 'text-emerald-600'
      : kpi.trend === 'DOWN'
        ? 'text-red-600'
        : 'text-muted-foreground';
  const trendSymbol = kpi.trend === 'UP' ? '▲' : kpi.trend === 'DOWN' ? '▼' : '■';
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {kpi.label}
        </p>
        <p className="mt-2 font-display text-2xl font-bold text-foreground">
          {formatNumber(kpi.value, kpi.unit)}
        </p>
        {kpi.deltaPercent !== null && (
          <p className={cn('mt-1 text-xs font-medium', trendColor)}>
            {trendSymbol} {formatNumber(Math.abs(kpi.deltaPercent), '%')} vs previous
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

export function LineChart({ series }: { series: TimeSeries }) {
  const { width, height, padding } = geometry;
  const points = series.points;
  const max = Math.max(1, ...points.map((point) => point.value));
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = padding + index * stepX;
    const y = padding + innerHeight - (point.value / max) * innerHeight;
    return { x, y, value: point.value, bucket: point.bucket };
  });

  const linePath = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x} ${coord.y}`).join(' ');
  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1]!.x} ${padding + innerHeight} L ${coords[0]!.x} ${padding + innerHeight} Z`
      : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{series.label}</CardTitle>
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
            <path d={areaPath} fill="var(--chart-1)" opacity={0.12} />
            <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2.5} strokeLinejoin="round" />
            {coords.map((coord) => (
              <circle key={coord.bucket} cx={coord.x} cy={coord.y} r={3} fill="var(--chart-1)">
                <title>{`${coord.bucket}: ${formatNumber(coord.value)}`}</title>
              </circle>
            ))}
          </svg>
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
      <CardContent className="space-y-3">
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
                  style={{ width: `${Math.max(2, (datum.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
