import { Sprout } from 'lucide-react';

import { LoginForm } from '@/components/login-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-16">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sprout className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Workspace access
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
            Sign in to ClyCites
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your assigned staff account to continue.
          </p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Traceable agricultural trade, from farmer delivery to transparent settlement.
        </p>
      </div>
    </div>
  );
}
