'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Clock,
  Flag,
  ImageOff,
  Package,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  Store,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { PageLoader, Spinner } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { RatingStars } from '@/components/rating-stars';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Avatar, AvatarFallback, initialsOf } from '@/components/ui/avatar';
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
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { faNumber, formatJalaliDate } from '@/lib/format';
import type { OrderDetail, Paginated, Review, ServiceDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function ServiceDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? '');
  const router = useRouter();
  const toast = useToast();
  const { user } = useSession();

  const service = useResource<ServiceDetail>(slug ? `/services/${encodeURIComponent(slug)}` : null);
  const reviews = useResource<Paginated<Review>>(
    service.data ? `/services/${service.data.id}/reviews?limit=10` : null,
  );

  const [activeImage, setActiveImage] = useState(0);
  const [orderOpen, setOrderOpen] = useState(false);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<ApiError | null>(null);

  useEffect(() => setActiveImage(0), [service.data?.id]);

  if (service.loading) return <PageLoader />;

  if (service.error || !service.data) {
    return (
      <EmptyState
        icon={Store}
        title="خدمت پیدا نشد"
        description={service.error?.message}
        action={
          <Button asChild variant="outline">
            <Link href="/services">بازگشت به فهرست خدمات</Link>
          </Button>
        }
      />
    );
  }

  const data = service.data;
  const images = data.images ?? [];

  const placeOrder = async () => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/services/${slug}`)}`);
      return;
    }
    setPlacing(true);
    setOrderError(null);
    try {
      // One key per submit attempt: a double click or a retry after a timeout
      // reuses it and the API returns the same order instead of creating two.
      const created = await request<OrderDetail>('/orders', {
        method: 'POST',
        body: { serviceId: data.id, note: note.trim() || undefined },
        idempotencyKey: newIdempotencyKey('order'),
      });
      toast.success(`سفارش با کد ${created.code} ثبت شد. برای پرداخت اقدام کنید.`);
      setOrderOpen(false);
      router.push(`/orders/${created.id}`);
    } catch (cause) {
      setOrderError(cause as ApiError);
      if (!(cause instanceof ApiError)) toast.error('ثبت سفارش ناموفق بود.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link href="/services" className="transition hover:text-primary">
          خدمات
        </Link>
        <span>/</span>
        <Link href={`/services?category=${data.category.slug}`} className="transition hover:text-primary">
          {data.category.titleFa}
        </Link>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="aspect-video w-full bg-muted">
              {images.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/v1/files/${images[activeImage]?.fileId ?? images[0].fileId}`}
                  alt={images[activeImage]?.alt ?? data.title}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <ImageOff className="size-10 text-muted-foreground/50" />
                </div>
              )}
            </div>
            {images.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto p-3 scrollbar-thin">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={cn(
                      'size-16 shrink-0 overflow-hidden rounded-lg border-2 transition',
                      index === activeImage ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/v1/files/${image.fileId}`} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{data.category.titleFa}</Badge>
                {data.status !== 'published' ? <StatusBadge kind="service" status={data.status} /> : null}
                {data.isOwner ? <Badge tone="warning">این خدمت شماست</Badge> : null}
              </div>

              <h1 className="text-xl font-bold leading-8">{data.title}</h1>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <RatingStars value={data.rating} count={data.ratingCount} />
                <span className="flex items-center gap-1">
                  <Package className="size-3.5" />
                  {faNumber(data.ordersCount)} سفارش
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  تحویل {faNumber(data.deliveryDays)} روزه
                </span>
                <span className="flex items-center gap-1">
                  <RefreshCw className="size-3.5" />
                  {data.revisions > 0 ? `${faNumber(data.revisions)} بار اصلاح` : 'بدون اصلاح'}
                </span>
              </div>

              <Separator />

              <div className="space-y-2">
                <h2 className="text-sm font-semibold">توضیحات</h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{data.description}</p>
              </div>

              {data.tags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Tag className="size-4 text-muted-foreground" />
                  {data.tags.map((tag) => (
                    <Link key={tag} href={`/services?q=${encodeURIComponent(tag)}`}>
                      <Badge tone="neutral" className="transition hover:border-primary/40">
                        {tag}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>نظر خریداران</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviews.loading && !reviews.data ? (
                <Spinner label="در حال بارگذاری نظرها…" />
              ) : reviews.data && reviews.data.items.length > 0 ? (
                reviews.data.items.map((review) => (
                  <div key={review.id} className="space-y-2 rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">
                            {initialsOf(review.author.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{review.author.displayName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatJalaliDate(review.createdAt)}
                          </p>
                        </div>
                      </div>
                      <RatingStars value={review.rating} />
                    </div>
                    {review.comment ? (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.comment}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={Package}
                  title="هنوز نظری ثبت نشده است"
                  description="اولین نظر را بعد از تکمیل سفارش ثبت کنید."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">قیمت این خدمت</p>
                <Money value={data.price} className="text-2xl font-bold" />
              </div>

              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
                <p className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-success" />
                  مبلغ تا تأیید نهایی در امانت می‌ماند.
                </p>
                <p className="flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  زمان تحویل اعلام‌شده: {faNumber(data.deliveryDays)} روز
                </p>
              </div>

              {data.isOwner ? (
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/provider/services/${data.id}`}>
                    <PencilLine />
                    ویرایش این خدمت
                  </Link>
                </Button>
              ) : data.status === 'published' ? (
                <>
                  <Button className="w-full" size="lg" onClick={() => setOrderOpen(true)}>
                    ثبت سفارش
                  </Button>
                  {!user ? (
                    <p className="text-center text-xs text-muted-foreground">
                      برای ثبت سفارش ابتدا وارد حساب خود شوید.
                    </p>
                  ) : null}
                </>
              ) : (
                <Alert tone="warning">این خدمت در حال حاضر قابل سفارش نیست.</Alert>
              )}

              <ReportDialog serviceId={data.id} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm font-medium">درباره ارائه‌دهنده</p>
              <Link
                href={`/providers/${data.provider.username}`}
                className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:border-primary/40"
              >
                <Avatar>
                  <AvatarFallback>{initialsOf(data.provider.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{data.provider.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">@{data.provider.username}</p>
                </div>
              </Link>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <RatingStars value={data.provider.rating} count={data.provider.ratingCount} />
                <span>{faNumber(data.provider.completedOrdersCount)} سفارش تکمیل‌شده</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ثبت سفارش</DialogTitle>
            <DialogDescription>
              مبلغ <Money value={data.price} className="font-semibold text-foreground" /> پس از ثبت سفارش، هنگام پرداخت
              از کیف پول شما کسر و در امانت نگهداری می‌شود.
            </DialogDescription>
          </DialogHeader>

          <Field label="توضیحات سفارش" hint="هرچه دقیق‌تر بنویسید، نتیجه بهتر می‌شود.">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="مثلاً: لوگو برای یک کسب‌وکار صنایع دستی، سبک مینیمال و مدرن…"
            />
          </Field>

          {orderError ? <Alert tone="danger">{orderError.message}</Alert> : null}

          <DialogFooter>
            <Button onClick={() => void placeOrder()} loading={placing}>
              ثبت سفارش و ادامه پرداخت
            </Button>
            <Button variant="ghost" onClick={() => setOrderOpen(false)}>
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Lets a signed-in user flag a service for the moderation queue. */
function ReportDialog({ serviceId }: { serviceId: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await request('/reports', {
        method: 'POST',
        body: { targetType: 'service', targetId: serviceId, reason: reason.trim() },
      });
      toast.success('گزارش شما ثبت شد و توسط مدیران بررسی می‌شود.');
      setOpen(false);
      setReason('');
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ثبت گزارش ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition hover:text-destructive"
      >
        <Flag className="size-3.5" />
        گزارش تخلف
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>گزارش تخلف</DialogTitle>
          <DialogDescription>اگر این خدمت مشکل دارد به ما بگویید تا بررسی کنیم.</DialogDescription>
        </DialogHeader>
        <Field label="دلیل گزارش" required>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="مثلاً: عنوان گمراه‌کننده است…"
          />
        </Field>
        <DialogFooter>
          <Button
            variant="destructive"
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={() => void submit()}
          >
            ارسال گزارش
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
