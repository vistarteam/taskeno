'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Store } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { LoadMore } from '@/components/load-more';
import { AuthGuard } from '@/components/auth-guard';
import { useResource, request } from '@/lib/hooks';
import { qs } from '@/lib/api';
import { faNumber, formatJalaliDateTime, formatRelativeTime } from '@/lib/format';
import type { OrderListItem, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUSES = [
  { value: 'all', label: 'همه وضعیت‌ها' },
  { value: 'pending_payment', label: 'در انتظار پرداخت' },
  { value: 'paid', label: 'پرداخت‌شده' },
  { value: 'accepted', label: 'پذیرفته‌شده' },
  { value: 'in_progress', label: 'در حال انجام' },
  { value: 'delivered', label: 'تحویل‌شده' },
  { value: 'completed', label: 'تکمیل‌شده' },
  { value: 'disputed', label: 'در اختلاف' },
  { value: 'cancelled', label: 'لغوشده' },
];

export default function OrdersPage() {
  return (
    <AuthGuard>
      <OrdersList />
    </AuthGuard>
  );
}

function OrdersList() {
  const router = useRouter();
  const [role, setRole] = useState<'buyer' | 'provider'>('buyer');
  const [status, setStatus] = useState('all');

  const path = `/orders${qs({ role, status: status === 'all' ? undefined : status, limit: 10 })}`;
  const first = useResource<Paginated<OrderListItem>>(path);

  const [items, setItems] = useState<OrderListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (first.data) {
      setItems(first.data.items);
      setCursor(first.data.nextCursor);
    }
  }, [first.data]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await request<Paginated<OrderListItem>>(
        `${path}&cursor=${encodeURIComponent(cursor)}`,
      );
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">سفارش‌های من</h1>
        <p className="text-sm text-muted-foreground">
          وضعیت پرداخت، تحویل و پیام‌های هر سفارش را از اینجا پیگیری کنید.
        </p>
      </header>

      <Tabs value={role} onValueChange={(value) => setRole(value as 'buyer' | 'provider')}>
        <TabsList className="max-w-sm">
          <TabsTrigger value="buyer">خریدهای من</TabsTrigger>
          <TabsTrigger value="provider">سفارش‌های دریافتی</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="فیلتر وضعیت">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {role === 'provider' ? (
          <Button variant="outline" size="sm" onClick={() => router.push('/provider')}>
            <Store />
            داشبورد ارائه‌دهنده
          </Button>
        ) : null}
      </div>

      {first.loading && items.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={role === 'buyer' ? 'هنوز سفارشی ثبت نکرده‌اید' : 'سفارشی دریافت نکرده‌اید'}
          description={
            role === 'buyer'
              ? 'برای شروع، از فهرست خدمات یک خدمت انتخاب کنید.'
              : 'پس از انتشار خدمت، سفارش‌های خریداران اینجا نمایش داده می‌شود.'
          }
          action={
            <Button asChild variant="outline">
              <Link href="/services">مرور خدمات</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
          <LoadMore hasMore={Boolean(cursor)} loading={loadingMore} onLoadMore={loadMore} count={items.length} />
        </div>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: OrderListItem }) {
  return (
    <Card className="transition hover:border-primary/40">
      <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline" className="tabular" dir="ltr">
              {order.code}
            </Badge>
            <StatusBadge kind="order" status={order.status} />
            <StatusBadge kind="order-payment" status={order.paymentStatus} />
            <Badge tone={order.role === 'buyer' ? 'neutral' : 'primary'}>
              {order.role === 'buyer' ? 'خرید' : 'فروش'}
            </Badge>
          </div>

          <Link href={`/orders/${order.id}`} className="block truncate font-medium transition hover:text-primary">
            {order.serviceTitle}
          </Link>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span title={formatJalaliDateTime(order.createdAt)}>{formatRelativeTime(order.createdAt)}</span>
            <span>تحویل {faNumber(order.deliveryDays)} روزه</span>
            {order.autoCompleteAt ? (
              <span>تکمیل خودکار: {formatJalaliDateTime(order.autoCompleteAt)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
          <Money value={order.total} className="font-semibold" />
          <Button asChild size="sm" variant={order.actions.includes('pay') ? 'default' : 'outline'}>
            <Link href={`/orders/${order.id}`}>
              {order.actions.length > 0 ? 'اقدام لازم' : 'مشاهده'}
              <ArrowLeft />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
