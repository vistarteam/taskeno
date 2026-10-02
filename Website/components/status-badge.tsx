import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { OrderPaymentStatus, OrderStatus, PaymentStatus, ServiceStatus } from '@/lib/types';

type Tone = NonNullable<BadgeProps['tone']>;

type Entry = { label: string; tone: Tone };

const ORDER: Record<OrderStatus, Entry> = {
  pending_payment: { label: 'در انتظار پرداخت', tone: 'warning' },
  paid: { label: 'پرداخت‌شده · امانت', tone: 'primary' },
  accepted: { label: 'پذیرفته‌شده', tone: 'primary' },
  in_progress: { label: 'در حال انجام', tone: 'primary' },
  delivered: { label: 'تحویل‌شده', tone: 'primary' },
  completed: { label: 'تکمیل‌شده', tone: 'success' },
  cancelled: { label: 'لغوشده', tone: 'neutral' },
  refunded: { label: 'بازگشت وجه', tone: 'danger' },
  partially_refunded: { label: 'بازگشت بخشی از وجه', tone: 'warning' },
  disputed: { label: 'در حال بررسی اختلاف', tone: 'danger' },
};

const ORDER_PAYMENT: Record<OrderPaymentStatus, Entry> = {
  unpaid: { label: 'پرداخت‌نشده', tone: 'neutral' },
  escrow_held: { label: 'در امانت', tone: 'primary' },
  released: { label: 'آزاد‌شده', tone: 'success' },
  refunded: { label: 'بازگشته', tone: 'danger' },
  partially_refunded: { label: 'بازگشت جزئی', tone: 'warning' },
};

const SERVICE: Record<ServiceStatus, Entry> = {
  draft: { label: 'پیش‌نویس', tone: 'neutral' },
  pending_review: { label: 'در انتظار بازبینی', tone: 'warning' },
  published: { label: 'منتشرشده', tone: 'success' },
  paused: { label: 'متوقف', tone: 'neutral' },
  rejected: { label: 'ردشده', tone: 'danger' },
  archived: { label: 'بایگانی‌شده', tone: 'neutral' },
};

const PAYMENT: Record<PaymentStatus, Entry> = {
  created: { label: 'ایجادشده', tone: 'neutral' },
  pending: { label: 'در انتظار', tone: 'warning' },
  succeeded: { label: 'موفق', tone: 'success' },
  failed: { label: 'ناموفق', tone: 'danger' },
  cancelled: { label: 'لغوشده', tone: 'neutral' },
  expired: { label: 'منقضی', tone: 'neutral' },
  refunded: { label: 'بازگشتی', tone: 'danger' },
};

const DISPUTE: Record<string, Entry> = {
  open: { label: 'باز', tone: 'danger' },
  under_review: { label: 'در بررسی', tone: 'warning' },
  resolved_buyer: { label: 'به نفع خریدار', tone: 'success' },
  resolved_provider: { label: 'به نفع ارائه‌دهنده', tone: 'success' },
  rejected: { label: 'ردشده', tone: 'neutral' },
};

const REPORT: Record<string, Entry> = {
  open: { label: 'باز', tone: 'warning' },
  reviewing: { label: 'در بررسی', tone: 'primary' },
  resolved: { label: 'رسیدگی‌شده', tone: 'success' },
  dismissed: { label: 'ردشده', tone: 'neutral' },
};

const USER: Record<string, Entry> = {
  pending: { label: 'در انتظار تأیید', tone: 'warning' },
  active: { label: 'فعال', tone: 'success' },
  suspended: { label: 'معلق', tone: 'danger' },
  deleted: { label: 'حذف‌شده', tone: 'neutral' },
};

const MAPS = {
  order: ORDER,
  'order-payment': ORDER_PAYMENT,
  service: SERVICE,
  payment: PAYMENT,
  dispute: DISPUTE,
  report: REPORT,
  user: USER,
} as const;

export type StatusKind = keyof typeof MAPS;

export function StatusBadge({
  kind,
  status,
  className,
}: {
  kind: StatusKind;
  status: string;
  className?: string;
}) {
  const map = MAPS[kind] as Record<string, Entry | undefined>;
  const entry = map[status] ?? { label: status, tone: 'neutral' as Tone };
  return (
    <Badge tone={entry.tone} className={className}>
      {entry.label}
    </Badge>
  );
}

export const orderStatusLabel = (status: OrderStatus): string => ORDER[status]?.label ?? status;
export const serviceStatusLabel = (status: ServiceStatus): string => SERVICE[status]?.label ?? status;

export const WALLET_KIND_LABELS: Record<string, string> = {
  deposit: 'شارژ کیف پول',
  withdrawal: 'برداشت',
  order_payment: 'پرداخت سفارش',
  escrow_release: 'آزادسازی امانت',
  commission: 'کمیسیون',
  refund: 'بازگشت وجه',
  transfer: 'انتقال',
  adjustment: 'اصلاح موجودی',
};

export const ORDER_ACTION_LABELS: Record<string, string> = {
  pay: 'پرداخت',
  accept: 'پذیرش سفارش',
  start: 'شروع کار',
  deliver: 'تحویل کار',
  complete: 'تأیید و تکمیل',
  cancel: 'لغو سفارش',
  dispute: 'ثبت اختلاف',
};

export const ORDER_ACTOR_LABELS: Record<string, string> = {
  buyer: 'خریدار',
  provider: 'ارائه‌دهنده',
  admin: 'مدیر',
  system: 'سیستم',
};
