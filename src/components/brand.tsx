import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The university's own marks, taken from srisriuniversity.edu.in:
 *   /brand/sri-logo.png   the seal on its own, for tight spaces
 *   /brand/ssu-logo.png   the full horizontal lockup
 *   /brand/ssu-logo-white.png  the same, reversed out for dark backgrounds
 */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/sri-logo.png"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
      priority
      aria-hidden
    />
  );
}

export function BrandLockup({ subtitle, className }: { subtitle?: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">Online Classes</span>
        <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{subtitle ?? 'Sri Sri University'}</span>
      </span>
    </span>
  );
}

/** The full horizontal logo. `variant="white"` is the reversed version for dark backgrounds. */
export function BrandLogo({ variant = 'colour', width = 220, className }: { variant?: 'colour' | 'white'; width?: number; className?: string }) {
  const colour = variant === 'white';
  return (
    <Image
      src={colour ? '/brand/ssu-logo-white.png' : '/brand/ssu-logo.png'}
      alt="Sri Sri University"
      width={width}
      height={Math.round(width * (colour ? 154 / 274 : 357 / 1024))}
      className={cn('object-contain', className)}
      priority
    />
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
