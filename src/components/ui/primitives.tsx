/**
 * Small shadcn-style primitives (input, label, textarea, select, card, badge, alert, table, page
 * header, empty state). One file, one look, used by every role's screens.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground/80 hover:border-border-strong focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldClass, className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldClass, 'h-auto min-h-24 py-2 leading-relaxed', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      fieldClass,
      'appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%236b7080%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:16px_16px] bg-[right_10px_center] bg-no-repeat pr-9',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium leading-none text-foreground/90', className)} {...props} />;
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[15px] font-semibold leading-snug tracking-tight', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-muted text-muted-foreground',
      outline: 'border-border-strong bg-surface text-foreground/80',
      success: 'border-transparent bg-success-soft text-success',
      warning: 'border-transparent bg-warning-soft text-warning',
      destructive: 'border-transparent bg-destructive-soft text-destructive',
      info: 'border-transparent bg-info-soft text-info',
      accent: 'border-transparent bg-accent-soft text-accent',
    },
  },
  defaultVariants: { variant: 'default' },
});
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------
const alertVariants = cva('relative flex w-full gap-3 rounded-xl border p-4 text-sm leading-relaxed', {
  variants: {
    variant: {
      default: 'border-border bg-surface text-foreground',
      destructive: 'border-destructive/25 bg-destructive-soft text-destructive',
      warning: 'border-warning/25 bg-warning-soft text-warning',
      success: 'border-success/25 bg-success-soft text-success',
      info: 'border-info/20 bg-info-soft text-info',
    },
  },
  defaultVariants: { variant: 'default' },
});
const alertIcon = {
  default: Info,
  destructive: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;
export function Alert({ className, variant, children, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  const Icon = alertIcon[variant ?? 'default'];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-muted [&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-primary-soft/40', className)} {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wider text-muted-foreground', className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Page header / empty state / section
// ---------------------------------------------------------------------------
export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rise-in">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function EmptyState({ children, icon: Icon = Inbox }: { children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-muted px-6 py-10 text-center text-sm text-muted-foreground">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

/** Stat tile for dashboards. */
export function Stat({ label, value, hint, icon: Icon, tone = 'default' }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ComponentType<{ className?: string }>; tone?: 'default' | 'warn' | 'good' | 'accent' }) {
  const ring = tone === 'warn' ? 'border-warning/40' : tone === 'good' ? 'border-success/30' : tone === 'accent' ? 'border-accent/30' : 'border-border';
  const iconBg = tone === 'warn' ? 'bg-warning-soft text-warning' : tone === 'good' ? 'bg-success-soft text-success' : tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-primary-soft text-primary';
  return (
    <div className={cn('flex items-start gap-4 rounded-xl border bg-surface p-4 shadow-card', ring)}>
      {Icon ? (
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', iconBg)}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}
