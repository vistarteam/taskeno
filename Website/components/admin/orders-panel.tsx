'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Gavel, Package, Scale } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResource, request } from '@/lib/hooks';
import { ApiError, toTomanInputRial } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatJalaliDateTime } from '@/lib/format';
import type { AdminDispute, AdminOrderListItem } from '@/lib/types';

export function OrdersPanel() {
  const orders = useResource<AdminOrderListItem[]>('/admin/orders?limit=100');

  if (orders.loading && !orders.data) return <Spinner label="در حال بارگذاری سفارش‌ها…" />;
  const items = orders.data ?? [];
  if (items.length === 0) return <EmptyState icon={Package} title="سفارشی ثبت نشده است" />;

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>کد</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead>مبلغ</TableHead>
              <TableHead>کمیسیون</TableHead>
              <TableHead>خریدار / ارائه‌دهنده</TableHead>
              <TableHead>تاریخ</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="tabular" dir="ltr">
                  {order.code}
                </TableCell>
                <TableCell className="space-x-1 space-x-reverse">
                  <StatusBadge kind="order" status={order.status} />
                </TableCell>
                <TableCell>
                  <Money value={order.total} />
                </TableCell>
                <TableCell>
                  <Money value={order.commissionAmount} muted />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <span dir="ltr">{order.buyerUsername ?? '—'}</span>
                  <br />
                  <span dir="ltr">{order.providerUsername ?? '—'}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatJalaliDateTime(order.createdAt)}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/orders/${order.id}`} target="_blank">
                      <ExternalLink />
                      مشاهده
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function DisputesPanel() {
  const disputes = useResource<AdminDispute[]>('/admin/disputes');
  const [selected, setSelected] = useState<AdminDispute | null>(null);

  if (disputes.loading && !disputes.data) return <Spinner label="در حال بارگذاری اختلاف‌ها…" />;
  const items = disputes.data ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="اختلاف بازی وجود ندارد"
        description="وقتی خریدار یا ارائه‌دهنده اختلافی ثبت کند، اینجا برای بررسی نمایش داده می‌شود."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((dispute) => (
        <Card key={dispute.id} className={dispute.status === 'open' ? 'border-warning/40' : undefined}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline" className="tabular" dir="ltr">
                  {dispute.orderCode}
                </Badge>
                <StatusBadge kind="dispute" status={dispute.status} />
              </div>
              <p className="text-sm">{dispute.reason}</p>
              {dispute.description ? (
                <p className="text-xs leading-5 text-muted-foreground">{dispute.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">ثبت‌شده در {formatJalaliDateTime(dispute.createdAt)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Money value={dispute.total} className="font-semibold" />
              <Button asChild size="sm" variant="ghost">
                <Link href={`/orders/${dispute.orderId}`} target="_blank">
                  <ExternalLink />
                  سفارش
                </Link>
              </Button>
              <Button size="sm" disabled={dispute.status !== 'open'} onClick={() => setSelected(dispute)}>
                <Gavel />
                صدور رأی
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {selected ? <ResolveDialog dispute={selected} onClose={() => setSelected(null)} onDone={() => disputes.reload()} /> : null}
    </div>
  );
}

function ResolveDialog({
  dispute,
  onClose,
  onDone,
}: {
  dispute: AdminDispute;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [decision, setDecision] = useState<'release_to_provider' | 'refund_buyer' | 'partial_refund'>('release_to_provider');
  const [note, setNote] = useState('');
  const [partial, setPartial] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const partialAmountRial =
        decision === 'partial_refund' ? toTomanInputRial(partial) ?? undefined : undefined;
      await request(`/admin/orders/${dispute.orderId}/resolve`, {
        method: 'POST',
        body: { decision, note: note.trim(), partialAmountRial },
      });
      toast.success('رأی ثبت شد و وجه طبق تصمیم شما آزاد/بازگردانده شد.');
      onClose();
      onDone();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ثبت رأی ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>صدور رأی برای سفارش {dispute.orderCode}</DialogTitle>
          <DialogDescription>
            مبلغ کل سفارش <Money value={dispute.total} className="font-semibold text-foreground" /> در امانت است. تصمیم
            شما همان لحظه اعمال و در دفتر مالی ثبت می‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="تصمیم" required>
            <Select value={decision} onValueChange={(value) => setDecision(value as typeof decision)}>
              <SelectTrigger aria-label="تصمیم">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="release_to_provider">آزادسازی کامل به نفع ارائه‌دهنده</SelectItem>
                <SelectItem value="refund_buyer">بازگشت کامل وجه به خریدار</SelectItem>
                <SelectItem value="partial_refund">بازگشت بخشی از وجه</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {decision === 'partial_refund' ? (
            <Field label="مبلغ بازگشتی (تومان)" required hint="این مبلغ به خریدار برمی‌گردد و باقی به ارائه‌دهنده می‌رسد.">
              <Input value={partial} onChange={(event) => setPartial(event.target.value)} inputMode="numeric" />
            </Field>
          ) : null}

          <Field label="یادداشت رأی" required hint="این متن در تاریخچه سفارش و برای هر دو طرف نمایش داده می‌شود.">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </Field>
        </div>

        <DialogFooter>
          <Button
            loading={busy}
            disabled={note.trim().length < 5 || (decision === 'partial_refund' && !partial.trim())}
            onClick={() => void submit()}
          >
            ثبت رأی
          </Button>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
