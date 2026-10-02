'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  LogOut,
  Package,
  ShieldCheck,
  Store,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AuthGuard } from '@/components/auth-guard';
import { RatingStars } from '@/components/rating-stars';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';
import { faNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  user: 'کاربر',
  provider: 'ارائه‌دهنده',
  support: 'پشتیبانی',
  admin: 'مدیر',
};

export default function AccountPage() {
  return (
    <AuthGuard>
      <AccountDetails />
    </AuthGuard>
  );
}

function AccountDetails() {
  const { user, isProvider, isAdmin, becomeProvider, signOut } = useSession();
  const router = useRouter();
  const toast = useToast();

  if (!user) return null;

  const upgrade = async () => {
    try {
      await becomeProvider();
      toast.success('حساب شما به ارائه‌دهنده ارتقا یافت. حالا می‌توانید خدمت بسازید.');
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('از حساب خود خارج شدید.');
    router.push('/');
  };

  const stats = [
    { label: 'سفارش تکمیل‌شده', value: faNumber(user.profile.completedOrdersCount) },
    { label: 'امتیاز', value: faNumber(user.profile.ratingAverage) },
    { label: 'تعداد امتیازها', value: faNumber(user.profile.ratingCount) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">حساب کاربری</h1>
        <p className="text-sm text-muted-foreground">
          اطلاعات حساب، نقش‌ها و دسترسی‌های شما در تسکنو.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-lg">
                {user.profile.displayName.trim().slice(0, 1) || '؟'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <p className="truncate text-lg font-bold">{user.profile.displayName}</p>
              <p className="truncate text-sm text-muted-foreground" dir="ltr">
                @{user.profile.username} · {user.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user.roles.map((role) => (
              <Badge key={role} tone={role === 'admin' ? 'danger' : role === 'provider' ? 'primary' : 'neutral'}>
                {ROLE_LABELS[role] ?? role}
              </Badge>
            ))}
            <Badge tone={user.status === 'active' ? 'success' : 'warning'}>
              {user.status === 'active' ? 'حساب فعال' : user.status === 'suspended' ? 'حساب معلق' : 'در انتظار فعال‌سازی'}
            </Badge>
            <Badge tone={user.emailVerified ? 'success' : 'neutral'}>
              {user.emailVerified ? 'ایمیل تأیید شده' : 'ایمیل تأیید نشده'}
            </Badge>
          </div>

          {user.profile.bio ? <p className="text-sm leading-7 text-muted-foreground">{user.profile.bio}</p> : null}

          <Separator />

          <div className="grid grid-cols-3 gap-3 text-center">
            {stats.map((stat) => (
              <div key={stat.label} className="space-y-1">
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RatingStars value={user.profile.ratingAverage} />
            از مجموع {faNumber(user.profile.ratingCount)} امتیاز
          </div>
        </CardContent>
      </Card>

      {!isProvider ? (
        <Alert tone="info" title="ارائه‌دهنده شوید">
          با ارتقای حساب، می‌توانید خدمت منتشر کنید، سفارش دریافت کنید و درآمد خود را برداشت کنید.
          <div className="mt-3">
            <Button onClick={() => void upgrade()}>
              <Store />
              ارتقا به ارائه‌دهنده
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>دسترسی سریع</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <QuickLink href="/orders" icon={<Package className="size-4" />} label="سفارش‌های من" hint="خرید، فروش و وضعیت سفارش‌ها" />
          <QuickLink href="/wallet" icon={<Wallet className="size-4" />} label="کیف پول" hint="موجودی، شارژ، انتقال و تراکنش‌ها" />
          <QuickLink href="/notifications" icon={<Bell className="size-4" />} label="اطلاع‌رسانی‌ها" hint="تغییر وضعیت سفارش‌ها و پیام‌ها" />
          {isProvider ? (
            <QuickLink href="/provider" icon={<Store className="size-4" />} label="داشبورد ارائه‌دهنده" hint="خدمات، سفارش‌های دریافتی و درآمد" />
          ) : null}
          {isAdmin ? (
            <QuickLink href="/admin" icon={<ShieldCheck className="size-4" />} label="پنل مدیریت" hint="بازبینی خدمات، کاربران و دفتر مالی" />
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/services">
            مرور خدمات
            <ArrowLeft />
          </Link>
        </Button>
        <Button variant="destructive" onClick={() => void handleSignOut()}>
          <LogOut />
          خروج از حساب
        </Button>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-right transition',
        'hover:border-primary/40 hover:bg-accent',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </Link>
  );
}
