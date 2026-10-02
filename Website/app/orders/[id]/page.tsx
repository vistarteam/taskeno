'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Gavel,
  MessageSquare,
  Package,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { PageLoader } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { RatingInput } from '@/components/rating-stars';
import { StatusBadge, ORDER_ACTION_LABELS } from '@/components/status-badge';
import { OrderHistory, OrderProgress } from '@/components/order-timeline';
import { MessageThread } from '@/components/message-thread';
import { AuthGuard } from '@/components/auth-guard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResource, request } from '@/lib/hooks';
import { ApiError, newIdempotencyKey } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatJalaliDateTime, faNumber } from '@/lib/format';
import type { OrderAction, OrderDetail, PaymentIntent } from '@/lib/types';

export default function OrderDetailPage() {
  return (
    <AuthGuard>
      <OrderView />
    </AuthGuard>
  );
}

function OrderView() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const detail = useResource<OrderDetail>(id ? `/orders/${id}` : null);
  const [messageKey, setMessageKey] = useState(0);

  if (detail.loading && !detail.data) return <PageLoader />;
  if (detail.error || !detail.data) {
    return (
      <EmptyState
        icon={Package}
        title="سفارش پیدا نشد"
        description={detail.error?.message}
        action={
          <Button asChild variant="outline">
            <Link href="/orders">بازگشت به سفارش‌ها</Link>
          </Button>
        }
      />
    );
  }

  const order = detail.data;
  const afterChange = () => {
    detail.reload();
    setMessageKey((value) => value + 1);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">سفارش {order.code}</h1>
            <StatusBadge kind="order" status={order.status} />
            <StatusBadge kind="order-payment" status={order.paymentStatus} />
          </div>
          <p className="text-xs text-muted-foreground">
            ثبت‌شده در {formatJalaliDateTime(order.createdAt)}
            {order.autoCompleteAt ? ` · تکمیل خودکار ${formatJalaliDateTime(order.autoCompleteAt)}` : ''}
          </p>
        </div>
        <Badge tone={order.role === 'buyer' ? 'neutral' : 'primary'}>
          شما {order.role === 'buyer' ? 'خریدار' : order.role === 'provider' ? 'ارائه‌دهنده' : 'مدیر'} هستید
        </Badge>
      </header>

      <Card>
        <CardContent className="pt-5">
          <OrderProgress progress={order.progress} status={order.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>جزئیات سفارش</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{order.service?.title ?? 'خدمت حذف‌شده'}</p>
                  {order.service ? (
                    <p className="text-xs text-muted-foreground">
                      تحویل {faNumber(order.service.deliveryDays)} روزه · قیمت{' '}
                      <Money value={order.service.price} />
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1 text-left">
                  <Money value={order.total} className="text-lg font-bold" />
                  {order.commission ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        کمیسیون: <Money value={order.commission.amount} muted />
                      </p>
                      <p className="text-xs text-success">
                        دریافتی شما: <Money value={order.providerNet ?? '0'} className="text-success" />
                      </p>
                    </>
                  ) : null}
                </div>
              </div>

              {order.note ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">توضیحات خریدار</p>
                  <p className="whitespace-pre-wrap text-sm leading-6">{order.note}</p>
                </div>
              ) : null}

              <Separator />

              <div className="flex flex-wrap gap-4 text-sm">
                {order.buyer ? (
                  <Link href={`/providers/${order.buyer.username}`} className="text-muted-foreground transition hover:text-primary">
                    خریدار: <span className="font-medium text-foreground">{order.buyer.displayName}</span>
                  </Link>
                ) : null}
                {order.provider ? (
                  <Link
                    href={`/providers/${order.provider.username}`}
                    className="text-muted-foreground transition hover:text-primary"
                  >
                    ارائه‌دهنده:{' '}
                    <span className="font-medium text-foreground">{order.provider.displayName}</span>
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {order.deliveries.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>تحویل‌ها</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.deliveries.map((delivery) => (
                  <div key={delivery.id} className="space-y-1 rounded-lg border border-border p-3">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Truck className="size-3.5" />
                      {formatJalaliDateTime(delivery.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6">{delivery.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {order.dispute ? (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="size-4 text-warning" />
                  اختلاف ثبت‌شده
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge kind="dispute" status={order.dispute.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatJalaliDateTime(order.dispute.createdAt)}
                  </span>
                </div>
                <p className="leading-6">{order.dispute.reason}</p>
                {order.dispute.resolutionNote ? (
                  <Alert tone="info" title="نتیجه بررسی">
                    {order.dispute.resolutionNote}
                  </Alert>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    کارشناسان
                    تسکنو در حال بررسی این اختلاف هستند.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="size-4 text-primary" />
                گفت‌وگوی سفارش
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MessageThread orderId={order.id} refreshKey={messageKey} onSent={() => setMessageKey((v) => v + 1)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <OrderActions order={order} onDone={afterChange} />
          {order.status === 'completed' && order.role === 'buyer' ? (
            <ReviewCard orderId={order.id} />
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>تاریخچه وضعیت</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderHistory entries={order.history} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OrderActions({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'deliver' | 'cancel' | 'dispute'>(null);
  const [text, setText] = useState('');

  const run = async (action: OrderAction) => {
    setBusy(action);
    try {
      await request(`/orders/${order.id}/${action}`, {
        method: 'POST',
        body: {},
        idempotencyKey: action === 'pay' ? newIdempotencyKey('pay') : undefined,
      });
      toast.success('وضعیت سفارش به‌روزرسانی شد.');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  const runWithText = async () => {
    if (!dialog) return;
    const body = dialog === 'deliver' ? { message: text.trim() } : { reason: text.trim() };
    setBusy(dialog);
    try {
      await request(`/orders/${order.id}/${dialog}`, { method: 'POST', body });
      toast.success(dialog === 'deliver' ? 'تحویل کار ثبت شد.' : 'درخواست شما ثبت شد.');
      setDialog(null);
      setText('');
      onDone();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  /** Escrow payment through the sandbox gateway instead of the wallet. */
  const payWithGateway = async () => {
    setBusy('gateway');
    try {
      const intent = await request<PaymentIntent>(`/orders/${order.id}/pay-gateway`, {
        method: 'POST',
        body: {},
        idempotencyKey: newIdempotencyKey('gateway'),
      });
      window.location.href = intent.redirectUrl;
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ایجاد پرداخت ناموفق بود.');
      setBusy(null);
    }
  };

  if (order.actions.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">اقدامی لازم نیست</p>
          <p className="leading-6">
            {order.status === 'completed'
              ? 'این سفارش تکمیل شده و مبلغ برای ارائه‌دهنده آزاد شده است.'
              : 'در حال حاضر امکان انجام عملیاتی روی این سفارش برای شما وجود ندارد.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>اقدام‌های شما</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {order.actions.map((action) => {
          if (action === 'pay') {
            return (
              <div key={action} className="space-y-2">
                <Button className="w-full" size="lg" loading={busy === 'pay'} onClick={() => void run('pay')}>
                  <Wallet />
                  پرداخت از کیف پول
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  loading={busy === 'gateway'}
                  onClick={() => void payWithGateway()}
                >
                  <CreditCard />
                  پرداخت با درگاه
                </Button>
              </div>
            );
          }

          if (action === 'complete') {
            return (
              <Button
                key={action}
                variant="success"
                className="w-full"
                size="lg"
                loading={busy === action}
                onClick={() => void run(action)}
              >
                <CheckCircle2 />
                {ORDER_ACTION_LABELS[action]}
              </Button>
            );
          }

          if (action === 'deliver') {
            return (
              <Button
                key={action}
                className="w-full"
                loading={busy === action}
                onClick={() => {
                  setText('');
                  setDialog('deliver');
                }}
              >
                <Truck />
                {ORDER_ACTION_LABELS[action]}
              </Button>
            );
          }

          if (action === 'dispute') {
            return (
              <Button
                key={action}
                variant="outline"
                className="w-full"
                onClick={() => {
                  setText('');
                  setDialog('dispute');
                }}
              >
                <Gavel />
                {ORDER_ACTION_LABELS[action]}
              </Button>
            );
          }

          if (action === 'cancel') {
            return (
              <Button
                key={action}
                variant="ghost"
                className="w-full text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setText('');
                  setDialog('cancel');
                }}
              >
                <XCircle />
                {ORDER_ACTION_LABELS[action]}
              </Button>
            );
          }

          return (
            <Button
              key={action}
              className="w-full"
              loading={busy === action}
              onClick={() => void run(action)}
              variant={action === 'accept' || action === 'start' ? 'default' : 'outline'}
            >
              <ArrowUpRight />
              {ORDER_ACTION_LABELS[action] ?? action}
            </Button>
          );
        })}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'deliver' ? 'ثبت تحویل کار' : dialog === 'dispute' ? 'ثبت اختلاف' : 'لغو سفارش'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'deliver'
                ? 'متن تحویل برای خریدار نمایش داده می‌شود؛ لینک یا توضیح فایل‌های نهایی را بنویسید.'
                : dialog === 'dispute'
                  ? 'اگر کار مطابق توافق نبود، دلیل آن را بنویسید تا کارشناسان بررسی کنند.'
                  : 'در صورت لغو، مبلغ امانت طبق قوانین به خریدار بازگردانده می‌شود.'}
            </DialogDescription>
          </DialogHeader>

          <Field
            label={dialog === 'deliver' ? 'متن تحویل' : 'دلیل'}
            required
            error={text.length > 0 && text.trim().length < 5 ? 'حداقل ۵ کاراکتر بنویسید.' : undefined}
          >
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder={dialog === 'deliver' ? 'فایل نهایی در پیام‌ها ارسال شد…' : 'دلیل خود را بنویسید…'}
            />
          </Field>

          <DialogFooter>
            <Button loading={busy === dialog} disabled={text.trim().length < 5} onClick={() => void runWithText()}>
              تأیید
            </Button>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ReviewCard({ orderId }: { orderId: string }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card>
        <CardContent className="pt-5">
          <Alert tone="success" title="نظر شما ثبت شد">
            ممنون از بازخوردتان؛ این امتیاز روی خدمت ارائه‌دهنده نمایش داده می‌شود.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const submit = async () => {
    setBusy(true);
    try {
      await request(`/orders/${orderId}/review`, {
        method: 'POST',
        body: { rating, comment: comment.trim() || undefined },
      });
      toast.success('نظر شما ثبت شد.');
      setDone(true);
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ثبت نظر ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ثبت نظر</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <RatingInput value={rating} onChange={setRating} />
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          placeholder="تجربه خود از این همکاری را بنویسید…"
        />
        <Button className="w-full" loading={busy} onClick={() => void submit()}>
          ثبت نظر
        </Button>
      </CardContent>
    </Card>
  );
}
