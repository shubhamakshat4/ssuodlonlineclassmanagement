import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandLogo } from '@/components/brand';

export const metadata = {
  title: 'Online Classes — Sri Sri University',
  description: 'Live online classes for Sri Sri University Open & Distance Learning.',
};

/**
 * Landing page: the building, the name, and a way in. Nothing else — anyone arriving here is either
 * signing in or has followed a link by mistake.
 *
 * The photograph is a tall portrait, so it is given its own column on the right rather than being
 * stretched across the page: the whole silhouette stays visible, and its left edge dissolves into the
 * maroon so the type has a clean, dark field to sit on.
 */
export default function Home() {
  return (
    <main className="relative grid min-h-screen grid-rows-[auto_1fr_auto] overflow-hidden">
      {/* Not -z-10: a negative index would paint this behind the page background and hide it.
          One full-bleed layer, so there is no column edge to show a seam. */}
      <div className="absolute inset-0 bg-[#300d0d]">
        <Image
          src="/brand/building.jpg"
          alt="The Sri Sri International Center for Integrated Medicine on the Sri Sri University campus"
          fill
          priority
          sizes="100vw"
          className="hero-pan object-cover object-[50%_32%]"
        />
        {/* Opaque where the type sits, clear over the building. */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#300d0d_0%,rgba(48,13,13,0.97)_22%,rgba(48,13,13,0.72)_38%,rgba(48,13,13,0.28)_58%,transparent_78%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(28,7,7,0.6)_0%,transparent_26%,transparent_66%,rgba(28,7,7,0.7)_100%)]" />
      </div>

      <header className="fade-up relative px-6 pt-8 sm:px-10">
        <BrandLogo variant="white" width={200} className="h-auto w-[164px] sm:w-[200px]" />
      </header>

      <section className="relative flex items-center px-6 py-14 sm:px-10">
        <div className="max-w-xl">
          <p className="fade-up text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70" style={{ animationDelay: '60ms' }}>
            Open &amp; Distance Learning
          </p>
          <h1 className="fade-up mt-4 text-[2.75rem] font-semibold leading-[1.04] tracking-tight text-white sm:text-6xl" style={{ animationDelay: '140ms' }}>
            Online Classes
          </h1>
          <p className="fade-up mt-5 max-w-md text-[17px] leading-relaxed text-white/80" style={{ animationDelay: '220ms' }}>
            Your timetable, your class link, your recordings.
          </p>

          <div className="fade-up mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: '300ms' }}>
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-[#6d1414] shadow-lg shadow-black/30 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              Sign in
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/login/reset"
              className="inline-flex items-center justify-center rounded-xl border border-white/35 px-7 py-3.5 text-[15px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:border-white/60 hover:bg-white/10"
            >
              Forgotten password
            </Link>
          </div>
        </div>
      </section>

      <footer className="fade-up relative px-6 pb-8 text-[13px] text-white/55 sm:px-10" style={{ animationDelay: '380ms' }}>
        Sri Sri University, Cuttack &middot; All times are Indian Standard Time
      </footer>
    </main>
  );
}
