import { cn } from '@/lib/utils';
import { formatToman, formatTomanCompact, rialToToman } from '@/lib/format';

/**
 * Renders an integer Rial amount as Persian Toman.
 *
 * Money is rendered through one component so no page can accidentally show
 * Rial, drop a digit, or use Latin numerals.
 */
export function Money({
  value,
  className,
  compact = false,
  signed = false,
  muted = false,
}: {
  /** Integer Rial, as returned by the API (string) or a bigint/number. */
  value: string | number | bigint | null | undefined;
  className?: string;
  compact?: boolean;
  /** Prefixes `+` / `−` for ledger entries. */
  signed?: boolean;
  muted?: boolean;
}) {
  const rial = value === null || value === undefined ? 0n : toBigInt(value);
  const negative = signed && rial < 0n;
  const magnitude = negative ? -rial : rial;

  const text = compact ? formatTomanCompact(magnitude) : formatToman(magnitude);

  return (
    <span
      dir="ltr"
      className={cn('tabular inline-block text-right', muted && 'text-muted-foreground', className)}
      title={formatToman(magnitude)}
    >
      {negative ? '−' : signed ? '+' : ''}
      {text}
    </span>
  );
}

function toBigInt(value: string | number | bigint): bigint {
  try {
    return BigInt(typeof value === 'number' ? Math.round(value) : value);
  } catch {
    return 0n;
  }
}

/** Convenience for places that want the plain string (e.g. `aria-label`s). */
export function moneyText(value: string | null | undefined): string {
  return rialToToman(value ?? '0');
}
