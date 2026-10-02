/**
 * Request schemas.
 *
 * These Zod schemas are the contract between the website, the API and the
 * tests. The backend validates every request body/query with them (via
 * `ZodValidationPipe`) and the website reuses the exact same schema for form
 * validation, so client and server rules can never drift apart.
 */
import { z } from 'zod';
import {
  COMMISSION_CALC_TYPES,
  COMMISSION_SCOPES,
  ORDER_STATUSES,
  SERVICE_SORTS,
  SERVICE_STATUSES,
} from './enums';
import { money } from './money';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Iranian mobile numbers, e.g. 09123456789. */
export const IRAN_PHONE_RE = /^09\d{9}$/;

export const PASSWORD_MIN_LENGTH = 10;

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .regex(EMAIL_RE, 'ایمیل معتبر نیست.')
  .transform((value) => value.toLowerCase());

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_RE, 'نام کاربری باید ۳ تا ۳۰ کاراکتر انگلیسی، عدد یا _ باشد.')
  .transform((value) => value.toLowerCase());

export const phoneSchema = z
  .string()
  .trim()
  .regex(IRAN_PHONE_RE, 'شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد.`)
  .max(200)
  .refine((value) => /[A-Za-z]/.test(value), 'رمز عبور باید حداقل یک حرف داشته باشد.')
  .refine((value) => /\d/.test(value), 'رمز عبور باید حداقل یک عدد داشته باشد.');

export const uuidSchema = z.string().regex(UUID_RE, 'شناسه معتبر نیست.');

/** Accepts a numeric string or number (Persian digits allowed) and yields exact bigint Rial. */
export const rialAmountSchema = (options: { min?: bigint; max?: bigint; label?: string } = {}) => {
  const label = options.label ?? 'مبلغ';
  const min = options.min ?? 0n;
  return z
    .union([z.string(), z.number()])
    .refine(
      (value) => {
        try {
          money(value as string | number);
          return true;
        } catch {
          return false;
        }
      },
      { message: `${label} نامعتبر است.` },
    )
    .transform((value) => money(value as string | number))
    .refine((value) => value >= min, { message: `${label} باید حداقل ${min} ریال باشد.` })
    .refine((value) => (options.max === undefined ? true : value <= options.max), {
      message: `${label} از حد مجاز بیشتر است.`,
    });
};

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Opaque cursor returned by the previous page. */
  cursor: z.string().trim().max(200).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2, 'نام نمایشی باید حداقل ۲ کاراکتر باشد.').max(60),
  username: usernameSchema.optional(),
  phone: phoneSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const verifyCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'کد تأیید باید ۶ رقمی باشد.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  username: usernameSchema.optional(),
  bio: z.string().trim().max(600).optional(),
  province: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  avatarFileId: uuidSchema.nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/* -------------------------------------------------------------------------- */
/* Catalog                                                                     */
/* -------------------------------------------------------------------------- */

export const createCategorySchema = z.object({
  titleFa: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/, 'نامک باید فقط حروف کوچک انگلیسی، عدد و خط تیره باشد.')
    .transform((v) => v.toLowerCase()),
  parentId: uuidSchema.nullable().optional(),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(40).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createServiceSchema = z.object({
  title: z.string().trim().min(8, 'عنوان باید حداقل ۸ کاراکتر باشد.').max(120),
  categoryId: uuidSchema,
  description: z.string().trim().min(40, 'توضیحات باید حداقل ۴۰ کاراکتر باشد.').max(5000),
  priceRial: rialAmountSchema({ min: 10_000n, max: 100_000_000_000n, label: 'قیمت' }),
  deliveryDays: z.coerce.number().int().min(1).max(180),
  revisions: z.coerce.number().int().min(0).max(20).default(0),
  tags: z.array(z.string().trim().min(2).max(30)).max(10).default([]),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial().extend({
  status: z.enum(['draft', 'paused']).optional(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const serviceQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(80).optional(),
  categorySlug: z.string().trim().max(60).optional(),
  providerUsername: z.string().trim().max(30).optional(),
  minPriceRial: rialAmountSchema({ label: 'کمترین قیمت' }).optional(),
  maxPriceRial: rialAmountSchema({ label: 'بیشترین قیمت' }).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxDeliveryDays: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(SERVICE_SORTS).default('newest'),
  status: z.enum(SERVICE_STATUSES).optional(),
});
export type ServiceQuery = z.infer<typeof serviceQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

export const createOrderSchema = z.object({
  serviceId: uuidSchema,
  note: z.string().trim().max(1000).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  role: z.enum(['buyer', 'provider']).default('buyer'),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const orderTransitionSchema = z.object({
  reason: z.string().trim().max(600).optional(),
  message: z.string().trim().max(2000).optional(),
});
export type OrderTransitionInput = z.infer<typeof orderTransitionSchema>;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'متن پیام خالی است.').max(4000),
  fileIds: z.array(uuidSchema).max(5).default([]),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/* -------------------------------------------------------------------------- */
/* Wallet / payments                                                           */
/* -------------------------------------------------------------------------- */

export const depositSchema = z.object({
  amountRial: rialAmountSchema({ min: 10_000n, max: 500_000_000n, label: 'مبلغ شارژ' }),
});
export type DepositInput = z.infer<typeof depositSchema>;

export const transferSchema = z.object({
  toUsername: usernameSchema,
  amountRial: rialAmountSchema({ min: 10_000n, max: 100_000_000n, label: 'مبلغ انتقال' }),
  note: z.string().trim().max(200).optional(),
});
export type TransferInput = z.infer<typeof transferSchema>;

export const walletQuerySchema = paginationQuerySchema.extend({
  kind: z
    .enum([
      'deposit',
      'withdrawal',
      'order_payment',
      'escrow_release',
      'commission',
      'refund',
      'transfer',
      'adjustment',
    ])
    .optional(),
  direction: z.enum(['debit', 'credit']).optional(),
});
export type WalletQuery = z.infer<typeof walletQuerySchema>;

export const adminAdjustmentSchema = z.object({
  userId: uuidSchema,
  /** Signed amount; positive credits the wallet, negative debits it. */
  amountRial: z
    .union([z.string(), z.number()])
    .refine(
      (value) => {
        try {
          money(value as string | number);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'مبلغ نامعتبر است.' },
    )
    .transform((value) => money(value as string | number))
    .refine((value) => value !== 0n, { message: 'مبلغ نمی‌تواند صفر باشد.' }),
  reason: z.string().trim().min(5, 'دلیل اصلاح الزامی است.').max(300),
});
export type AdminAdjustmentInput = z.infer<typeof adminAdjustmentSchema>;

export const commissionRuleSchema = z.object({
  scope: z.enum(COMMISSION_SCOPES),
  scopeRef: uuidSchema.nullable().optional(),
  calcType: z.enum(COMMISSION_CALC_TYPES).default('percent'),
  percentBps: z.coerce.number().int().min(0).max(10000).default(0),
  fixedAmount: rialAmountSchema({ label: 'مبلغ ثابت' }).default(0n),
  minCommission: rialAmountSchema({ label: 'کف کمیسیون' }).nullable().optional(),
  maxCommission: rialAmountSchema({ label: 'سقف کمیسیون' }).nullable().optional(),
  priority: z.coerce.number().int().min(0).max(1000).default(100),
  isActive: z.boolean().default(true),
});
export type CommissionRuleInput = z.infer<typeof commissionRuleSchema>;

/* -------------------------------------------------------------------------- */
/* Reviews / reports                                                           */
/* -------------------------------------------------------------------------- */

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'امتیاز باید بین ۱ تا ۵ باشد.').max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const createReportSchema = z.object({
  targetType: z.enum(['user', 'service', 'order', 'message']),
  targetId: uuidSchema,
  reason: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

/* -------------------------------------------------------------------------- */
/* Admin                                                                       */
/* -------------------------------------------------------------------------- */

export const moderationDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(300).optional(),
});
export type ModerationDecisionInput = z.infer<typeof moderationDecisionSchema>;

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const settingUpdateSchema = z.object({
  key: z.string().trim().min(2).max(80),
  value: z.unknown(),
});
