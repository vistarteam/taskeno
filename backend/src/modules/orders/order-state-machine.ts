import { ERROR_CODES, type OrderStatus } from '@taskeno/contracts';
import { AppError } from '../../common/errors';

export type OrderActor = 'buyer' | 'provider' | 'admin' | 'system';

export type OrderAction =
  | 'pay'
  | 'accept'
  | 'start'
  | 'deliver'
  | 'complete'
  | 'cancel'
  | 'dispute'
  | 'resolve_complete'
  | 'resolve_refund';

type TransitionRule = {
  from: OrderStatus;
  to: OrderStatus;
  by: OrderActor[];
  /** Rough Persian description, used in error messages and the UI. */
  labelFa: string;
};

/**
 * The single source of truth for order transitions.
 *
 * Keeping this table declarative (and pure) means the API, the UI and the tests
 * all agree on what is allowed, and an invalid transition is rejected in one
 * place instead of being guarded inconsistently across controllers.
 */
export const ORDER_TRANSITIONS: readonly TransitionRule[] = [
  { from: 'pending_payment', to: 'paid', by: ['system'], labelFa: 'پرداخت سفارش' },
  { from: 'pending_payment', to: 'cancelled', by: ['buyer', 'system', 'admin'], labelFa: 'لغو سفارش پرداخت‌نشده' },

  { from: 'paid', to: 'accepted', by: ['provider'], labelFa: 'پذیرش سفارش' },
  { from: 'paid', to: 'cancelled', by: ['provider', 'admin', 'system'], labelFa: 'رد سفارش و بازگشت وجه' },
  { from: 'paid', to: 'refunded', by: ['buyer', 'admin'], labelFa: 'بازگشت وجه قبل از شروع' },

  { from: 'accepted', to: 'in_progress', by: ['provider'], labelFa: 'شروع انجام کار' },
  { from: 'accepted', to: 'cancelled', by: ['admin'], labelFa: 'لغو توسط مدیریت' },

  { from: 'in_progress', to: 'delivered', by: ['provider'], labelFa: 'تحویل کار' },
  { from: 'in_progress', to: 'cancelled', by: ['admin'], labelFa: 'لغو توسط مدیریت' },

  { from: 'delivered', to: 'completed', by: ['buyer', 'system', 'admin'], labelFa: 'تأیید و تکمیل سفارش' },
  { from: 'delivered', to: 'disputed', by: ['buyer', 'provider'], labelFa: 'ثبت اختلاف' },

  { from: 'disputed', to: 'completed', by: ['admin'], labelFa: 'حل اختلاف به نفع ارائه‌دهنده' },
  { from: 'disputed', to: 'refunded', by: ['admin'], labelFa: 'بازگشت کامل وجه' },
  { from: 'disputed', to: 'partially_refunded', by: ['admin'], labelFa: 'بازگشت بخشی از وجه' },
];

/** Actions that can only be performed by a specific participant. */
export const ACTION_RULES: Record<OrderAction, { by: OrderActor[]; labelFa: string }> = {
  // `system` covers gateway-confirmed payments; the buyer is the other path.
  pay: { by: ['buyer', 'system'], labelFa: 'پرداخت' },
  accept: { by: ['provider'], labelFa: 'پذیرش' },
  start: { by: ['provider'], labelFa: 'شروع کار' },
  deliver: { by: ['provider'], labelFa: 'تحویل' },
  complete: { by: ['buyer', 'admin'], labelFa: 'تکمیل' },
  cancel: { by: ['buyer', 'provider', 'admin'], labelFa: 'لغو' },
  dispute: { by: ['buyer', 'provider'], labelFa: 'ثبت اختلاف' },
  resolve_complete: { by: ['admin'], labelFa: 'حل به نفع ارائه‌دهنده' },
  resolve_refund: { by: ['admin'], labelFa: 'بازگشت وجه' },
};

const ACTION_TARGETS: Record<OrderAction, OrderStatus[]> = {
  pay: ['paid'],
  accept: ['accepted'],
  start: ['in_progress'],
  deliver: ['delivered'],
  complete: ['completed'],
  cancel: ['cancelled'],
  dispute: ['disputed'],
  resolve_complete: ['completed'],
  resolve_refund: ['refunded', 'partially_refunded'],
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['completed', 'cancelled', 'refunded', 'partially_refunded'];

export const isTerminal = (status: OrderStatus): boolean => TERMINAL_STATUSES.includes(status);

/** Statuses where money is currently held in escrow. */
export const holdsEscrow = (status: OrderStatus): boolean =>
  ['paid', 'accepted', 'in_progress', 'delivered', 'disputed'].includes(status);

export class OrderStateMachine {
  /** Resolves the target status for an action, or throws if it is not allowed. */
  static resolve(from: OrderStatus, action: OrderAction, actor: OrderActor): OrderStatus {
    if (!ACTION_RULES[action].by.includes(actor)) {
      throw new AppError(ERROR_CODES.ORDER_INVALID_TRANSITION, {
        message: 'شما اجازه انجام این عملیات را ندارید.',
        details: { from, action, actor },
      });
    }

    const candidates = ORDER_TRANSITIONS.filter(
      (rule) => rule.from === from && ACTION_TARGETS[action].includes(rule.to) && rule.by.includes(actor),
    );

    if (candidates.length === 0) {
      throw new AppError(ERROR_CODES.ORDER_INVALID_TRANSITION, { details: { from, action, actor } });
    }
    return candidates[0].to;
  }

  static can(from: OrderStatus, action: OrderAction, actor: OrderActor): boolean {
    try {
      OrderStateMachine.resolve(from, action, actor);
      return true;
    } catch {
      return false;
    }
  }

  /** Actions the given actor may perform right now (drives the UI buttons). */
  static availableActions(from: OrderStatus, actor: OrderActor): OrderAction[] {
    return (Object.keys(ACTION_RULES) as OrderAction[]).filter((action) => OrderStateMachine.can(from, action, actor));
  }

  /** Statuses an order passes through, for progress indicators. */
  static progress(status: OrderStatus): number {
    const order: OrderStatus[] = ['pending_payment', 'paid', 'accepted', 'in_progress', 'delivered', 'completed'];
    const index = order.indexOf(status);
    return index === -1 ? 0 : index;
  }
}
