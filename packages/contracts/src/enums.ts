/**
 * Shared enums for Taskeno.
 *
 * These string unions are the single source of truth for every status that is
 * persisted in the database, returned by the API and rendered by the website.
 * The database schema imports them so a typo can never diverge between layers.
 */

export const USER_STATUSES = ['pending', 'active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ROLE_KEYS = ['user', 'provider', 'support', 'admin'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const SERVICE_STATUSES = [
  'draft',
  'pending_review',
  'published',
  'paused',
  'rejected',
  'archived',
] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'accepted',
  'in_progress',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'partially_refunded',
  'disputed',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = [
  'unpaid',
  'escrow_held',
  'released',
  'refunded',
  'partially_refunded',
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const PAYMENT_PURPOSES = ['deposit', 'order_payment'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_STATUSES = [
  'created',
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const DISPUTE_STATUSES = [
  'open',
  'under_review',
  'resolved_buyer',
  'resolved_provider',
  'rejected',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

export const WALLET_OWNER_TYPES = ['user', 'platform'] as const;
export type WalletOwnerType = (typeof WALLET_OWNER_TYPES)[number];

/**
 * Platform-owned wallets. Because every financial event is double-entry, money
 * is never created or destroyed: it always moves between two wallets, so the
 * sum of all wallet balances is always exactly zero.
 */
export const PLATFORM_WALLET_CODES = [
  'GATEWAY_CLEARING',
  'ESCROW',
  'REVENUE',
  'FEES',
  'ADJUSTMENT',
] as const;
export type PlatformWalletCode = (typeof PLATFORM_WALLET_CODES)[number];

export const JOURNAL_KINDS = [
  'deposit',
  'withdrawal',
  'order_payment',
  'escrow_release',
  'commission',
  'refund',
  'transfer',
  'adjustment',
] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export const LEDGER_DIRECTIONS = ['debit', 'credit'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const COMMISSION_SCOPES = ['global', 'category', 'service', 'provider'] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];

export const COMMISSION_CALC_TYPES = ['percent', 'fixed', 'percent_plus_fixed'] as const;
export type CommissionCalcType = (typeof COMMISSION_CALC_TYPES)[number];

/* -------------------------------------------------------------------------- */
/* Engagement                                                                  */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'telegram', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'order.created',
  'order.paid',
  'order.accepted',
  'order.delivered',
  'order.completed',
  'order.cancelled',
  'order.disputed',
  'order.auto_completed',
  'payment.succeeded',
  'payment.failed',
  'wallet.deposit',
  'wallet.transfer_in',
  'wallet.transfer_out',
  'wallet.adjustment',
  'message.received',
  'review.received',
  'service.published',
  'service.rejected',
  'security.new_login',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const FILE_STATUSES = ['uploading', 'ready', 'failed'] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Pagination / API                                                            */
/* -------------------------------------------------------------------------- */

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const SERVICE_SORTS = ['newest', 'popular', 'rating', 'price_asc', 'price_desc'] as const;
export type ServiceSort = (typeof SERVICE_SORTS)[number];
