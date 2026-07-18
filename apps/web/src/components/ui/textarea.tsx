import type { TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-md border border-stone-300 bg-white p-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20',
        className,
      )}
      {...props}
    />
  );
}
