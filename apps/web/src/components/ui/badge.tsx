import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const tones: Record<string, string> = {
  DRAFT: 'bg-stone-100 text-stone-700',
  OPEN: 'bg-sky-100 text-sky-800',
  READY: 'bg-amber-100 text-amber-900',
  SEALED: 'bg-indigo-100 text-indigo-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  PASSED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  RECEIVED: 'bg-emerald-100 text-emerald-800',
  PUBLISHED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-red-100 text-red-800',
  DISPATCHED: 'bg-sky-100 text-sky-800',
  CONSUMED: 'bg-stone-200 text-stone-700',
  PRIVATE: 'bg-stone-100 text-stone-700',
  PENDING: 'bg-amber-100 text-amber-900',
  QUEUED: 'bg-sky-100 text-sky-800',
  SUBMITTING: 'bg-sky-100 text-sky-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  CONFIRMING: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  VERIFIED: 'bg-emerald-100 text-emerald-800',
  PARTIALLY_VERIFIED: 'bg-amber-100 text-amber-900',
  RETRYABLE_FAILURE: 'bg-amber-100 text-amber-900',
  PERMANENT_FAILURE: 'bg-red-100 text-red-800',
  MISMATCH: 'bg-red-100 text-red-800',
  CHAIN_BROKEN: 'bg-red-100 text-red-800',
  SUPERSEDED: 'bg-stone-200 text-stone-700',
  NOT_ANCHORED: 'bg-stone-100 text-stone-700',
  ANCHOR_PENDING: 'bg-amber-100 text-amber-900',
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
