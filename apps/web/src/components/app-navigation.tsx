'use client';

import {
  Activity,
  ArrowUpRight,
  Building2,
  ChevronRight,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  ServerCog,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { Button, IconButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from './auth-provider';

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

export function AppNavigation({ children }: { children: ReactNode }) {
  const { user, loading, activeOrganizationId, selectOrganization, signOut } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const publicPage =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/offline' ||
    pathname === '/system-status' ||
    pathname.startsWith('/trace/') ||
    pathname.startsWith('/verify/');
  const routeOrg = pathname.match(/^\/(?:organizations|dashboard)\/([^/]+)/)?.[1];
  const organizationId = routeOrg ?? activeOrganizationId;
  const organization = user?.organizations.find((item) => item.organizationId === organizationId);
  const base = `/organizations/${organizationId}`;
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Workspace',
      items: [
        { href: '/dashboard', label: 'Workspaces', icon: LayoutDashboard },
        ...(organizationId
          ? [
              { href: `/dashboard/${organizationId}`, label: 'Insights', icon: Activity },
              { href: `${base}/overview`, label: 'Organization', icon: Building2 },
              { href: `${base}/farmers`, label: 'Farmers & farms', icon: Users },
            ]
          : []),
      ],
    },
    ...(organizationId
      ? [
          {
            label: 'Agricultural operations',
            items: [
              { href: `${base}/collection`, label: 'Collection', icon: Sprout },
              { href: `${base}/deliveries`, label: 'Deliveries', icon: Truck },
              { href: `${base}/traceability`, label: 'Traceability', icon: Route },
              { href: `${base}/marketplace`, label: 'Marketplace', icon: ShoppingBag },
              { href: `${base}/finance`, label: 'Finance', icon: Wallet },
            ],
          },
        ]
      : []),
    ...(user?.platformRole === 'PLATFORM_ADMIN'
      ? [
          {
            label: 'Platform administration',
            items: [
              { href: '/admin/organizations', label: 'Organizations', icon: ShieldCheck },
              { href: '/admin/hedera', label: 'Hedera network', icon: ServerCog },
              { href: '/admin/operations', label: 'Operations', icon: Activity },
              { href: '/admin/pilots', label: 'Pilots', icon: FlaskConical },
            ],
          },
        ]
      : []),
  ];
  const allItems = groups.flatMap((group) => group.items);
  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  const section = [...allItems].reverse().find((item) => isActive(item.href))?.label ?? 'Workspace';

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const drawer = drawerRef.current;
    const navigationToggle = toggleRef.current;
    drawer?.querySelector<HTMLElement>('button, a, select')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
      if (event.key !== 'Tab' || !drawer) return;
      const elements = Array.from(
        drawer.querySelectorAll<HTMLElement>('a[href], button, select'),
      ).filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      // Restore focus after React removes inert from the content.
      navigationToggle?.focus();
    };
  }, [mobileOpen]);

  const brand = (
    <Link
      href="/"
      className="flex items-center gap-3 font-display text-xl font-semibold tracking-tight"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950">
        <Sprout className="size-6" aria-hidden="true" />
      </span>
      {(!collapsed || mobileOpen || publicPage || !user) && (
        <span>
          ClyCites
          <span className="block font-sans text-[10px] font-medium tracking-[0.2em] opacity-60 uppercase">
            Agriculture platform
          </span>
        </span>
      )}
    </Link>
  );

  if (publicPage || !user)
    return (
      <>
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
            {brand}
            <nav aria-label="Primary navigation" className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                className="text-sm text-muted-foreground hover:text-primary"
                href="/system-status"
              >
                System status
              </Link>
              {!loading && (
                <Link
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  href={user ? '/dashboard' : '/login'}
                >
                  {user ? 'Workspace' : 'Sign in'}
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main id="main-content">{children}</main>
      </>
    );

  return (
    <div
      className={cn(
        'application-shell min-h-screen lg:grid',
        collapsed ? 'lg:grid-cols-[5.5rem_minmax(0,1fr)]' : 'lg:grid-cols-[17rem_minmax(0,1fr)]',
      )}
    >
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {mobileOpen && (
        <button
          tabIndex={-1}
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => {
            setMobileOpen(false);
            toggleRef.current?.focus();
          }}
        />
      )}
      <aside
        ref={drawerRef}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Workspace navigation"
        className={cn(
          'app-sidebar fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:h-screen lg:w-auto',
          mobileOpen ? 'flex' : 'hidden lg:flex',
        )}
      >
        <div className="flex h-24 shrink-0 items-center justify-between gap-2 px-6">
          {brand}
          <button
            className="rounded-lg p-2 lg:hidden"
            aria-label="Close navigation"
            onClick={() => {
              setMobileOpen(false);
              toggleRef.current?.focus();
            }}
          >
            <X className="size-5" />
          </button>
        </div>
        {(!collapsed || mobileOpen) && organization && (
          <div className="mx-4 mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="mb-2 text-[10px] font-semibold tracking-widest text-sidebar-foreground/60 uppercase">
              Active organization
            </p>
            <select
              aria-label="Active organization"
              className="w-full min-w-0 bg-transparent text-sm font-medium text-sidebar-foreground outline-offset-4"
              value={organizationId}
              onChange={(event) => {
                selectOrganization(event.target.value);
                setMobileOpen(false);
              }}
            >
              {user.organizations.map((item) => (
                <option
                  className="bg-sidebar text-sidebar-foreground"
                  key={item.organizationId}
                  value={item.organizationId}
                >
                  {item.organizationName}
                </option>
              ))}
            </select>
          </div>
        )}
        <nav aria-label="Primary navigation" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.label}>
              {(!collapsed || mobileOpen) && (
                <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/50 uppercase">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium',
                      isActive(item.href)
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                        : 'text-sidebar-foreground/75 hover:bg-white/5 hover:text-white',
                      collapsed && !mobileOpen && 'justify-center',
                    )}
                  >
                    <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                    {(!collapsed || mobileOpen) && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {isActive(item.href) && <ChevronRight className="size-4 opacity-60" />}
                      </>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          {(!collapsed || mobileOpen) && (
            <Link
              href="/system-status"
              className="mb-3 flex items-center justify-between text-xs text-sidebar-foreground/65"
            >
              System status
              <ArrowUpRight className="size-3" />
            </Link>
          )}
          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="hidden w-full items-center gap-3 rounded-lg p-2 text-sm text-sidebar-foreground/70 hover:bg-white/5 lg:flex"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
            {!collapsed && 'Collapse navigation'}
          </button>
        </div>
      </aside>
      <div className="min-w-0" inert={mobileOpen ? true : undefined}>
        <header className="app-header sticky top-0 z-30 flex min-h-20 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <IconButton
              ref={toggleRef}
              className="lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </IconButton>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden truncate text-muted-foreground sm:inline">
                {organization?.organizationName ?? 'ClyCites'}
              </span>
              <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
              <span className="truncate font-semibold">{section}</span>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ThemeToggle />
            <details
              className="relative"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector('summary')?.focus();
                }
              }}
            >
              <summary
                aria-label="User menu"
                className="flex cursor-pointer list-none items-center gap-3 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-primary">
                  {user.firstName.slice(0, 1)}
                  {user.lastName.slice(0, 1)}
                </span>
                <span className="hidden text-sm md:block">
                  {user.firstName} {user.lastName}
                  <span className="block text-xs text-muted-foreground">
                    {organization?.role.replaceAll('_', ' ').toLowerCase() ?? 'Platform account'}
                  </span>
                </span>
              </summary>
              <div className="absolute right-0 mt-3 w-60 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
                <p className="mb-3 truncate px-2 text-xs text-muted-foreground">
                  {user.email ?? user.phone ?? user.username}
                </p>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </div>
            </details>
          </div>
        </header>
        <main id="main-content" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
