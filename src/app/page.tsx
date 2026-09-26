import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandLogo } from '@/components/brand';

export const metadata = {
  title: 'Online Classes — Sri Sri University',
  description: 'Live online classes for Sri Sri University Open & Distance Learning.',
};

/**
 * Landing page: the campus, the name, and a way in. Nothing else — anyone arriving here is either
 * signing in or has followed a link by mistake.
 */
export default function Home() {
  return (
    <main className="relative grid min-h-screen grid-rows-[auto_1fr_auto] overflow-hidden">
      {/* Campus photograph, slowly drifting, behind a deep maroon wash so the type stays readable. */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/brand/campus.jpg"
          alt="The Sri Sri University campus at Cuttack"
          fill
          priority
          sizes="100vw"
          className="hero-pan object-cover object-[30%_62%] saturate-[1.15] contrast-[1.06]"
        />
        {/* Dark where the type sits, almost clear over the campus, so the photograph stays a photograph. */}
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(28,8,8,0.93)_0%,rgba(38,10,10,0.78)_30%,rgba(45,14,14,0.34)_62%,rgba(45,14,14,0.12)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(20,6,6,0.5)_0%,transparent_22%,transparent_62%,rgba(20,6,6,0.55)_100%)]" />
        <div className="absolute inset-0 bg-[#6d1414] mix-blend-multiply opacity-[0.18]" />
      </div>

      <header className="fade-up px-6 pt-8 sm:px-10">
        <BrandLogo variant="white" width={200} className="h-auto w-[164px] sm:w-[200px]" />
      </header>

      <section className="flex items-center px-6 py-14 sm:px-10">
        <div className="max-w-2xl">
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
              className="group inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-[15px] font-semibold text-[#6d1414] shadow-lg shadow-black/25 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              Sign in
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="/login/reset"
              className="inline-flex h-13 items-center justify-center rounded-xl border border-white/35 px-7 py-3.5 text-[15px] font-medium text-white/90 backdrop-blur-sm transition-colors hover:border-white/60 hover:bg-white/10"
            >
              Forgotten password
            </Link>
          </div>
        </div>
      </section>

      <footer className="fade-up px-6 pb-8 text-[13px] text-white/55 sm:px-10" style={{ animationDelay: '380ms' }}>
        Sri Sri University, Cuttack &middot; All times are Indian Standard Time
      </footer>
    </main>
  );
}
