'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, MapPin, Package, Store } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, initialsOf } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { RatingStars } from '@/components/rating-stars';
import { Money } from '@/components/money';
import { useResource } from '@/lib/hooks';
import { faNumber, formatJalaliDate } from '@/lib/format';
import type { ProviderProfile } from '@/lib/types';

export default function ProviderProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username ?? '');
  const { data, loading, error } = useResource<ProviderProfile>(
    username ? `/providers/${encodeURIComponent(username)}` : null,
  );

  if (loading) return <PageLoader />;

  if (error || !data) {
    return (
      <EmptyState
        icon={Store}
        title="ارائه‌دهنده پیدا نشد"
        description="ممکن است نام کاربری تغییر کرده باشد."
        action={
          <Link href="/services" className="text-sm text-primary hover:underline">
            مرور خدمات
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-5 pt-5 sm:flex-row sm:items-center">
          <Avatar className="size-16">
            <AvatarFallback className="text-xl">{initialsOf(data.displayName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold">{data.displayName}</h1>
              <Badge tone="primary">@{data.username}</Badge>
              {data.isProvider ? <Badge tone="success">ارائه‌دهنده تأییدشده</Badge> : null}
            </div>
            {data.bio ? <p className="text-sm leading-6 text-muted-foreground">{data.bio}</p> : null}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <RatingStars value={data.rating} count={data.ratingCount} />
              <span className="flex items-center gap-1">
                <Package className="size-3.5" />
                {faNumber(data.completedOrdersCount)} سفارش تکمیل‌شده
              </span>
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                عضو از {formatJalaliDate(data.memberSince)}
              </span>
              {data.city || data.province ? (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {[data.province, data.city].filter(Boolean).join('، ')}
                </span>
              ) : null}
            </div>
            {data.skills && data.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.skills.map((skill) => (
                  <Badge key={skill} tone="neutral">
                    {skill}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">خدمات این ارائه‌دهنده</h2>
        {data.services.length === 0 ? (
          <EmptyState icon={Store} title="هنوز خدمتی منتشر نشده است" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.services.map((service) => (
              <Card key={service.id} className="overflow-hidden">
                <Link href={`/services/${encodeURIComponent(service.slug)}`} className="block">
                  <div className="h-32 w-full bg-muted">
                    {service.imageFileId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/v1/files/${service.imageFileId}`}
                        alt={service.title}
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <CardContent className="space-y-2 pt-4">
                    <p className="line-clamp-2 text-sm font-medium">{service.title}</p>
                    <RatingStars value={service.rating} count={service.ratingCount} />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <Money value={service.price} className="text-sm font-semibold text-foreground" />
                      <span>{faNumber(service.deliveryDays)} روز</span>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
