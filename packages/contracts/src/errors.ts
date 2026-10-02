/**
 * Machine readable error codes.
 *
 * Every API failure returns `{ error: { code, message, requestId } }` where the
 * code is one of these constants. The website maps codes to Persian copy, so a
 * new code must always be added here first.
 */
export const ERROR_CODES = {
  // generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  FORBIDDEN_RESOURCE: 'FORBIDDEN_RESOURCE',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',

  // auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  AUTH_EMAIL_TAKEN: 'AUTH_EMAIL_TAKEN',
  AUTH_PHONE_TAKEN: 'AUTH_PHONE_TAKEN',
  AUTH_USERNAME_TAKEN: 'AUTH_USERNAME_TAKEN',
  AUTH_UNAUTHENTICATED: 'AUTH_UNAUTHENTICATED',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_WEAK_PASSWORD: 'AUTH_WEAK_PASSWORD',

  // catalog
  SERVICE_NOT_FOUND: 'SERVICE_NOT_FOUND',
  SERVICE_INVALID_TRANSITION: 'SERVICE_INVALID_TRANSITION',
  SERVICE_NOT_EDITABLE: 'SERVICE_NOT_EDITABLE',
  SERVICE_NOT_PUBLISHABLE: 'SERVICE_NOT_PUBLISHABLE',
  SERVICE_NOT_PURCHASABLE: 'SERVICE_NOT_PURCHASABLE',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_HAS_CHILDREN: 'CATEGORY_HAS_CHILDREN',

  // orders
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_INVALID_TRANSITION: 'ORDER_INVALID_TRANSITION',
  ORDER_NOT_PAYABLE: 'ORDER_NOT_PAYABLE',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  ORDER_NOT_PARTICIPANT: 'ORDER_NOT_PARTICIPANT',
  ORDER_CANNOT_ORDER_OWN_SERVICE: 'ORDER_CANNOT_ORDER_OWN_SERVICE',
  TASK_NOT_AVAILABLE: 'TASK_NOT_AVAILABLE',
  TASK_CANNOT_TAKE_OWN: 'TASK_CANNOT_TAKE_OWN',
  TASK_NOT_CANCELLABLE: 'TASK_NOT_CANCELLABLE',
  ORDER_DELIVERY_REQUIRED: 'ORDER_DELIVERY_REQUIRED',
  DISPUTE_ALREADY_OPEN: 'DISPUTE_ALREADY_OPEN',

  // wallet / ledger
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_INSUFFICIENT_FUNDS: 'WALLET_INSUFFICIENT_FUNDS',
  WALLET_TRANSFER_DISABLED: 'WALLET_TRANSFER_DISABLED',
  WALLET_TRANSFER_SELF: 'WALLET_TRANSFER_SELF',
  WALLET_TRANSFER_LIMIT_EXCEEDED: 'WALLET_TRANSFER_LIMIT_EXCEEDED',
  LEDGER_UNBALANCED_JOURNAL: 'LEDGER_UNBALANCED_JOURNAL',
  LEDGER_IMMUTABLE: 'LEDGER_IMMUTABLE',

  // payments
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_DUPLICATE: 'PAYMENT_DUPLICATE',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  PAYMENT_VERIFICATION_FAILED: 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_ALREADY_SETTLED: 'PAYMENT_ALREADY_SETTLED',
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',

  // engagement
  REVIEW_NOT_ELIGIBLE: 'REVIEW_NOT_ELIGIBLE',
  REVIEW_ALREADY_SUBMITTED: 'REVIEW_ALREADY_SUBMITTED',

  // uploads
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  UPLOAD_INVALID_TYPE: 'UPLOAD_INVALID_TYPE',
  UPLOAD_LIMIT_REACHED: 'UPLOAD_LIMIT_REACHED',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Persian, user facing message for every error code. */
export const ERROR_MESSAGES_FA: Record<ErrorCode, string> = {
  INTERNAL_ERROR: 'خطای غیرمنتظره در سرور رخ داد. لطفاً بعداً تلاش کنید.',
  VALIDATION_FAILED: 'اطلاعات ارسالی معتبر نیست.',
  NOT_FOUND: 'موردی که خواسته‌اید پیدا نشد.',
  RATE_LIMITED: 'تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید.',
  FORBIDDEN_RESOURCE: 'شما به این بخش دسترسی ندارید.',
  FEATURE_DISABLED: 'این قابلیت در حال حاضر فعال نیست.',
  IDEMPOTENCY_CONFLICT: 'این درخواست قبلاً با اطلاعات متفاوتی ثبت شده است.',
    TASK_NOT_AVAILABLE: 'TASK_NOT_AVAILABLE',
    TASK_CANNOT_TAKE_OWN: 'TASK_CANNOT_TAKE_OWN',
    TASK_NOT_CANCELLABLE: 'TASK_NOT_CANCELLABLE',

  AUTH_INVALID_CREDENTIALS: 'ایمیل یا رمز عبور نادرست است.',
  AUTH_ACCOUNT_LOCKED: 'حساب شما موقتاً قفل شده است. کمی بعد تلاش کنید.',
  AUTH_ACCOUNT_SUSPENDED: 'حساب شما غیرفعال شده است. با پشتیبانی تماس بگیرید.',
  AUTH_EMAIL_TAKEN: 'این ایمیل قبلاً ثبت شده است.',
  AUTH_PHONE_TAKEN: 'این شماره موبایل قبلاً ثبت شده است.',
  AUTH_USERNAME_TAKEN: 'این نام کاربری قبلاً گرفته شده است.',
  AUTH_UNAUTHENTICATED: 'برای ادامه باید وارد حساب خود شوید.',
  AUTH_INVALID_TOKEN: 'این لینک معتبر نیست.',
  AUTH_TOKEN_EXPIRED: 'این لینک منقضی شده است. لینک جدید بگیرید.',
  AUTH_WEAK_PASSWORD: 'رمز عبور انتخابی به‌اندازه کافی قوی نیست.',

  SERVICE_NOT_FOUND: 'خدمت مورد نظر پیدا نشد.',
  SERVICE_INVALID_TRANSITION: 'تغییر وضعیت درخواستی برای این خدمت مجاز نیست.',
  SERVICE_NOT_EDITABLE: 'این خدمت در وضعیت فعلی قابل ویرایش نیست.',
  SERVICE_NOT_PUBLISHABLE: 'برای انتشار، خدمت باید کامل و معتبر باشد.',
  SERVICE_NOT_PURCHASABLE: 'این خدمت در حال حاضر قابل سفارش نیست.',
  CATEGORY_NOT_FOUND: 'دسته‌بندی پیدا نشد.',
  CATEGORY_HAS_CHILDREN: 'این دسته‌بندی زیرمجموعه دارد و قابل حذف نیست.',

  ORDER_NOT_FOUND: 'سفارش مورد نظر پیدا نشد.',
  ORDER_INVALID_TRANSITION: 'این تغییر وضعیت برای سفارش مجاز نیست.',
  ORDER_NOT_PAYABLE: 'این سفارش در وضعیت قابل پرداخت نیست.',
  ORDER_ALREADY_PAID: 'این سفارش قبلاً پرداخت شده است.',
  ORDER_NOT_PARTICIPANT: 'شما در این سفارش نقشی ندارید.',
  ORDER_CANNOT_ORDER_OWN_SERVICE: 'نمی‌توانید خدمت خودتان را سفارش دهید.',
  ORDER_DELIVERY_REQUIRED: 'برای تکمیل باید ابتدا تحویل ثبت شود.',
  DISPUTE_ALREADY_OPEN: 'برای این سفارش قبلاً اختلاف باز شده است.',

  WALLET_NOT_FOUND: 'کیف پول پیدا نشد.',
  WALLET_INSUFFICIENT_FUNDS: 'موجودی کیف پول کافی نیست.',
  WALLET_TRANSFER_DISABLED: 'انتقال داخلی در حال حاضر فعال نیست.',
  WALLET_TRANSFER_SELF: 'انتقال به کیف پول خودتان ممکن نیست.',
  WALLET_TRANSFER_LIMIT_EXCEEDED: 'سقف انتقال روزانه شما تکمیل شده است.',
  LEDGER_UNBALANCED_JOURNAL: 'ثبت مالی نامتوازن است و انجام نشد.',
  LEDGER_IMMUTABLE: 'رکوردهای دفتر کل قابل تغییر نیستند.',

  PAYMENT_NOT_FOUND: 'تراکنش پرداخت پیدا نشد.',
  PAYMENT_DUPLICATE: 'این پرداخت قبلاً ثبت شده است.',
  PAYMENT_EXPIRED: 'زمان این پرداخت به پایان رسیده است.',
  PAYMENT_VERIFICATION_FAILED: 'تأیید پرداخت ناموفق بود.',
  PAYMENT_AMOUNT_MISMATCH: 'مبلغ پرداخت‌شده با سفارش هم‌خوانی ندارد.',
  PAYMENT_ALREADY_SETTLED: 'این تراکنش قبلاً تسویه شده است.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'درگاه پرداخت در دسترس نیست.',

  REVIEW_NOT_ELIGIBLE: 'برای ثبت نظر باید سفارش تکمیل‌شده داشته باشید.',
  REVIEW_ALREADY_SUBMITTED: 'شما قبلاً برای این سفارش نظر ثبت کرده‌اید.',

  UPLOAD_TOO_LARGE: 'حجم فایل بیش از حد مجاز است.',
  UPLOAD_INVALID_TYPE: 'فقط فایل تصویری مجاز است.',
  UPLOAD_LIMIT_REACHED: 'حداکثر تعداد تصویر برای این خدمت تکمیل شده است.',
};

/** Collection of error codes that the UI is allowed to show verbatim. */
export const isErrorCode = (value: string): value is ErrorCode => value in ERROR_CODES;
