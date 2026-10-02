import type { ReactNode } from 'react';
import { Button } from './button';

export type DataColumn<T> = {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  caption,
  pagination,
  onPageChange,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  caption: string;
  pagination?: { page: number; totalItems: number; totalPages: number } | undefined;
  onPageChange?: (page: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  scope="col"
                  key={column.key}
                  className={`px-5 py-4 whitespace-nowrap ${column.className ?? ''}`}
                >
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key} className={`px-5 py-4 ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && onPageChange && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {pagination.totalItems} records · Page {pagination.page} of{' '}
            {Math.max(1, pagination.totalPages)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
