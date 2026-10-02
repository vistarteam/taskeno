'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CreditCard, ShieldCheck, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/skeleton';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { useResource, request } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { SandboxPayment } from '@/lib/types';

const PURPOSE_LABELS: Record<string, string> = {
  deposit: 'شارژ کیف پول',
  order_payment: 'پرداخت سفارش',
};

/**
 * The development gateway.
 *
 * It stands in for a real PSP: the API's deposit endpoint points here, and the
 * page asks the API what it is paying for, then settles or fails it. Settling
 * returns the API callback path, which the API answers with a 302 to
 * `/pay/result` — the same shape a real gateway callback would have.
 */
export default function SandboxGatewayPage() {
  const params = useParams<{ authority: string }>();
  const authority = params.authority ?? '';
  const router = useRouter();
  const toast = useToast();

  const payment = useResource<SandboxPayment>(
    authority ? `/payments/sandbox/${encodeURIComponent(authority)}` : null,
  );
  const [busy, setBusy] = useState<'success' | 'failed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settle = async (outcome: 'success' | 'failed') => {
    setBusy(outcome);
    setError(null);
    try {
      const result = await request<{ ok: boolean; redirectTo: string }>(
        `/payments/sandbox/${encodeURIComponent(authority)}/complete`,
        { method: 'POST', body: { outcome } },
      );
      // `redirectTo` is the API callback path; the API answers it with a 302 to
      // the website result page, so a full navigation is the honest simulation.
      window.location.href = result.redirectTo;
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'پردازش پرداخت ناموفق بود.';
      setError(message);
      toast.error(message);
      setBusy(null);
    }
  };

  if (payment.loading) return <PageLoader label="در حال دریافت اطلاعات پرداخت…" />;

  if (payment.error || !payment.data) {
    return (
      <div className="mx-auto max-w-md py-10">
        <Alert tone="danger" title="پرداخت پیدا نشد">
          {payment.error?.message ?? 'این پرداخت معتبر نیست یا منقضی شده است.'}
        </Alert>
        <Button variant="outline" className="mt-4 w-full" onClick={() => router.push('/wallet')}>
          بازگشت به کیف پول
        </Button>
      </div>
    );
  }

  const data = payment.data;
  const alreadySettled = data.status !== 'pending';

  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" />
            درگاه آزمایشی تسکنو
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
            <p className="text-xs text-muted-foreground">مبلغ قابل پرداخت</p>
            <p className="mt-1 text-2xl font-bold">
              <Money value={data.amount} />
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge tone="outline">{PURPOSE_LABELS[data.purpose] ?? data.purpose}</Badge>
              <StatusBadge kind="payment" status={data.status} />
            </div>
          </div>

          <p className="text-xs leading-6 text-muted-foreground">
            این درگاه فقط برای محیط توسعه است و هیچ پول واقعی جابه‌جا نمی‌شود. با تأیید، پرداخت در سیستم تسویه
            می‌شود و موجودی کیف پول (یا وضعیت سفارش) به‌روزرسانی می‌گردد.
          </p>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          {alreadySettled ? (
            <Alert tone="info" title="این پرداخت قبلاً پردازش شده است">
              وضعیت فعلی: <StatusBadge kind="payment" status={data.status} />
            </Alert>
          ) : (
            <div className="space-y-2">
              <Button className="w-full" size="lg" loading={busy === 'success'} onClick={() => void settle('success')}>
                <ShieldCheck />
                پرداخت موفق
              </Button>
              <Button
                variant="outline"
                className="w-full text-destructive"
                loading={busy === 'failed'}
                onClick={() => void settle('failed')}
              >
                <XCircle />
                انصراف از پرداخت
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
