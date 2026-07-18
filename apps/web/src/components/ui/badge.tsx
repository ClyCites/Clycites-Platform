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
};
export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const value = typeof children === 'string' ? children : '';
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-bold',
        tones[value] ?? tones.DRAFT,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
