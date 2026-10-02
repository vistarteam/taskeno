'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Info,
  Receipt,
  Send,
  ShieldCheck,
  Wallet as WalletIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLoader, Spinner } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { WALLET_KIND_LABELS } from '@/components/status-badge';
import { LoadMore } from '@/components/load-more';
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
import { ApiError, newIdempotencyKey, qs, toTomanInputRial } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { rialToTomanInput, formatJalaliDateTime, faNumber } from '@/lib/format';
import type { Paginated, PaymentIntent, WalletSummary, WalletTransaction } from '@/lib/types';
import { cn } from '@/lib/utils';

const KINDS = [
  { value: 'all', label: 'همه تراکنش‌ها' },
  { value: 'deposit', label: 'شارژ' },
  { value: 'order_payment', label: 'پرداخت سفارش' },
  { value: 'escrow_release', label: 'آزادسازی امانت' },
  { value: 'commission', label: 'کمیسیون' },
  { value: 'refund', label: 'بازگشت وجه' },
  { value: 'transfer', label: 'انتقال' },
  { value: 'adjustment', label: 'اصلاح' },
];

export default function WalletPage() {
  return (
    <AuthGuard>
      <WalletView />
    </AuthGuard>
  );
}

function WalletView() {
  const summary = useResource<WalletSummary>('/wallet/summary');
  const [kind, setKind] = useState('all');

  const path = `/wallet/transactions${qs({ kind: kind === 'all' ? undefined : kind, limit: 15 })}`;
  const first = useResource<Paginated<WalletTransaction>>(path);

  const [items, setItems] = useState<WalletTransaction[]>([]);
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
      const page = await request<Paginated<WalletTransaction>>(`${path}&cursor=${encodeURIComponent(cursor)}`);
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  if (summary.loading && !summary.data) return <PageLoader label="در حال بارگذاری کیف پول…" />;

  const wallet = summary.data;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">کیف پول</h1>
        <p className="text-sm text-muted-foreground">
          مبالغ به ریال نگهداری و به تومان نمایش داده می‌شوند. هر تراکنش در دفتر مالی دوطرفه ثبت می‌شود.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="bg-linear-to-bl from-primary/15 to-card p-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <WalletIcon className="size-4" />
              موجودی قابل استفاده
            </p>
            <p className="mt-2 text-3xl font-bold">
              <Money value={wallet?.balance ?? '0'} />
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={wallet?.ledgerConsistent ? 'success' : 'danger'}>
                <ShieldCheck className="size-3.5" />
                {wallet?.ledgerConsistent ? 'دفتر مالی تراز است' : 'مغایرت در دفتر مالی'}
              </Badge>
              <Badge tone="outline">
                سقف انتقال روزانه: <Money value={wallet?.dailyTransferLimit ?? '0'} compact />
              </Badge>
            </div>
          </div>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <DepositDialog onDone={() => summary.reload()} />
            <TransferDialog wallet={wallet} onDone={() => summary.reload()} />
            {wallet && !wallet.withdrawalsEnabled ? (
              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                برداشت نقدی در این محیط غیرفعال است؛ مبالغ فقط برای سفارش و انتقال داخلی استفاده می‌شوند.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>تراکنش‌ها</CardTitle>
          <div className="w-48">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger aria-label="نوع تراکنش">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {first.loading && items.length === 0 ? (
            <Spinner label="در حال بارگذاری تراکنش‌ها…" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="هنوز تراکنشی ثبت نشده است"
              description="با شارژ کیف پول یا پرداخت سفارش، تراکنش‌ها اینجا نمایش داده می‌شوند."
            />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {items.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-3 py-3">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        tx.direction === 'credit' ? 'bg-success/12 text-success' : 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {tx.direction === 'credit' ? (
                        <ArrowDownLeft className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{WALLET_KIND_LABELS[tx.kind] ?? tx.kind}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tx.memo ?? '—'} · {formatJalaliDateTime(tx.createdAt)}
                      </p>
                    </div>
                    <div className="text-left">
                      <Money
                        value={tx.direction === 'credit' ? tx.amount : `-${tx.amount}`}
                        signed
                        className={cn('text-sm font-semibold', tx.direction === 'credit' ? 'text-success' : 'text-destructive')}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        مانده: <Money value={tx.balanceAfter} compact muted />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <LoadMore hasMore={Boolean(cursor)} loading={loadingMore} onLoadMore={loadMore} count={items.length} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Creates a payment intent and hands the browser to the gateway page. */
function DepositDialog({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const rial = toTomanInputRial(amount);
    if (!rial) {
      setError('مبلغ را به تومان و با عدد وارد کنید.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const intent = await request<PaymentIntent>('/wallet/deposits', {
        method: 'POST',
        body: { amountRial: rial },
        idempotencyKey: newIdempotencyKey('deposit'),
      });
      onDone();
      // The gateway is served by this same website, so the session cookie and
      // the rewrites keep working with no cross-origin step.
      window.location.href = intent.redirectUrl;
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'ایجاد پرداخت ناموفق بود.';
      setError(message);
      toast.error(message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="w-full" size="lg" onClick={() => setOpen(true)}>
        <CreditCard />
        افزایش موجودی
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>شارژ کیف پول</DialogTitle>
          <DialogDescription>
            مبلغ را به تومان وارد کنید. در این محیط، درگاه آزمایشی تسکنو پرداخت را شبیه‌سازی می‌کند.
          </DialogDescription>
        </DialogHeader>

        <Field label="مبلغ (تومان)" required error={error ?? undefined} hint="حداقل ۱٬۰۰۰ تومان و حداکثر ۵۰٬۰۰۰٬۰۰۰ تومان.">
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
            placeholder="۵۰۰٬۰۰۰"
          />
        </Field>

        <DialogFooter>
          <Button loading={busy} onClick={() => void submit()}>
            انتقال به درگاه
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ wallet, onDone }: { wallet: WalletSummary | undefined; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = wallet?.transfersEnabled === false;

  const submit = async () => {
    const rial = toTomanInputRial(amount);
    if (!rial) {
      setError('مبلغ را به تومان و با عدد وارد کنید.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await request('/wallet/transfers', {
        method: 'POST',
        body: { toUsername: username.trim().replace(/^@/, ''), amountRial: rial, note: note.trim() || undefined },
        idempotencyKey: newIdempotencyKey('transfer'),
      });
      toast.success('انتقال با موفقیت انجام شد.');
      setOpen(false);
      setAmount('');
      setNote('');
      onDone();
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'انتقال ناموفق بود.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" className="w-full" size="lg" disabled={disabled} onClick={() => setOpen(true)}>
        <Send />
        انتقال به کاربر دیگر
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>انتقال اعتبار</DialogTitle>
          <DialogDescription>
            مبلغ از کیف پول شما کسر و به کیف پول کاربر مقصد اضافه می‌شود. این عملیات قابل بازگشت نیست.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="نام کاربری مقصد" required htmlFor="to-username">
            <Input
              id="to-username"
              dir="ltr"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
            />
          </Field>

          <Field
            label="مبلغ (تومان)"
            required
            error={error ?? undefined}
            hint={
              wallet
                ? `سقف روزانه: ${faNumber(Number(wallet.dailyTransferLimit) / 10)} تومان · استفاده‌شده امروز: ${faNumber(
                    Number(wallet.dailyTransferUsed) / 10,
                  )} تومان`
                : undefined
            }
          >
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              placeholder="۵۰٬۰۰۰"
            />
          </Field>

          <Field label="یادداشت (اختیاری)">
            <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
          </Field>

          <Separator />

          <p className="text-xs leading-5 text-muted-foreground">
            موجودی فعلی شما: <Money value={wallet?.balance ?? '0'} muted />
          </p>
        </div>

        <DialogFooter>
          <Button loading={busy} disabled={!username.trim() || !amount.trim()} onClick={() => void submit()}>
            تأیید و انتقال
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
