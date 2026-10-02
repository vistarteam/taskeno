import Link from 'next/link';
import { Clock, ImageOff, Package } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/money';
import { RatingStars } from '@/components/rating-stars';
import { StatusBadge } from '@/components/status-badge';
import { faNumber } from '@/lib/format';
import type { ServiceCard as ServiceCardModel } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * A service as it appears in any list. `showStatus` is used by the provider
 * dashboard, where the moderation state matters more than the price.
 */
export function ServiceCard({
  service,
  showStatus = false,
  className,
}: {
  service: ServiceCardModel;
  showStatus?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn('group overflow-hidden transition hover:border-primary/40 hover:shadow-md', className)}>
      <Link href={`/services/${encodeURIComponent(service.slug)}`} className="block">
        <div className="relative h-40 w-full overflow-hidden bg-muted">
          {service.imageFileId ? (
            // The API serves uploads at /files/:id with long-lived cache headers.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/files/${service.imageFileId}`}
              alt={service.title}
              className="size-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-linear-to-br from-primary/10 to-accent">
              <ImageOff className="size-8 text-muted-foreground/60" />
            </div>
          )}
          {showStatus ? (
            <span className="absolute right-3 top-3">
              <StatusBadge kind="service" status={service.status} className="bg-card/95 backdrop-blur" />
            </span>
          ) : null}
        </div>
      </Link>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/services/${encodeURIComponent(service.slug)}`}
            className="line-clamp-2 text-sm font-semibold leading-6 transition hover:text-primary"
          >
            {service.title}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-0.5">{service.category.titleFa}</span>
          {service.provider?.username ? (
            <Link href={`/providers/${service.provider.username}`} className="transition hover:text-primary">
              {service.provider.displayName}
            </Link>
          ) : null}
        </div>

        <RatingStars value={service.rating} count={service.ratingCount} />

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-col gap-0.5">
            <Money value={service.price} className="text-sm font-semibold" />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              {faNumber(service.deliveryDays)} روز تحویل
            </span>
          </div>
          {service.ordersCount > 0 ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Package className="size-3.5" />
              {faNumber(service.ordersCount)} سفارش
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** Card-shaped placeholder shown while a list loads. */
export function ServiceCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="h-40 w-full animate-pulse bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </Card>
  );
}
