import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />;
}

/** Card-shaped placeholder used while a list is loading. */
export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Loader2 className="size-4 animate-spin" />
      {label}
    </span>
  );
}

/** Centred spinner for full-page loading states. */
export function PageLoader({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
