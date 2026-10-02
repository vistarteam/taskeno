import { eq, sql } from 'drizzle-orm';
import { ROLE_KEYS, PLATFORM_WALLET_CODES } from '@taskeno/contracts';
import { closeDatabase, createDatabase } from './client';
import { categories, commissionRules, profiles, roles, settings, users, wallets } from './schema';
import { env, isProduction } from '../config/env';
import { PasswordService } from '../common/password';

/**
 * Seeds the structural data Taskeno cannot run without.
 *
 * Idempotent by design: safe to run on every deployment. The development admin
 * is refused in production — production admins are created deliberately by an
 * operator, never by a script with a known password.
 */

const ROLE_TITLES: Record<(typeof ROLE_KEYS)[number], string> = {
  user: 'کاربر',
  provider: 'ارائه‌دهنده خدمت',
  support: 'پشتیبانی',
  admin: 'مدیر سیستم',
};

const PLATFORM_WALLET_DESCRIPTIONS: Record<(typeof PLATFORM_WALLET_CODES)[number], string> = {
  GATEWAY_CLEARING: 'درگاه پرداخت',
  ESCROW: 'امانت سفارش‌ها',
  REVENUE: 'درآمد Taskeno',
  FEES: 'کارمزدها',
  ADJUSTMENT: 'اصلاحات دستی',
};

const CATEGORY_SEED: Array<{ slug: string; titleFa: string; icon: string; children: Array<{ slug: string; titleFa: string }> }> = [
  {
    slug: 'design',
    titleFa: 'طراحی و گرافیک',
    icon: 'palette',
    children: [
      { slug: 'logo-design', titleFa: 'طراحی لوگو' },
      { slug: 'ui-ux', titleFa: 'طراحی رابط و تجربه کاربری' },
      { slug: 'graphic', titleFa: 'طراحی گرافیک و بنر' },
    ],
  },
  {
    slug: 'development',
    titleFa: 'برنامه‌نویسی و توسعه',
    icon: 'code',
    children: [
      { slug: 'web-development', titleFa: 'توسعه وب' },
      { slug: 'mobile-app', titleFa: 'اپلیکیشن موبایل' },
      { slug: 'automation', titleFa: 'اسکریپت و اتوماسیون' },
      { slug: 'bug-fix', titleFa: 'رفع اشکال و بهینه‌سازی' },
    ],
  },
  {
    slug: 'marketing',
    titleFa: 'دیجیتال مارکتینگ',
    icon: 'megaphone',
    children: [
      { slug: 'seo', titleFa: 'سئو' },
      { slug: 'social-media', titleFa: 'شبکه‌های اجتماعی' },
      { slug: 'ads', titleFa: 'تبلیغات پولی' },
    ],
  },
  {
    slug: 'content',
    titleFa: 'ترجمه و تولید محتوا',
    icon: 'pen',
    children: [
      { slug: 'translation', titleFa: 'ترجمه' },
      { slug: 'copywriting', titleFa: 'نویسندگی و کپی‌رایتینگ' },
      { slug: 'transcription', titleFa: 'تایپ و پیاده‌سازی صوت' },
    ],
  },
  {
    slug: 'video',
    titleFa: 'ویدیو و انیمیشن',
    icon: 'video',
    children: [
      { slug: 'video-editing', titleFa: 'تدوین ویدیو' },
      { slug: 'motion-graphics', titleFa: 'موشن گرافیک' },
    ],
  },
  {
    slug: 'business',
    titleFa: 'خدمات کسب‌وکار و مجازی',
    icon: 'briefcase',
    children: [
      { slug: 'virtual-assistant', titleFa: 'دستیار مجازی' },
      { slug: 'data-entry', titleFa: 'ورود اطلاعات' },
      { slug: 'consulting', titleFa: 'مشاوره' },
    ],
  },
];

const seed = async (): Promise<void> => {
  const { db, close } = await createDatabase();

  // --- roles ---------------------------------------------------------------
  for (const key of ROLE_KEYS) {
    await db
      .insert(roles)
      .values({ key, titleFa: ROLE_TITLES[key] })
      .onConflictDoNothing({ target: roles.key });
  }

  // --- platform wallets ----------------------------------------------------
  for (const code of PLATFORM_WALLET_CODES) {
    await db
      .insert(wallets)
      .values({ ownerType: 'platform', code, currency: env.CURRENCY, balance: 0n })
      .onConflictDoNothing({ target: wallets.code });
  }

  // --- settings ------------------------------------------------------------
  const defaultSettings: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'commission.default_bps', value: env.COMMISSION_DEFAULT_BPS, description: 'درصد پیش‌فرض کمیسیون (بیسیس پوینت)' },
    { key: 'wallet.p2p_transfers.enabled', value: env.FEATURE_P2P_TRANSFERS, description: 'فعال بودن انتقال بین کاربران' },
    { key: 'wallet.withdrawals.enabled', value: env.FEATURE_WITHDRAWALS, description: 'فعال بودن برداشت نقدی' },
    { key: 'wallet.transfer.daily_limit', value: '50000000', description: 'سقف روزانه انتقال داخلی (ریال)' },
    { key: 'orders.accept_deadline_hours', value: env.ORDER_ACCEPT_DEADLINE_HOURS, description: 'مهلت پذیرش سفارش توسط Provider' },
    { key: 'orders.auto_complete_days', value: env.ORDER_AUTO_COMPLETE_DAYS, description: 'تکمیل خودکار پس از تحویل' },
    { key: 'payments.expiry_minutes', value: env.PAYMENT_EXPIRY_MINUTES, description: 'مهلت پرداخت' },
  ];
  for (const item of defaultSettings) {
    await db
      .insert(settings)
      .values({ key: item.key, value: item.value, description: item.description })
      .onConflictDoNothing({ target: settings.key });
  }

  // --- categories ----------------------------------------------------------
  for (const [index, parent] of CATEGORY_SEED.entries()) {
    await db
      .insert(categories)
      .values({ slug: parent.slug, titleFa: parent.titleFa, icon: parent.icon, sortOrder: index, parentId: null })
      .onConflictDoNothing({ target: categories.slug });

    const [saved] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, parent.slug)).limit(1);

    for (const [childIndex, child] of parent.children.entries()) {
      await db
        .insert(categories)
        .values({ slug: child.slug, titleFa: child.titleFa, parentId: saved.id, sortOrder: childIndex })
        .onConflictDoNothing({ target: categories.slug });
    }
  }

  // --- default global commission rule --------------------------------------
  const [existingRule] = await db
    .select({ id: commissionRules.id })
    .from(commissionRules)
    .where(eq(commissionRules.scope, 'global'))
    .limit(1);

  if (!existingRule) {
    await db.insert(commissionRules).values({
      scope: 'global',
      scopeRef: null,
      calcType: 'percent',
      percentBps: env.COMMISSION_DEFAULT_BPS,
      fixedAmount: 0n,
      priority: 1000,
      isActive: true,
    });
  }

  // --- development admin ---------------------------------------------------
  const adminEmail = 'admin@taskeno.local';
  let adminPassword: string | null = null;

  if (!isProduction) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);
    if (!existing) {
      const passwords = new PasswordService();
      adminPassword = 'Taskeno!1404';
      const passwordHash = await passwords.hash(adminPassword);

      const [admin] = await db.insert(users).values({ email: adminEmail, passwordHash }).returning();
      await db.insert(profiles).values({
        userId: admin.id,
        username: 'admin',
        displayName: 'مدیر Taskeno',
        isProvider: true,
      });
      await db.insert(wallets).values({ ownerType: 'user', ownerId: admin.id, currency: env.CURRENCY, balance: 0n });

      const roleRows = await db.select({ id: roles.id, key: roles.key }).from(roles);
      const wanted = roleRows.filter((role) => role.key === 'admin' || role.key === 'provider' || role.key === 'user');
      for (const role of wanted) {
        await db.execute(
          sql`insert into user_roles (user_id, role_id) values (${admin.id}, ${role.id}) on conflict do nothing`,
        );
      }
    }
  }

  await db.execute(sql`select 1`);
  await close();

  // eslint-disable-next-line no-console
  console.log('[seed] done');
  if (adminPassword) {
    // eslint-disable-next-line no-console
    console.log(`[seed] development admin: ${adminEmail} / ${adminPassword}`);
  }
};

seed().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', error);
  process.exit(1);
});
