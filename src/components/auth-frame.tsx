import Link from 'next/link';
import { BrandLockup } from '@/components/brand';

/** Shared frame for the sign-in / error / password pages: brand on the left, card on the right. */
export function AuthFrame({ title, intro, children, footer }: { title: string; intro?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-6 py-10 md:grid-cols-[1.1fr_1fr]">
      <section className="hidden md:block">
        <Link href="/" className="inline-block">
          <BrandLockup />
        </Link>
        <h2 className="mt-10 text-4xl font-semibold leading-[1.1] tracking-tight">
          Your classes, <span className="text-primary">one click</span> away.
        </h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          Live online classes for Sri Sri University&apos;s Open &amp; Distance Learning programmes — timetable, join links, and recordings for 30 days after every
          class.
        </p>
        <ul className="mt-8 grid gap-3 text-sm text-foreground/80">
          {['Join from any device, no installs', 'Recordings available for 30 days', 'Attendance recorded when you join'].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-accent">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12 5 5L20 7" />
                </svg>
              </span>
              {t}
            </li>
          ))}
        </ul>
      </section>
      <section className="rise-in w-full max-w-md justify-self-center rounded-2xl border border-border bg-surface p-7 shadow-float md:justify-self-end">
        <div className="mb-6 md:hidden">
          <Link href="/" className="inline-block">
            <BrandLockup />
          </Link>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {intro ? <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{intro}</div> : null}
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">{footer}</div> : null}
      </section>
    </main>
  );
}
