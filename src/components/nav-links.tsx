'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/components/app-shell';
import { cn } from '@/lib/utils';

/** Role navigation with an active state. Horizontal, scrolls on small screens. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item, i) => {
        const active = i === 0 ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              active ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
