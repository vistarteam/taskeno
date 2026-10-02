'use client';

import Link from 'next/link';
import { ArrowLeft, ListChecks, Package, Plus, Star, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { ServiceCard } from '@/components/service-card';
import { StatusBadge } from '@/components/status-badge';
import { AuthGuard } from '@/components/auth-guard';
import { useResource } from '@/lib/hooks';
import { faNumber, formatRelativeTime } from '@/lib/format';
import type { Paginated, ServiceCard as ServiceCardModel, OrderListItem, WalletSummary } from '@/lib/types';

export default function ProviderDashboardPage() {
  return (
    <AuthGuard requireProvider>
      <Dashboard />
    </AuthGuard>
  );
}

function Dashboard() {
  const services = useResource<Paginated<ServiceCardModel>>('/me/services?limit=50');
  const incoming = useResource<Paginated<OrderListItem>>('/orders?role=provider&limit=5');
  const wallet = useResource<WalletSummary>('/wallet/summary');

  const list = services.data?.items ?? [];
  const published = list.filter((service) => service.status === 'published');
  const pendingReview = list.filter((service) => service.status === 'pending_review');
  const drafts = list.filter((service) => service.status === 'draft' || service.status === 'rejected');
  const needsAction = (incoming.data?.items ?? []).filter((order) => order.actions.length > 0);
  const totalRating = list.reduce((sum, service) => sum + service.rating * service.ratingCount, 0);
  const totalRatings = list.reduce((sum, service) => sum + service.ratingCount, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">داشبورد ارائه‌دهنده</h1>
          <p className="text-sm text-muted-foreground">
            خدمات، سفارش‌های دریافتی و درآمد خود را از اینجا مدیریت کنید.
          </p>
        </div>
        <Button asChild>
          <Link href="/provider/services/new">
            <Plus />
            خدمت جدید
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="خدمات منتشرشده"
          value={faNumber(published.length)}
          hint={`${faNumber(drafts.length)} پیش‌نویس · ${faNumber(pendingReview.length)} در بازبینی`}
          icon={<Package className="size-4 text-primary" />}
        />
        <StatCard
          title="سفارش‌های نیازمند اقدام"
          value={faNumber(needsAction.length)}
          hint="پذیرش، شروع کار یا تحویل"
          icon={<ListChecks className="size-4 text-warning" />}
        />
        <StatCard
          title="موجودی کیف پول"
          value={<Money value={wallet.data?.balance ?? '0'} />}
          hint="پس از کسر کمیسیون واریز می‌شود"
          icon={<Wallet className="size-4 text-success" />}
        />
        <StatCard
          title="میانگین امتیاز"
          value={totalRatings > 0 ? faNumber((totalRating / totalRatings).toFixed(1)) : '—'}
          hint={`${faNumber(totalRatings)} نظر ثبت‌شده`}
          icon={<Star className="size-4 text-warning" />}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>سفارش‌های دریافتی</CardTitle>
          <Link href="/orders" className="flex items-center gap-1 text-sm text-primary hover:underline">
            همه سفارش‌ها
            <ArrowLeft className="size-4" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {incoming.loading && !incoming.data ? (
            <SkeletonCard />
          ) : incoming.data && incoming.data.items.length > 0 ? (
            incoming.data.items.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 transition hover:border-primary/40"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="outline" className="tabular" dir="ltr">
                      {order.code}
                    </Badge>
                    <StatusBadge kind="order" status={order.status} />
                    {order.actions.length > 0 ? (
                      <Badge tone="warning">{faNumber(order.actions.length)} اقدام لازم</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-sm">{order.serviceTitle}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(order.createdAt)}</p>
                </div>
                <Money value={order.total} className="font-semibold" />
              </Link>
            ))
          ) : (
            <EmptyState
              icon={Package}
              title="سفارشی دریافت نکرده‌اید"
              description="با انتشار خدمات، سفارش‌های خریداران اینجا نمایش داده می‌شود."
            />
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">خدمات من</h2>
          <Link href="/provider/services/new" className="text-sm text-primary hover:underline">
            افزودن خدمت
          </Link>
        </div>

        {services.loading && !services.data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Package}
            title="هنوز خدمتی نساخته‌اید"
            description="اولین خدمت خود را بسازید، تصویر اضافه کنید و برای بازبینی بفرستید."
            action={
              <Button asChild>
                <Link href="/provider/services/new">ساخت خدمت</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((service) => (
              <div key={service.id} className="space-y-2">
                <ServiceCard service={service} showStatus />
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/provider/services/${service.id}`}>ویرایش و مدیریت</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {title}
        </p>
        <p className="text-xl font-bold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
