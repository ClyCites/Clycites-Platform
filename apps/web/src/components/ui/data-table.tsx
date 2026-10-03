import type { ReactNode } from 'react';
import { Button } from './button';
import {
  Table,
  TableCaption,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './table';

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
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="overflow-x-auto">
        <Table className="w-full text-left text-sm">
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader className="bg-muted/60 text-muted-foreground">
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  scope="col"
                  key={column.key}
                  className={`px-4 py-3 whitespace-nowrap ${column.className ?? ''}`}
                >
                  {column.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((column) => (
                  <TableCell key={column.key} className={`px-4 py-3 ${column.className ?? ''}`}>
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pagination && onPageChange && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
