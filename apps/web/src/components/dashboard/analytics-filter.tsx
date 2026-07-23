'use client';

import type { AnalyticsFilter } from '@clycites/contracts';

import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const toDateInput = (date: Date): string => date.toISOString().slice(0, 10);

export const defaultAnalyticsFilter = (): AnalyticsFilter => {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  return { dateRange: { from: toDateInput(from), to: toDateInput(to) }, granularity: 'DAY' };
};

export function AnalyticsFilterBar({
  filter,
  onChange,
}: {
  filter: AnalyticsFilter;
  onChange: (filter: AnalyticsFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Label className="w-40">
        From
        <input
          type="date"
          value={filter.dateRange.from}
          max={filter.dateRange.to}
          onChange={(event) =>
            onChange({ ...filter, dateRange: { ...filter.dateRange, from: event.target.value } })
          }
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
      </Label>
      <Label className="w-40">
        To
        <input
          type="date"
          value={filter.dateRange.to}
          min={filter.dateRange.from}
          onChange={(event) =>
            onChange({ ...filter, dateRange: { ...filter.dateRange, to: event.target.value } })
          }
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
      </Label>
      <Label className="w-40">
        Granularity
        <Select
          value={filter.granularity}
          onChange={(event) =>
            onChange({ ...filter, granularity: event.target.value as AnalyticsFilter['granularity'] })
          }
        >
          <option value="DAY">Daily</option>
          <option value="WEEK">Weekly</option>
          <option value="MONTH">Monthly</option>
        </Select>
      </Label>
    </div>
  );
}
