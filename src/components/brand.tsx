import { cn } from '@/lib/utils';

/** SSU ODL brand mark: a lotus-like monogram in the saffron accent. */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-[#e0691f] text-white shadow-sm', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3c2.5 2.2 3.8 5 3.8 8.2S14.5 17.4 12 19.5c-2.5-2.1-3.8-5-3.8-8.3S9.5 5.2 12 3Z" />
        <path d="M5.5 8.5c2.6.4 4.6 1.9 5.9 4.4M18.5 8.5c-2.6.4-4.6 1.9-5.9 4.4" />
        <path d="M4 15.5c2.2 2.4 5 3.6 8 3.6s5.8-1.2 8-3.6" />
      </svg>
    </span>
  );
}

export function BrandLockup({ subtitle, className }: { subtitle?: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">SSU ODL Classes</span>
        <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{subtitle ?? 'Sri Sri University'}</span>
      </span>
    </span>
  );
}

export function initials(name: string) {
  return name
    .replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
