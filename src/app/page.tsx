import Link from 'next/link';
import { ArrowRight, GraduationCap, ShieldCheck, Video } from 'lucide-react';
import { BrandLockup } from '@/components/brand';

const FEATURES = [
  { icon: Video, title: 'Join Now, right on time', text: 'The button opens 10 minutes before class and records that you joined from the portal.' },
  { icon: GraduationCap, title: 'Your timetable, always current', text: 'Weekly schedule, extra classes, cancellations and link changes appear automatically.' },
  { icon: ShieldCheck, title: 'Recordings for 30 days', text: 'Streamed securely from the university’s Microsoft 365 — only for enrolled students.' },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <BrandLockup />
        <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Faculty / admin sign in
        </Link>
      </header>

      <section className="rise-in my-auto grid items-center gap-12 py-16 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Open &amp; Distance Learning</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl">
            Online classes,
            <br />
            beautifully simple.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            See today&apos;s classes, join with one click, and catch up with recordings for 30 days. Built for Sri Sri University&apos;s ODL students and faculty.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login/student"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-md transition-all hover:bg-primary-hover hover:shadow-lg"
            >
              <GraduationCap className="h-5 w-5" aria-hidden />
              Student sign in with Google
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-6 text-[15px] font-medium shadow-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/60"
            >
              Faculty / admin
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Students use their @srisriuniversity.edu.in Google account. Faculty and admins sign in with email and password.</p>
        </div>

        <div className="grid gap-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-xl border border-border bg-surface p-5 shadow-card">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="font-semibold tracking-tight">{title}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-xs text-muted-foreground">Sri Sri University · ODL online class portal · All times IST</footer>
    </main>
  );
}
