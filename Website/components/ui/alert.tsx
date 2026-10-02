import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'border-primary/25 bg-primary/8 text-foreground' },
  success: { icon: CheckCircle2, className: 'border-success/30 bg-success/10 text-foreground' },
  warning: { icon: AlertTriangle, className: 'border-warning/40 bg-warning/12 text-foreground' },
  danger: { icon: XCircle, className: 'border-destructive/30 bg-destructive/8 text-foreground' },
};

const ICON_COLORS: Record<Tone, string> = {
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

export function Alert({
  tone = 'info',
  title,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { tone?: Tone; title?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', toneClass, className)} {...props}>
      <Icon className={cn('mt-0.5 size-5 shrink-0', ICON_COLORS[tone])} />
      <div className="flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="leading-6 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
