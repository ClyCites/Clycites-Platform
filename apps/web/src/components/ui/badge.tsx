import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  DRAFT: 'bg-muted text-foreground',
  OPEN: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300',
  READY: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300',
  SEALED: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300',
  APPROVED: 'bg-emerald-100 dark:bg-emerald-950 text-primary',
  PASSED: 'bg-emerald-100 dark:bg-emerald-950 text-primary',
  COMPLETED: 'bg-emerald-100 dark:bg-emerald-950 text-primary',
  RECEIVED: 'bg-emerald-100 dark:bg-emerald-950 text-primary',
  PUBLISHED: 'bg-emerald-100 dark:bg-emerald-950 text-primary',
  FAILED: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300',
  REJECTED: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300',
  CANCELLED: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300',
  DISPATCHED: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300',
  CONSUMED: 'bg-secondary text-foreground',
  PRIVATE: 'bg-muted text-foreground',
  PENDING: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300',
  QUEUED: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300',
  SUBMITTING: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300',
  SUBMITTED: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300',
  CONFIRMING: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300',
  CONFIRMED: 'bg-emerald-100 dark:bg-emerald-950 text-primary',
  VERIFIED: 'bg-emerald-100 dark:bg-emerald-950 text-primary',
  PARTIALLY_VERIFIED: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300',
  RETRYABLE_FAILURE: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300',
  PERMANENT_FAILURE: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300',
  MISMATCH: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300',
  CHAIN_BROKEN: 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300',
  SUPERSEDED: 'bg-secondary text-foreground',
  NOT_ANCHORED: 'bg-muted text-foreground',
  ANCHOR_PENDING: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300',
};
export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const value = typeof children === 'string' ? children : '';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide',
        tones[value] ?? tones.DRAFT,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
