import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Button({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
