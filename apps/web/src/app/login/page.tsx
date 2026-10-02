import { ArrowUpRight, Route, ShieldCheck, Sprout, Wallet } from 'lucide-react';
import { LoginForm } from '@/components/login-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between xl:p-20">
        <div
          aria-hidden="true"
          className="absolute -right-40 -bottom-40 size-[600px] rounded-full border border-emerald-300/10 p-16"
        >
          <div className="size-full rounded-full border border-emerald-300/10 p-16">
            <div className="size-full rounded-full bg-emerald-400/5" />
          </div>
        </div>
        <p className="relative flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-emerald-300 uppercase">
          <Sprout className="size-5" />
          Connected agriculture
        </p>
        <div className="relative my-16 max-w-lg">
          <h2 className="font-display text-5xl leading-[1.15] font-semibold tracking-tight">
            Better visibility.
            <br />
            Stronger operations.
            <br />
            <span className="text-emerald-300">From farm to market.</span>
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-sidebar-foreground/65">
            A shared workspace for agricultural teams to coordinate collection, trace products, and
            manage transparent settlement.
          </p>
          <div className="mt-10 space-y-5">
            {[
              {
                icon: Route,
                title: 'Trace every step',
                text: 'Connected delivery and product records',
              },
              {
                icon: Wallet,
                title: 'Bring clarity to settlement',
                text: 'Financial workflows in one workspace',
              },
              {
                icon: ShieldCheck,
                title: 'Work with confidence',
                text: 'Organization-scoped, role-based access',
              },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-4">
                <span className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <item.icon className="size-5 text-emerald-300" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-sidebar-foreground/60">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-sidebar-foreground/50">
          ClyCites Verifiable Agriculture Platform
          <ArrowUpRight className="size-3" />
        </p>
      </section>
      <div className="flex items-center justify-center px-5 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Workspace access
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">
            Sign in to ClyCites
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Use your assigned staff account to continue.
          </p>
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <LoginForm />
          </div>
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            Traceable agricultural trade, from farmer delivery
            <br />
            to transparent settlement.
          </p>
        </div>
      </div>
    </div>
  );
}
