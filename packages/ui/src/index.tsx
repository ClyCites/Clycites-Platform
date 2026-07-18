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
        'inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50',
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
      className={join('rounded-lg border border-stone-200 bg-white p-6 shadow-sm', className)}
      {...props}
    />
  );
}

export type StatusTone = 'neutral' | 'positive' | 'negative' | 'warning';

const statusTone: Record<StatusTone, string> = {
  neutral: 'bg-stone-100 text-stone-700',
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
        'inline-flex rounded-full px-2.5 py-1 text-sm font-semibold',
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
        className="size-5 animate-spin rounded-full border-2 border-stone-300 border-t-emerald-700"
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-8 text-center">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <p className="mt-2 text-stone-600">{description}</p>
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
