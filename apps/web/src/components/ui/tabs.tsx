import Link from 'next/link';

import { cn } from '@/lib/utils';

export function RouteTabs({
  items,
  active,
}: {
  items: Array<{ href: string; label: string }>;
  active: string;
}) {
  return (
    <nav
      aria-label="Traceability sections"
      className="flex gap-1 overflow-x-auto border-b border-stone-300"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold',
            item.label === active
              ? 'border-emerald-800 text-emerald-900'
              : 'border-transparent text-stone-600 hover:text-stone-950',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
