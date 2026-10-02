import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card text-card-foreground shadow-[0_2px_8px_-4px_rgb(0_0_0/0.12)]',
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-1.5 border-b border-border p-6', className)} {...props} />
  );
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('font-display text-base leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  );
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-border p-6', className)}
      {...props}
    />
  );
}
