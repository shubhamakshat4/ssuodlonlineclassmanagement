import Image from 'next/image';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand';

/**
 * Shared frame for the sign-in / reset / password pages: the campus on the left, the card on the
 * right. Deliberately sparse — the only thing to do here is sign in.
 */
export function AuthFrame({ title, intro, children, footer }: { title: string; intro?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block">
        <Image
          src="/brand/campus.jpg"
          alt="The Sri Sri University campus at Cuttack"
          fill
          priority
          sizes="55vw"
          className="hero-pan object-cover object-[30%_62%] saturate-[1.15] contrast-[1.06]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(24,7,7,0.86)_0%,rgba(38,10,10,0.42)_45%,rgba(24,7,7,0.9)_100%)]" />
        <div className="absolute inset-0 bg-[#6d1414] mix-blend-multiply opacity-[0.22]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="inline-block">
            <BrandLogo variant="white" width={200} className="fade-up h-auto w-[200px]" />
          </Link>
          <div className="fade-up" style={{ animationDelay: '120ms' }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">Open &amp; Distance Learning</p>
            <p className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-white">Online Classes</p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="fade-up w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="inline-block">
              <BrandLogo width={176} className="h-auto w-[176px]" />
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {intro ? <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</div> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-7 border-t border-border pt-5 text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}
