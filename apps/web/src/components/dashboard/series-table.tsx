'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Accessible, searchable chart alternative. Values keep their original units. */
export function SeriesTable({
  rows,
  label,
  unit,
}: {
  rows: { label: string; value: number }[];
  label: string;
  unit?: string | null | undefined;
}) {
  const [search, setSearch] = useState('');
  const [descending, setDescending] = useState(false);
  const [sortValue, setSortValue] = useState(false);
  const [page, setPage] = useState(1);
  const filtered = rows.filter((row) => row.label.toLowerCase().includes(search.toLowerCase()));
  const sorted = sortValue
    ? [...filtered].sort((a, b) => (descending ? b.value - a.value : a.value - b.value))
    : filtered;
  const pages = Math.max(1, Math.ceil(sorted.length / 10));
  const currentPage = Math.min(page, pages);
  return (
    <details className="mt-4 rounded-lg border border-border">
      <summary className="px-3 py-2 text-xs font-semibold text-primary">Explore chart data</summary>
      <div className="space-y-3 border-t border-border p-3">
        <label className="relative block">
          <span className="sr-only">Search {label} data</span>
          <Search
            aria-hidden="true"
            className="absolute top-3 left-3 size-4 text-muted-foreground"
          />
          <Input
            className="pl-9"
            value={search}
            placeholder="Search data…"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{label} chart data</caption>
          <thead>
            <tr>
              <th scope="col" className="py-2">
                Period / category
              </th>
              <th
                scope="col"
                aria-sort={sortValue ? (descending ? 'descending' : 'ascending') : 'none'}
                className="py-2 text-right"
              >
                <button
                  className="inline-flex items-center gap-1"
                  onClick={() => {
                    setSortValue(true);
                    setDescending(!descending);
                    setPage(1);
                  }}
                >
                  Value{unit ? ` (${unit})` : ''}
                  {descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice((currentPage - 1) * 10, currentPage * 10).map((row) => (
              <tr key={row.label}>
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-right tabular-nums">
                  {new Intl.NumberFormat('en-UG', { maximumFractionDigits: 2 }).format(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            No matching data.
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Page {currentPage} of {pages} · {sorted.length} entries
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </details>
  );
}
