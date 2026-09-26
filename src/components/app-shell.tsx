import Link from 'next/link';
import { KeyRound, LogOut } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth/session';
import { BrandLockup, initials } from '@/components/brand';
import { NavLinks } from '@/components/nav-links';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
}

const ROLE_LABEL: Record<CurrentUser['role'], string> = { student: 'Student', teacher: 'Faculty', admin: 'Administrator' };
const ROLE_TONE: Record<CurrentUser['role'], string> = {
  student: 'bg-accent-soft text-accent',
  teacher: 'bg-info-soft text-info',
  admin: 'bg-primary-soft text-primary',
};

/** Shared chrome for the student / teacher / admin areas. */
export function AppShell({ user, nav, children }: { user: CurrentUser; nav: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <Link href={nav[0]?.href ?? '/'} className="shrink-0 rounded-lg focus-visible:outline-none">
            <BrandLockup subtitle={ROLE_LABEL[user.role] + ' portal'} />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2.5 sm:flex">
              <span className={cn('grid h-8 w-8 place-items-center rounded-full text-xs font-semibold', ROLE_TONE[user.role])} aria-hidden>
                {initials(user.fullName)}
              </span>
              <span className="leading-tight">
                <span className="block max-w-44 truncate text-[13px] font-medium">{user.fullName}</span>
                <span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</span>
              </span>
            </div>
            <Link
              href="/account/password"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Change password</span>
              <span className="sm:hidden">Password</span>
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <NavLinks items={nav} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
        Sri Sri University · Open &amp; Distance Learning · All times are Indian Standard Time (IST)
      </footer>
    </div>
  );
}
