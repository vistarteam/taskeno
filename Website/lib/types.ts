/**
 * API response types.
 *
 * These mirror the *actual* payloads returned by the Nest API — they were
 * captured by calling every endpoint against a running server, not written from
 * the documentation. Money is always an integer Rial string (the API serializes
 * bigint as a decimal string so nothing is lost), and dates are ISO strings.
 */

export type RoleKey = 'user' | 'provider' | 'support' | 'admin';

export type UserStatus = 'pending' | 'active' | 'suspended' | 'deleted';

export type ServiceStatus = 'draft' | 'pending_review' | 'published' | 'paused' | 'rejected' | 'archived';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'accepted'
  | 'in_progress'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export type OrderPaymentStatus = 'unpaid' | 'escrow_held' | 'released' | 'refunded' | 'partially_refunded';

export type OrderAction = 'pay' | 'accept' | 'start' | 'deliver' | 'complete' | 'cancel' | 'dispute';

export type PaymentStatus = 'created' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export type PaymentPurpose = 'deposit' | 'order_payment';

export type WalletDirection = 'debit' | 'credit';

export type WalletTxKind =
  | 'deposit'
  | 'withdrawal'
  | 'order_payment'
  | 'escrow_release'
  | 'commission'
  | 'refund'
  | 'transfer'
  | 'adjustment';

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export type Profile = {
  username: string;
  displayName: string;
  bio: string | null;
  avatarFileId: string | null;
  isProvider: boolean;
  ratingAverage: number;
  ratingCount: number;
  completedOrdersCount: number;
  /** Only present on some endpoints (providers/:username). */
  city?: string | null;
  province?: string | null;
  skills?: string[];
};

export type User = {
  id: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  emailVerified: boolean;
  roles: RoleKey[];
  profile: Profile;
};

export type Session = {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

export type CategoryChild = { id: string; slug: string; titleFa: string; icon: string | null };

export type Category = {
  id: string;
  slug: string;
  titleFa: string;
  icon: string | null;
  children: CategoryChild[];
};

/** Flat admin view of a category row. */
export type AdminCategory = {
  id: string;
  parentId: string | null;
  slug: string;
  titleFa: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderSummary = {
  userId: string;
  username: string;
  displayName: string;
  isProvider: boolean;
};

/** Card shape used by `GET /services` and `GET /me/services`. */
export type ServiceCard = {
  id: string;
  slug: string;
  title: string;
  price: string;
  priceToman: string;
  deliveryDays: number;
  rating: number;
  ratingCount: number;
  ordersCount: number;
  status: ServiceStatus;
  category: { id: string; titleFa: string; slug: string };
  provider: ProviderSummary;
  imageFileId: string | null;
  createdAt: string;
};

export type ServiceImage = { id: string; fileId: string; alt: string | null };

/** `GET /services/:slug` — adds description, images, tags and ownership. */
export type ServiceDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: string;
  priceToman: string;
  currency: string;
  deliveryDays: number;
  revisions: number;
  status: ServiceStatus;
  rating: number;
  ratingCount: number;
  ordersCount: number;
  viewsCount: number;
  createdAt: string;
  category: { id: string; slug: string; titleFa: string };
  provider: ProviderSummary & {
    bio: string | null;
    rating: number;
    ratingCount: number;
    completedOrdersCount: number;
  };
  images: ServiceImage[];
  tags: string[];
  isOwner: boolean;
};

/** The raw service row returned by create/update/submit/pause. */
export type ServiceEntity = {
  id: string;
  providerId: string;
  categoryId: string;
  title: string;
  slug: string;
  description: string;
  price: string;
  currency: string;
  deliveryDays: number;
  revisions: number;
  status: ServiceStatus;
  rejectionReason: string | null;
  publishedAt: string | null;
  ratingSum: number;
  ratingCount: number;
  ordersCount: number;
  viewsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProviderProfile = {
  userId: string;
  username: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  province: string | null;
  skills: string[];
  isProvider: boolean;
  rating: number;
  ratingCount: number;
  completedOrdersCount: number;
  memberSince: string;
  services: Array<{
    id: string;
    slug: string;
    title: string;
    price: string;
    priceToman: string;
    deliveryDays: number;
    rating: number;
    ratingCount: number;
    ordersCount: number;
    imageFileId: string | null;
  }>;
};

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  author: { username: string; displayName: string };
};

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

export type OrderListItem = {
  id: string;
  code: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: string;
  totalToman: string;
  serviceTitle: string;
  deliveryDays: number;
  role: 'buyer' | 'provider' | 'admin';
  createdAt: string;
  autoCompleteAt: string | null;
  actions: OrderAction[];
};

export type OrderHistoryEntry = {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: 'buyer' | 'provider' | 'admin' | 'system';
  reason: string | null;
  createdAt: string;
};

export type OrderDelivery = { id: string; message: string; fileIds: string[]; createdAt: string };

export type OrderDispute = {
  id: string;
  status: 'open' | 'under_review' | 'resolved_buyer' | 'resolved_provider' | 'rejected';
  reason: string;
  description: string | null;
  createdAt: string;
  resolutionNote: string | null;
};

/**
 * `GET /orders/:id` — `commission` and `providerNet` are only present for the
 * provider and admins; buyer payloads omit them entirely.
 */
export type OrderDetail = {
  id: string;
  code: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  role: 'buyer' | 'provider' | 'admin';
  total: string;
  totalToman: string;
  subtotal: string;
  commission?: { amount: string; amountToman: string };
  providerNet?: string;
  currency: string;
  note: string | null;
  createdAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  autoCompleteAt: string | null;
  acceptDeadlineAt: string | null;
  service: { id: string; title: string; description: string; deliveryDays: number; price: string } | null;
  buyer: { userId: string; username: string; displayName: string } | null;
  provider: { userId: string; username: string; displayName: string } | null;
  history: OrderHistoryEntry[];
  deliveries: OrderDelivery[];
  dispute: OrderDispute | null;
  actions: OrderAction[];
  progress: number;
};

export type OrderMessage = {
  id: string;
  senderId: string;
  body: string;
  fileIds: string[];
  createdAt: string;
  mine: boolean;
};

export type Conversation = { conversationId: string; items: OrderMessage[] };

/** The raw order row returned by mutating endpoints (pay/accept/deliver/...). */
export type OrderEntity = {
  id: string;
  code: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: string;
  commissionAmount: string;
  note: string | null;
  acceptDeadlineAt: string | null;
  autoCompleteAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Wallet and payments                                                        */
/* -------------------------------------------------------------------------- */

export type WalletSummary = {
  balance: string;
  balanceToman: string;
  currency: string;
  transfersEnabled: boolean;
  withdrawalsEnabled: boolean;
  dailyTransferLimit: string;
  dailyTransferUsed: string;
  walletId: string;
  ledgerConsistent: boolean;
};

export type WalletTransaction = {
  id: string;
  kind: WalletTxKind;
  direction: WalletDirection;
  amount: string;
  amountToman: string;
  balanceAfter: string;
  balanceAfterToman: string;
  memo: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
};

/** Deposit / order-payment intent. `redirectUrl` points at the gateway page. */
export type PaymentIntent = {
  paymentId: string;
  status: PaymentStatus;
  redirectUrl: string;
  replayed: boolean;
  provider: string;
};

export type PaymentListItem = {
  id: string;
  status: PaymentStatus;
  purpose: PaymentPurpose;
  amount: string;
  orderId: string | null;
  provider: string;
  createdAt: string;
  paidAt: string | null;
};

export type AdminPaymentListItem = {
  id: string;
  userId: string;
  orderId: string | null;
  purpose: PaymentPurpose;
  provider: string;
  status: PaymentStatus;
  amount: string;
  createdAt: string;
  paidAt: string | null;
};

/** What the fake gateway knows about a payment it is about to settle. */
export type SandboxPayment = {
  paymentId: string;
  amount: string;
  amountToman: string;
  status: PaymentStatus;
  purpose: PaymentPurpose;
};

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export type AdminMetrics = {
  users: { active: number; providers: number };
  orders: {
    total: number;
    completed: number;
    active: number;
    disputed: number;
    gmv: string;
    grossCommission: string;
  };
  moderation: { pendingServices: number };
  disputes: { open: number };
  reports: { open: number };
  payments: { succeeded: string; failed: number; pending: number };
  ledger: { revenue: string; escrow: string; balanced: boolean; debit: string; credit: string };
  generatedAt: string;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  username: string | null;
  displayName: string | null;
  isProvider: boolean;
  ratingCount: number;
  ratingSum: number;
  rating: number;
};

export type AdminUserWallet = {
  walletId: string;
  balance: string;
  ledgerBalance: string;
  consistent: boolean;
  currency: string;
};

/** Row in the admin moderation queue (`GET /admin/services/moderation`). */
export type ModerationQueueItem = {
  id: string;
  slug: string;
  title: string;
  status: ServiceStatus;
  price: string;
  createdAt: string;
  providerUsername: string | null;
  providerDisplayName: string | null;
};

export type AdminOrderListItem = {
  id: string;
  code: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: string;
  commissionAmount: string;
  createdAt: string;
  buyerUsername: string | null;
  providerUsername: string | null;
};

export type AdminDispute = {
  id: string;
  orderId: string;
  status: OrderDispute['status'];
  reason: string;
  description: string | null;
  createdAt: string;
  orderCode: string;
  total: string;
};

export type AdminReport = {
  id: string;
  reporterId: string;
  targetType: 'user' | 'service' | 'order' | 'message';
  targetId: string;
  reason: string;
  description: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  handledBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type LedgerJournal = {
  id: string;
  kind: string;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  memo: string | null;
  createdAt: string;
  entries: Array<{
    id: string;
    walletId: string;
    direction: WalletDirection;
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    createdAt: string;
  }>;
};

export type LedgerHealth = {
  checkedWallets: number;
  mismatches: unknown[];
  balanced: boolean;
  debit: string;
  credit: string;
};

export type PlatformWallet = { code: string; balance: string; currency: string };

export type CommissionRule = {
  id: string;
  scope: 'global' | 'category' | 'service' | 'provider';
  scopeRef: string | null;
  calcType: 'percent' | 'fixed' | 'percent_plus_fixed';
  percentBps: number;
  fixedAmount: string;
  minCommission: string | null;
  maxCommission: string | null;
  priority: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
};

export type AppSetting = {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                  */
/* -------------------------------------------------------------------------- */

export type Paginated<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
export type ActionResult = { ok: boolean; journalId?: string; replayed?: boolean; updated?: number };
export type ModerationModerateInput = { decision: 'approve' | 'reject'; reason?: string };
