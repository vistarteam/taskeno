'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { LoadMore } from '@/components/load-more';
import { AuthGuard } from '@/components/auth-guard';
import { useResource, request } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';
import { formatJalaliDateTime, formatRelativeTime } from '@/lib/format';
import type { Notification, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <NotificationsList />
    </AuthGuard>
  );
}

function NotificationsList() {
  const router = useRouter();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const first = useResource<Paginated<Notification>>(`/notifications?limit=15${unreadOnly ? '&unread=true' : ''}`);

  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);

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
      const page = await request<Paginated<Notification>>(
        `/notifications?limit=15&cursor=${encodeURIComponent(cursor)}`,
      );
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await request('/notifications/read-all', { method: 'POST', body: {} });
      toast.success('همه اطلاع‌رسانی‌ها خوانده‌شده شدند.');
      first.reload();
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const open = async (notification: Notification) => {
    try {
      if (!notification.read) await request(`/notifications/${notification.id}/read`, { method: 'POST', body: {} });
    } catch {
      /* reading is best-effort; navigation still works */
    }
    if (notification.entityType === 'order' && notification.entityId) {
      router.push(`/orders/${notification.entityId}`);
    } else {
      first.reload();
    }
  };

  const hasUnread = items.some((item) => !item.read);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">اطلاع‌رسانی‌ها</h1>
          <p className="text-sm text-muted-foreground">رویدادهای سفارش‌ها، پرداخت‌ها و کیف پول شما.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setUnreadOnly((value) => !value)}>
            <BellRing />
            {unreadOnly ? 'نمایش همه' : 'فقط خوانده‌نشده‌ها'}
          </Button>
          <Button size="sm" loading={busy} disabled={!hasUnread} onClick={() => void markAll()}>
            <CheckCheck />
            خواندن همه
          </Button>
        </div>
      </header>

      {first.loading && items.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="اطلاع‌رسانی جدیدی نیست"
          description="به‌محض تغییر وضعیت سفارش‌ها، همین‌جا مطلع می‌شوید."
        />
      ) : (
        <div className="space-y-2">
          {items.map((notification) => (
            <Card
              key={notification.id}
              className={cn(
                'cursor-pointer transition hover:border-primary/40',
                !notification.read && 'border-primary/30 bg-primary/4',
              )}
              onClick={() => void open(notification)}
            >
              <CardContent className="flex items-start gap-3 pt-5">
                <span
                  className={cn(
                    'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                    notification.read ? 'bg-muted text-muted-foreground' : 'bg-primary/12 text-primary',
                  )}
                >
                  <Bell className="size-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{notification.title}</p>
                    {!notification.read ? <Badge tone="primary">جدید</Badge> : null}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{notification.body}</p>
                  <p className="text-[11px] text-muted-foreground" title={formatJalaliDateTime(notification.createdAt)}>
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
          <LoadMore hasMore={Boolean(cursor)} loading={loadingMore} onLoadMore={loadMore} count={items.length} />
        </div>
      )}
    </div>
  );
}
