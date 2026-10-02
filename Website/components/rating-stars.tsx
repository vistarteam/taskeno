'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { faNumber } from '@/lib/format';

/** Read-only rating, rounded for display but exact in the tooltip. */
export function RatingStars({
  value,
  count,
  size = 'sm',
  className,
}: {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const dimension = size === 'sm' ? 'size-3.5' : 'size-5';
  const rounded = Math.round(value);
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} title={`${value} از ۵`}>
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              dimension,
              star <= rounded ? 'fill-warning text-warning' : 'text-muted-foreground/40',
            )}
          />
        ))}
      </span>
      <span className="tabular text-xs text-muted-foreground">
        {value > 0 ? faNumber(value.toFixed(1)) : 'جدید'}
        {count ? ` (${faNumber(count)} نظر)` : ''}
      </span>
    </span>
  );
}

/** Interactive 1–5 picker used by the review form. */
export function RatingInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1', className)} role="radiogroup" aria-label="امتیاز">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} ستاره`}
          onClick={() => onChange(star)}
          className="rounded-md p-0.5 transition hover:scale-110"
        >
          <Star
            className={cn('size-6', star <= value ? 'fill-warning text-warning' : 'text-muted-foreground/40')}
          />
        </button>
      ))}
    </div>
  );
}
