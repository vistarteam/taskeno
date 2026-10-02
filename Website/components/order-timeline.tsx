import { Check } from 'lucide-react';
import { ORDER_ACTOR_LABELS, orderStatusLabel } from '@/components/status-badge';
import { formatJalaliDateTime, formatRelativeTime } from '@/lib/format';
import type { OrderHistoryEntry, OrderStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: 'pending_payment', label: 'ثبت سفارش' },
  { status: 'paid', label: 'پرداخت' },
  { status: 'accepted', label: 'پذیرش' },
  { status: 'in_progress', label: 'انجام کار' },
  { status: 'delivered', label: 'تحویل' },
  { status: 'completed', label: 'تکمیل' },
];

/** Four-state progress bar. `progress` is the index the API reports (0-based). */
export function OrderProgress({ progress, status }: { progress: number; status: OrderStatus }) {
  const failed = ['cancelled', 'refunded', 'partially_refunded'].includes(status);
  return (
    <ol className="flex flex-wrap items-center gap-y-3">
      {STEPS.map((step, index) => {
        const done = index <= progress;
        const current = index === progress;
        return (
          <li key={step.status} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                done
                  ? failed && index === progress
                    ? 'border-destructive bg-destructive text-destructive-foreground'
                    : 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground',
              )}
            >
              {done && !current ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className={cn('text-xs', current ? 'font-semibold' : 'text-muted-foreground')}>{step.label}</span>
            {index < STEPS.length - 1 ? (
              <span className={cn('mx-1 hidden h-px flex-1 bg-border sm:block', done && 'bg-primary/50')} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Chronological history of status changes, each with its Jalali timestamp. */
export function OrderHistory({ entries }: { entries: OrderHistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary/70" />
          <div className="flex-1 space-y-0.5">
            <p className="text-sm">
              <span className="font-medium">{orderStatusLabel(entry.toStatus)}</span>
              <span className="text-muted-foreground"> · {ORDER_ACTOR_LABELS[entry.actorRole] ?? entry.actorRole}</span>
            </p>
            {entry.reason ? <p className="text-xs leading-5 text-muted-foreground">{entry.reason}</p> : null}
            <p className="text-xs text-muted-foreground" title={formatJalaliDateTime(entry.createdAt)}>
              {formatRelativeTime(entry.createdAt)} — {formatJalaliDateTime(entry.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
