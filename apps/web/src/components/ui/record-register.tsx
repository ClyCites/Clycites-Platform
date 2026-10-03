'use client';

import { useState, type ReactNode } from 'react';
import { Input } from './input';
import { Select } from './select';
import { Label } from './label';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { DataTable } from './data-table';
import { Badge } from './badge';
import { Button } from './button';
import { useOrgPermission } from './workflow-form';
import { EmptyState, ErrorState, LoadingIndicator } from '@clycites/ui';

export type RegisterRow = Record<string, unknown> & { id: string };
export const recordValue = (record: RegisterRow, field: string): unknown =>
  field
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      record,
    );
export const recordText = (record: RegisterRow, field: string): string => {
  const value = recordValue(record, field);
  return value == null
    ? '—'
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : '—';
};
export type RegisterColumn = {
  key: string;
  title: string;
  status?: boolean;
  format?: (row: RegisterRow) => ReactNode;
};

export function RecordRegister({
  title,
  description,
  path,
  columns,
  permission,
  organizationId,
  actions,
  rowsKey = 'items',
}: {
  title: string;
  description?: string;
  path: string;
  rowsKey?: string;
  columns: RegisterColumn[];
  permission?: string;
  organizationId?: string;
  actions?: (row: RegisterRow) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const can = useOrgPermission(organizationId);
  const allowed = !permission || can(permission);
  const query = useQuery({
    queryKey: ['register', path],
    queryFn: () => apiRequest<RegisterRow[] | Record<string, RegisterRow[]>>(path),
    enabled: allowed,
  });
  const rows = (
    query.data ? (Array.isArray(query.data) ? query.data : (query.data[rowsKey] ?? [])) : []
  ).map((row, index) => ({ ...row, id: row.id ?? `${path}-${index}` }));
  const filtered = rows.filter((row) =>
    columns.some((column) =>
      recordText(row, column.key).toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const ordered = sort
    ? [...filtered].sort(
        (a, b) =>
          recordText(a, sort).localeCompare(recordText(b, sort), undefined, { numeric: true }) *
          (descending ? -1 : 1),
      )
    : filtered;
  const totalPages = Math.max(1, Math.ceil(ordered.length / 20));
  const currentPage = Math.min(page, totalPages);
  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="ledger-kicker mb-1">Register</p>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {allowed && (
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        )}
      </header>
      {!allowed ? (
        <p className="text-sm text-muted-foreground">
          Your organization role does not include access to this register.
        </p>
      ) : (
        <>
          {query.isLoading && <LoadingIndicator label={`Loading ${title.toLowerCase()}`} />}
          {query.error && <ErrorState message={query.error.message} />}
          {query.data &&
            (rows.length === 0 ? (
              <EmptyState
                title="No records yet"
                description={`New ${title.toLowerCase()} records will appear here.`}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Label className="min-w-48 flex-1">
                    Search {title.toLowerCase()}
                    <Input
                      type="search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                    />
                  </Label>
                  <Label>
                    Sort by
                    <Select
                      value={sort}
                      onChange={(event) => {
                        setSort(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Original order</option>
                      {columns.map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.title}
                        </option>
                      ))}
                    </Select>
                  </Label>
                  {sort && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDescending((value) => !value)}
                    >
                      {descending ? 'Descending' : 'Ascending'}
                    </Button>
                  )}
                </div>
                {ordered.length === 0 && (
                  <p role="status" className="text-sm text-muted-foreground">
                    No records match your search.
                  </p>
                )}
                <DataTable
                  caption={title}
                  rows={ordered.slice((currentPage - 1) * 20, currentPage * 20)}
                  pagination={{ page: currentPage, totalItems: ordered.length, totalPages }}
                  onPageChange={setPage}
                  columns={[
                    ...columns.map((column) => ({
                      key: column.key,
                      title: column.title,
                      render: (row: RegisterRow) =>
                        column.format ? (
                          column.format(row)
                        ) : column.status ? (
                          <Badge>{recordText(row, column.key)}</Badge>
                        ) : (
                          recordText(row, column.key)
                        ),
                    })),
                    ...(actions ? [{ key: 'actions', title: 'Actions', render: actions }] : []),
                  ]}
                />
              </div>
            ))}
        </>
      )}
    </section>
  );
}
