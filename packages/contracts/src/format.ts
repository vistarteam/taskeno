/** Date and number formatting shared by server rendering and client components. */

const JALALI_DATE = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Tehran',
});

const JALALI_DATETIME = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tehran',
});

const relativeFormatter = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });

const asDate = (value: Date | string | number): Date =>
  value instanceof Date ? value : new Date(value);

/** `۱۲ مهر ۱۴۰۵` */
export const formatJalaliDate = (value: Date | string | number): string =>
  JALALI_DATE.format(asDate(value));

/** `۱۲ مهر ۱۴۰۵، ۱۴:۳۰` */
export const formatJalaliDateTime = (value: Date | string | number): string =>
  JALALI_DATETIME.format(asDate(value));

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/** `۳ روز پیش` — relative time in Persian, falls back to Jalali date. */
export const formatRelativeTime = (value: Date | string | number, now: Date = new Date()): string => {
  const date = asDate(value);
  const diff = now.getTime() - date.getTime();
  const absDiff = Math.abs(diff);
  for (const [unit, ms] of UNITS) {
    if (absDiff >= ms) {
      const amount = Math.round(diff / ms);
      return relativeFormatter.format(-amount, unit);
    }
  }
  return relativeFormatter.format(-Math.round(diff / 1000), 'second');
};

export const formatPercent = (basisPoints: number): string =>
  `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(basisPoints / 100)}٪`;

export const formatCount = (value: number): string => new Intl.NumberFormat('fa-IR').format(value);
