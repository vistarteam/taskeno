# Taskeno

بازار خدمات دیجیتال و پلتفرم سفارش/کیف پول با معماری **مونولیت ماژولار**.

- **بک‌اند:** NestJS 12 + Fastify + Drizzle ORM
- **فرانت‌اند:** Next.js (App Router) + Tailwind CSS v4 + کامپوننت‌های shadcn/ui روی Radix · رابط کاربری کامل فارسی و راست‌به‌چپ
- **دیتابیس:** در توسعه/تست = PGlite (Postgres تعبیه‌شده، بدون نیاز به Docker) · در production = PostgreSQL
- **پول:** همه‌جا عدد صحیح ریال به‌صورت `bigint` (نمایش تومان = ریال ÷ ۱۰)
- **دفتر مالی:** دوطرفه (double-entry) با کیف‌پول‌های سیستمی

> فرانت‌اند در `Website/` اجرا می‌شود و روی پورت `3000` بالا می‌آید. درخواست‌های `/api/*` از طریق rewrite نکست به API فوروارد می‌شوند تا کوکی نشست (`tk_session`) first-party بماند و نیازی به CORS نباشد.

---

## پیش‌نیازها

| ابزار | نسخه پیشنهادی |
|------|----------------|
| Node.js | ≥ 22 (تست‌شده روی v24) |
| pnpm | 11 (طبق `packageManager`) |

نیازی به Docker، Postgres یا Redis نیست؛ در حالت توسعه از PGlite و صف کارهای روی خود Postgres استفاده می‌شود.
(Python فقط برای اسکریپت تست دود اختیاری است.)

---

## ۱) نصب وابستگی‌ها

از ریشهٔ پروژه:

```bash
pnpm install
```

سپس قراردادهای مشترک را یک بار build کنید (زیرا بک‌اند از `dist` آن استفاده می‌کند):

```bash
pnpm --filter @taskeno/contracts build
```

---

## ۲) تنظیمات محیطی (اختیاری)

بدون هیچ فایل تنظیمی هم اجرا می‌شود؛ پیش‌فرض‌ها برای توسعه مناسب‌اند.
برای تغییر رفتار، فایل نمونه را کپی کنید:

```bash
cp .env.example .env
```

نکات مهم:
- `NODE_ENV=development` و `DATABASE_URL` خالی ⇐ استفادهٔ خودکار از PGlite.
- `PORT=4000` پورت پیش‌فرض API است.
- در `production` باید `DATABASE_URL`، `COOKIE_SECURE=true` و `CORS_ORIGINS` تنظیم شوند و `FEATURE_P2P_TRANSFERS` خاموش بماند (اعتبارسنجی در زمان boot جلوی اجرای ناایمن را می‌گیرد).

---

## ۳) آماده‌سازی دیتابیس

```bash
pnpm db:migrate   # ساخت جداول + triggerهای عدم‌تغییرپذیری و invariants مالی
pnpm db:seed      # نقش‌ها، کیف‌پول‌های سیستمی، دسته‌بندی‌ها، کاربر مدیر، قوانین کمیسیون
```

برای پاک‌کردن کامل دیتابیس تعبیه‌شده و اجرای دوباره از صفر:

```bash
pnpm db:reset     # فقط روی PGlite اثر دارد و در production اجرا نمی‌شود
```

> اولین اجرای `db:migrate` ممکن است تا ~۱ دقیقه طول بکشد (بالا آمدن PGlite/WASM). طبیعی است.

---

## ۴) اجرا

ترمینال‌های جدا باز کنید.

**ترمینال ۱ — API:**

```bash
pnpm dev:api
```

**ترمینال ۲ — worker (کارهای زمان‌بندی‌شده: انقضای پرداخت‌ها، تکمیل خودکار سفارش‌ها، تسویه‌ها، outbox، reconcile دفترمالی):**

```bash
pnpm dev:worker
```

**ترمینال ۳ — فرانت‌اند:**

```bash
pnpm dev:web
```

سپس <http://localhost:3000> را باز کنید. خروجی موفق API:

```
Taskeno API → http://127.0.0.1:4000
```

برای اجرای نسخهٔ production فرانت‌اند:

```bash
pnpm --filter @taskeno/website build
pnpm --filter @taskeno/website start   # PORT=3000 قابل تنظیم است
```

اگر API روی میزبان/پورت دیگری است، آدرس آن را با `API_ORIGIN` به فرانت‌اند بدهید (پیش‌فرض `http://127.0.0.1:4000`).

### آدرس‌های مفید

| مسیر | توضیح |
|------|-------|
| `GET /health/live` | بررسی زنده‌بودن |
| `GET /health/ready` | بررسی آمادگی + دیتابیس |
| `GET /api/v1/services` | فهرست عمومی خدمات |
| `GET /api/v1/categories` | دسته‌بندی‌ها |

### کاربر مدیر پیش‌فرض (فقط توسعه)

```
ایمیل:   admin@taskeno.local
رمز:     Taskeno!1404
```

---

## ۵) اجرای تست‌ها

```bash
pnpm -r typecheck                 # tsc --noEmit روی همهٔ پکیج‌ها
pnpm --filter @taskeno/backend test   # vitest: state machine، کمیسیون، دفترمالی، پول
```

برای یک بررسی سرتاسری «اسکلت پول» روی یک سرور در حال اجرا (اختیاری، نیازمند Python 3):

```bash
python backend/scripts/smoke_e2e.py
```

---

## ثبت سریع تغییرات در Git

پس از راه‌اندازی اولیهٔ Git و اتصال مخزن به GitHub، برای ثبت و ارسال تمام
تغییرات فقط این دستور را اجرا کنید:

```bash
pnpm commit -- "شرح کوتاه تغییر"
```

اسکریپت تغییرات را stage می‌کند، یک commit می‌سازد و آن را به remote ارسال
می‌کند. اگر پیام را ندهید، آن را از شما می‌پرسد.

---

## ساختار پروژه

```
Taskeno/
├─ packages/contracts/   # enums، کدهای خطا + پیام فارسی، ریاضی پول، اسکیمای Zod، فرمت Jalali
├─ backend/              # API + worker + دیتابیس
│  ├─ src/db/            # schema، migrations، client (PGlite/pg)، migrate/seed/reset
│  ├─ src/modules/       # auth، catalog، orders، payments، wallet (ledger/commission)، reviews،
│  │                     # notifications، admin، settings، jobs/worker
│  ├─ src/common/        # errors، logger، guards، pipes، outbox، audit، rate-limit
│  └─ scripts/           # smoke_e2e.py
└─ Website/              # فرانت‌اند Next.js (App Router)
   ├─ app/               # صفحات: خانه، خدمات، سفارش‌ها، کیف پول، ارائه‌دهنده، مدیریت پرداخت/نتیجه، پنل ادمین
   ├─ components/        # کامپوننت‌های مشترک + `ui/` (پایه‌های shadcn/ui) + `admin/`
   └─ lib/               # لایهٔ API، انواع، هوک‌ها، نشست، فرمت پول و تاریخ جلالی
```

### نکات فنی

- **پول:** هرگز float نیست؛ `bigint` ریال + `numeric(20,0)` در دیتابیس. کمیسیون با `basis points` و حساب صحیح.
- **دفتر مالی:** هر journal باید تراز باشد؛ trigger دیتابیس این را در commit بررسی می‌کند. موجودی کیف‌پول کاربر هرگز منفی نمی‌شود.
- **jargon اسکریپت‌ها:** برای اجرای TypeScript از `ts-node --transpile-only` استفاده می‌شود (نه `tsx`) چون NestJS به decorator metadata نیاز دارد.
- **درگاه پرداخت:** پیش‌فرض `sandbox` است و بدون تنظیمات اضافه کار می‌کند؛ آداپتور زرین‌پال بدون `ZARINPAL_MERCHANT_ID` بی‌اثر است.
- **بدون Redis:** صف کارها در جدول `jobs` و با `FOR UPDATE SKIP LOCKED` پیاده شده است.
- **فرانت‌اند/RTL:** `<html dir="rtl" lang="fa">` با فونت وزیرمتن. مبالغ به تومان و تاریخ‌ها به تقویم جلالی نمایش داده می‌شوند (منطق مشترک از `@taskeno/contracts`). کامپوننت‌های `ui/` بدون CLI شادcn و دستی روی Radix + `cva` نوشته شده‌اند.
- **تصاویر خدمات:** آپلود multipart با فیلد `file` روی `POST /services/:id/images` (پیش‌نیاز ارسال خدمت به بازبینی).
#   t a s k e n o  
 