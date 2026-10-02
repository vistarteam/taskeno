import type { NotificationType } from '@taskeno/contracts';

export type NotificationContent = { title: string; body: string };

const orderCode = (payload: Record<string, unknown>): string => String(payload.orderCode ?? '');
const money = (payload: Record<string, unknown>): string => String(payload.amountToman ?? payload.amount ?? '');

/**
 * Notification copy lives in one place so every channel (in-app today, email
 * and SMS later) renders the same message.
 */
export const renderNotification = (
  type: NotificationType,
  payload: Record<string, unknown> = {},
): NotificationContent => {
  switch (type) {
    case 'order.created':
      return {
        title: 'سفارش جدید',
        body: `سفارش ${orderCode(payload)} ثبت شد و در انتظار پرداخت است.`,
      };
    case 'order.paid':
      return {
        title: 'سفارش پرداخت شد',
        body: `پرداخت سفارش ${orderCode(payload)} با موفقیت انجام شد. مبلغ تا پایان کار در امانت Taskeno نگه داشته می‌شود.`,
      };
    case 'order.accepted':
      return {
        title: 'سفارش پذیرفته شد',
        body: `ارائه‌دهنده سفارش ${orderCode(payload)} را پذیرفت و کار به‌زودی آغاز می‌شود.`,
      };
    case 'order.delivered':
      return {
        title: 'تحویل سفارش',
        body: `کار سفارش ${orderCode(payload)} تحویل داده شد. لطفاً بررسی و تأیید کنید.`,
      };
    case 'order.completed':
      return {
        title: 'سفارش تکمیل شد',
        body: `سفارش ${orderCode(payload)} تکمیل شد و مبلغ به ارائه‌دهنده پرداخت گردید.`,
      };
    case 'order.auto_completed':
      return {
        title: 'تکمیل خودکار سفارش',
        body: `مهلت بررسی سفارش ${orderCode(payload)} به پایان رسید و سفارش به‌صورت خودکار تکمیل شد.`,
      };
    case 'order.cancelled':
      return {
        title: 'لغو سفارش',
        body: `سفارش ${orderCode(payload)} لغو شد${money(payload) ? ` و مبلغ ${money(payload)} به کیف پول شما بازگشت.` : '.'}`,
      };
    case 'order.disputed':
      return {
        title: 'اختلاف ثبت شد',
        body: `برای سفارش ${orderCode(payload)} اختلاف ثبت شد و کارشناسان Taskeno در حال بررسی هستند.`,
      };
    case 'payment.succeeded':
      return {
        title: 'پرداخت موفق',
        body: `پرداخت شما به مبلغ ${money(payload)} تومان با موفقیت انجام شد.`,
      };
    case 'payment.failed':
      return {
        title: 'پرداخت ناموفق',
        body: 'پرداخت شما انجام نشد. در صورت کسر مبلغ، تا ۷۲ ساعت آینده بازگردانده می‌شود.',
      };
    case 'wallet.deposit':
      return {
        title: 'افزایش موجودی',
        body: `کیف پول شما به مبلغ ${money(payload)} تومان شارژ شد.`,
      };
    case 'wallet.transfer_in':
      return {
        title: 'دریافت انتقال',
        body: `مبلغ ${money(payload)} تومان به کیف پول شما واریز شد.`,
      };
    case 'wallet.transfer_out':
      return {
        title: 'انتقال انجام شد',
        body: `مبلغ ${money(payload)} تومان از کیف پول شما منتقل شد.`,
      };
    case 'wallet.adjustment':
      return {
        title: 'اصلاح موجودی',
        body: `موجودی کیف پول شما توسط پشتیبانی اصلاح شد.`,
      };
    case 'message.received':
      return {
        title: 'پیام جدید',
        body: 'یک پیام جدید در گفت‌وگوی سفارش شما ثبت شد.',
      };
    case 'review.received':
      return {
        title: 'امتیاز جدید',
        body: 'برای یکی از سفارش‌های شما امتیاز ثبت شد.',
      };
    case 'service.published':
      return {
        title: 'خدمت منتشر شد',
        body: 'خدمت شما تأیید و برای همه کاربران قابل مشاهده شد.',
      };
    case 'service.rejected':
      return {
        title: 'خدمت تأیید نشد',
        body: `خدمت شما تأیید نشد.${payload.reason ? ` دلیل: ${String(payload.reason)}` : ''}`,
      };
    case 'security.new_login':
      return {
        title: 'ورود جدید به حساب',
        body: 'حساب شما از یک دستگاه جدید وارد شد. اگر شما نبودید، رمز عبور خود را تغییر دهید.',
      };
    default:
      return { title: 'اطلاع‌رسانی Taskeno', body: 'یک رویداد جدید در حساب شما ثبت شد.' };
  }
};
