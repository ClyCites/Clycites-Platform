import type { SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20',
        className,
      )}
      {...props}
    />
  );
}
