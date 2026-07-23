import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

const join = (...values: Array<string | undefined>): string => values.filter(Boolean).join(' ');

export function Button({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={join(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      type={type}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={join(
        'rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export type StatusTone = 'neutral' | 'positive' | 'negative' | 'warning';

const statusTone: Record<StatusTone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  positive: 'bg-emerald-100 text-emerald-800',
  negative: 'bg-red-100 text-red-800',
  warning: 'bg-amber-100 text-amber-900',
};

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span
      className={join(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide',
        statusTone[tone],
      )}
    >
      {children}
    </span>
  );
}

export function LoadingIndicator({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <span
        className="size-5 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden="true"
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-12 text-center">
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
      <h2 className="font-semibold text-red-900">{title}</h2>
      <p className="mt-1 text-red-800">{message}</p>
    </div>
  );
}
