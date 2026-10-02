'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResource, request } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatJalaliDateTime } from '@/lib/format';
import type { ModerationQueueItem } from '@/lib/types';

/**
 * Services waiting for review. Approving publishes them; rejecting sends the
 * reason back to the provider.
 */
export function ModerationPanel() {
  const { data, loading, reload } = useResource<ModerationQueueItem[]>('/admin/services/moderation');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ModerationQueueItem | null>(null);
  const [reason, setReason] = useState('');

  const decide = async (service: ModerationQueueItem, decision: 'approve' | 'reject', note?: string) => {
    setBusy(service.id);
    try {
      await request(`/admin/services/${service.id}/moderate`, {
        method: 'POST',
        body: { decision, reason: note },
      });
      toast.success(decision === 'approve' ? 'خدمت تأیید و منتشر شد.' : 'خدمت رد شد و به ارائه‌دهنده اطلاع داده شد.');
      setRejecting(null);
      setReason('');
      reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <Spinner label="در حال بارگذاری صف بازبینی…" />;

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="صف بازبینی خالی است"
        description="خدمتی در انتظار تأیید نیست. با ارسال خدمت جدید توسط ارائه‌دهنده، اینجا نمایش داده می‌شود."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((service) => (
        <Card key={service.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{service.title}</p>
              <p className="text-xs text-muted-foreground">
                ارائه‌دهنده: {service.providerDisplayName ?? '—'}
                {service.providerUsername ? ` (@${service.providerUsername})` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                ارسال‌شده در {formatJalaliDateTime(service.createdAt)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Money value={service.price} className="font-semibold" />
              <Badge tone="warning">در انتظار بازبینی</Badge>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/services/${encodeURIComponent(service.slug)}`} target="_blank">
                  <ExternalLink />
                  پیش‌نمایش
                </Link>
              </Button>
              <Button
                size="sm"
                variant="success"
                loading={busy === service.id}
                onClick={() => void decide(service, 'approve')}
              >
                <CheckCircle2 />
                تأیید و انتشار
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRejecting(service)}>
                <XCircle />
                رد
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رد خدمت</DialogTitle>
            <DialogDescription>
              دلیل رد برای ارائه‌دهنده ارسال می‌شود تا اصلاح کند. متن روشن و قابل اقدام بنویسید.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثلاً: توضیحات کافی نیست یا تصویر نامرتبط است"
            aria-label="دلیل رد"
          />
          <DialogFooter>
            <Button
              variant="destructive"
              loading={busy === rejecting?.id}
              disabled={reason.trim().length < 3}
              onClick={() => rejecting && void decide(rejecting, 'reject', reason.trim())}
            >
              رد خدمت
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
