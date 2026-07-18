import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'min-h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:bg-stone-100',
        className,
      )}
      {...props}
    />
  );
}
