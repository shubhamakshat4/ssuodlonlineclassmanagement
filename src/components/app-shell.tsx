import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth/session';
import { Badge } from '@/components/ui/primitives';

export interface NavItem {
  href: string;
  label: string;
}

/** Shared chrome for the student / teacher / admin areas. */
export function AppShell({ user, nav, children }: { user: CurrentUser; nav: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={nav[0]?.href ?? '/'} className="font-semibold">
            SSU ODL Classes
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-2.5 py-1.5 hover:bg-muted">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden sm:inline">{user.fullName}</span>
            <Badge variant="outline">{user.role}</Badge>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-muted-foreground hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground">All times are Indian Standard Time (IST).</footer>
    </div>
  );
}
