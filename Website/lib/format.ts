/**
 * Formatting helpers for Persian UI.
 *
 * Everything delegates to `@taskeno/contracts` so the website, the API and the
 * worker all render the same numbers and dates. Money is Rial internally; the
 * website always shows Toman because that is what users read in Iran.
 */
import {
  formatJalaliDate,
  formatJalaliDateTime,
  formatRelativeTime,
  formatToman,
  formatTomanCompact,
  formatTomanNumber,
  formatCount,
  formatPercent,
  normalizeDigits,
  toToman,
} from '@taskeno/contracts';

export {
  formatJalaliDate,
  formatJalaliDateTime,
  formatRelativeTime,
  formatToman,
  formatTomanCompact,
  formatTomanNumber,
  formatCount,
  formatPercent,
  normalizeDigits,
  toToman,
};

/** Renders an integer Rial string as Toman, never throwing on bad input. */
export function rialToToman(rial: string | number | bigint | null | undefined): string {
  if (rial === null || rial === undefined) return formatToman(0n);
  try {
    return formatToman(BigInt(String(rial)));
  } catch {
    return formatToman(0n);
  }
}

/** Same as `rialToToman` but without the unit, for inputs and dense tables. */
export function rialToTomanNumber(rial: string | null | undefined): string {
  if (!rial) return formatTomanNumber(0n);
  try {
    return formatTomanNumber(BigInt(rial));
  } catch {
    return formatTomanNumber(0n);
  }
}

/** Rial -> plain ASCII Toman digits, used as the default value of amount inputs. */
export function rialToTomanInput(rial: string | null | undefined): string {
  if (!rial) return '';
  try {
    return (BigInt(rial) / 10n).toString();
  } catch {
    return '';
  }
}

/** Localised digits for any number (ratings, counts, days). */
export function faNumber(value: number | string): string {
  return new Intl.NumberFormat('fa-IR').format(Number(value));
}
