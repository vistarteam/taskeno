'use client';

import { useState } from 'react';
import { Ban, CircleDollarSign, Search, ShieldCheck, UserCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import type { AdminUserListItem, AdminUserWallet } from '@/lib/types';

export function UsersPanel() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const users = useResource<AdminUserListItem[]>(`/admin/users?limit=50${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  const [selected, setSelected] = useState<AdminUserListItem | null>(null);

  const items = users.data ?? [];

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(term.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="جست‌وجو با ایمیل یا نام کاربری…"
            className="pr-9"
            aria-label="جست‌وجوی کاربر"
          />
        </div>
        <Button type="submit" variant="outline">
          جست‌وجو
        </Button>
      </form>

      {users.loading && items.length === 0 ? (
        <Spinner label="در حال بارگذاری کاربران…" />
      ) : items.length === 0 ? (
        <EmptyState icon={Search} title="کاربری پیدا نشد" />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کاربر</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>نقش</TableHead>
                  <TableHead>عضویت</TableHead>
                  <TableHead>امتیاز</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-medium">{user.displayName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {user.email}
                      </p>
                      {user.username ? (
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          @{user.username}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="user" status={user.status} />
                    </TableCell>
                    <TableCell>
                      <Badge tone={user.isProvider ? 'primary' : 'neutral'}>
                        {user.isProvider ? 'ارائه‌دهنده' : 'کاربر'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatJalaliDateTime(user.createdAt)}
                    </TableCell>
                    <TableCell className="tabular text-xs">
                      {user.ratingCount > 0 ? `${user.rating} (${user.ratingCount})` : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSelected(user)}>
                          <CircleDollarSign />
                          کیف پول
                        </Button>
                        {user.status === 'suspended' ? (
                          <Button
                            size="sm"
                            variant="success"
                            onClick={async () => {
                              await request(`/admin/users/${user.id}/activate`, { method: 'POST', body: {} });
                              users.reload();
                            }}
                          >
                            <UserCheck />
                            فعال‌سازی
                          </Button>
                        ) : (
                          <SuspendButton user={user} onDone={() => users.reload()} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selected ? <WalletDialog user={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function SuspendButton({ user, onDone }: { user: AdminUserListItem; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await request(`/admin/users/${user.id}/suspend`, { method: 'POST', body: { reason: reason.trim() } });
      toast.success('حساب کاربر معلق شد.');
      setOpen(false);
      onDone();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
        <Ban />
        تعلیق
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعلیق حساب {user.displayName ?? user.email}</DialogTitle>
          <DialogDescription>
            کاربر معلق نمی‌تواند سفارش جدید ثبت کند یا سفارش بگیرد؛ دلیل در گزارش‌های سیستمی ثبت می‌شود.
          </DialogDescription>
        </DialogHeader>
        <Field label="دلیل تعلیق" required error={reason && reason.trim().length < 3 ? 'حداقل ۳ کاراکتر بنویسید.' : undefined}>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="مثلاً: تخلف مالی" />
        </Field>
        <DialogFooter>
          <Button variant="destructive" loading={busy} disabled={reason.trim().length < 3} onClick={() => void submit()}>
            تعلیق حساب
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WalletDialog({ user, onClose }: { user: AdminUserListItem; onClose: () => void }) {
  const toast = useToast();
  const wallet = useResource<AdminUserWallet>(`/admin/users/${user.id}/wallet`);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const rial = toTomanInputRial(amount);
    if (!rial) {
      toast.error('مبلغ را به تومان و با عدد وارد کنید.');
      return;
    }
    setBusy(true);
    try {
      await request('/admin/wallet/adjustments', {
        method: 'POST',
        body: { userId: user.id, amountRial: rial, reason: reason.trim() },
      });
      toast.success('اصلاح موجودی ثبت شد.');
      setAmount('');
      setReason('');
      wallet.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ثبت اصلاح ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>کیف پول {user.displayName ?? user.email}</DialogTitle>
          <DialogDescription>
            موجودی ثبت‌شده در برابر مجموع ثبت‌های دفتر مالی بررسی می‌شود.
          </DialogDescription>
        </DialogHeader>

        {wallet.loading && !wallet.data ? (
          <Spinner label="در حال بارگذاری…" />
        ) : wallet.data ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p>
              موجودی: <Money value={wallet.data.balance} className="font-semibold" />
            </p>
            <p className="text-muted-foreground">
              جمع دفتر مالی: <Money value={wallet.data.ledgerBalance} muted />
            </p>
            <Badge tone={wallet.data.consistent ? 'success' : 'danger'}>
              <ShieldCheck className="size-3.5" />
              {wallet.data.consistent ? 'تطابق دارد' : 'مغایرت دارد'}
            </Badge>
          </div>
        ) : (
          <Alert tone="warning">اطلاعات کیف پول در دسترس نیست.</Alert>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">اصلاح دستی موجودی</p>
          <Field label="مبلغ (تومان)" hint="مثبت = افزایش موجودی، منفی = کاهش (مثلاً ‎-50,000)">
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="۱۰۰٬۰۰۰" />
          </Field>
          <Field label="دلیل" required>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثلاً: جبران خطای پرداخت"
            />
          </Field>
          <Button loading={busy} disabled={!amount.trim() || reason.trim().length < 5} onClick={() => void submit()}>
            ثبت اصلاح
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
