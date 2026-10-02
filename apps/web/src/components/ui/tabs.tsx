'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function RouteTabs({
  items,
  active,
  label = 'Traceability sections',
}: {
  items: Array<{ href: string; label: string }>;
  active?: string;
  label?: string;
}) {
  const pathname = usePathname();
  const activeHref = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href;
  return (
    <nav
      aria-label={label}
      className="flex max-w-full gap-1 overflow-x-auto border-b border-border"
    >
      {items.map((item) => {
        const selected = active ? item.label === active : item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium',
              selected
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
