/**
 * Money helpers.
 *
 * Taskeno stores every amount as an exact integer in the smallest currency unit
 * (Rial, `bigint`). Floats are never used for money: `0.1 + 0.2` bugs inside a
 * ledger are unacceptable. The website displays Toman (1 Toman = 10 Rial).
 */

export type Money = bigint;

export const MONEY_ZERO: Money = 0n;

/** Basis points denominator: 10000n === 100%. */
const BPS_DENOMINATOR = 10_000n;

export class MoneyError extends Error {}

const toBigInt = (value: bigint | number | string): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new MoneyError(`Unsafe integer amount: ${value}`);
    }
    return BigInt(value);
  }
  const normalized = normalizeDigits(value).replace(/[,\s_]/g, '');
  if (!/^-?\d+$/.test(normalized)) {
    throw new MoneyError(`Invalid amount: ${value}`);
  }
  return BigInt(normalized);
};

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Converts Persian/Arabic-Indic digits typed by users into ASCII digits. */
export const normalizeDigits = (input: string): string => {
  let out = '';
  for (const char of input) {
    const persianIndex = PERSIAN_DIGITS.indexOf(char);
    if (persianIndex >= 0) {
      out += String(persianIndex);
      continue;
    }
    const arabicIndex = ARABIC_DIGITS.indexOf(char);
    if (arabicIndex >= 0) {
      out += String(arabicIndex);
      continue;
    }
    out += char;
  }
  return out;
};

export const money = (value: bigint | number | string): Money => toBigInt(value);

export const addMoney = (...values: Money[]): Money => values.reduce((sum, v) => sum + v, 0n);

export const subMoney = (a: Money, b: Money): Money => a - b;

export const isZero = (value: Money): boolean => value === 0n;

export const isNegative = (value: Money): boolean => value < 0n;

export const isPositive = (value: Money): boolean => value > 0n;

export const assertNonNegative = (value: Money, label = 'amount'): Money => {
  if (value < 0n) throw new MoneyError(`${label} must not be negative`);
  return value;
};

/**
 * Applies a basis-point rate with half-up rounding, using integer math only.
 * `applyBasisPoints(1_000_000n, 1000)` === 100_000n (10%).
 * Only defined for non-negative amounts; commission is never computed on a
 * negative total.
 */
export const applyBasisPoints = (amount: Money, basisPoints: number): Money => {
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError('basisPoints must be an integer');
  }
  if (basisPoints < 0 || basisPoints > 10_000) {
    throw new MoneyError('basisPoints must be between 0 and 10000');
  }
  if (amount < 0n) {
    throw new MoneyError('applyBasisPoints expects a non-negative amount');
  }
  return (amount * BigInt(basisPoints) + BPS_DENOMINATOR / 2n) / BPS_DENOMINATOR;
};

/** Clamps a commission amount inside optional floor/ceiling bounds. */
export const clampMoney = (amount: Money, min?: Money | null, max?: Money | null): Money => {
  let result = amount;
  if (min !== undefined && min !== null && result < min) result = min;
  if (max !== undefined && max !== null && result > max) result = max;
  return result;
};

export const toToman = (rial: Money): Money => {
  // Rial amounts are always whole; Toman is used for display only.
  return rial / 10n;
};

const tomanFormatter = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const rialFormatter = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

/** Persian-digit, grouped Toman string: `۱٬۲۰۰٬۰۰۰`. */
export const formatTomanNumber = (rial: Money): string => tomanFormatter.format(toToman(rial));

/** Human readable price used across the UI. */
export const formatToman = (rial: Money): string => `${formatTomanNumber(rial)} تومان`;

export const formatRial = (rial: Money): string => `${rialFormatter.format(rial)} ریال`;

/** Compact display for dashboard cards: `۱.۲ میلیون تومان`. */
export const formatTomanCompact = (rial: Money): string => {
  const toman = toToman(rial);
  const abs = toman < 0n ? -toman : toman;
  const sign = toman < 0n ? '-' : '';
  if (abs >= 1_000_000_000n) return `${sign}${tomanFormatter.format(abs / 1_000_000_000n)} میلیارد تومان`;
  if (abs >= 1_000_000n) return `${sign}${tomanFormatter.format(abs / 1_000_000n)} میلیون تومان`;
  if (abs >= 1_000n) return `${sign}${tomanFormatter.format(abs / 1_000n)} هزار تومان`;
  return `${sign}${tomanFormatter.format(abs)} تومان`;
};
