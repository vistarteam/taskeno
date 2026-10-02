'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/skeleton';
import { AuthGuard } from '@/components/auth-guard';

/**
 * Where the API's payment callback sends the browser.
 *
 * The API knows the outcome before the user does; the query string carries it
 * (`status`, `paymentId`, and for order payments `orderId` and `code`).
 */
export default function PaymentResultPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<PageLoader label="در حال بررسی نتیجه پرداخت…" />}>
        <Result />
      </Suspense>
    </AuthGuard>
  );
}

function Result() {
  const params = useSearchParams();
  const status = params.get('status') ?? 'failed';
  const paymentId = params.get('paymentId');
  const orderId = params.get('orderId');
  const code = params.get('code');
  const success = status === 'success';

  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <Card>
        <CardContent className="space-y-4 pt-8 text-center">
          <span
            className={
              success
                ? 'mx-auto flex size-14 items-center justify-center rounded-full bg-success/12 text-success'
                : 'mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive'
            }
          >
            {success ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}
          </span>

          <div className="space-y-1">
            <h1 className="text-lg font-bold">
              {success ? 'پرداخت با موفقیت انجام شد' : 'پرداخت انجام نشد'}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {success
                ? orderId
                  ? 'مبلغ سفارش شما در امانت تسکنو نگهداری می‌شود و پس از تحویل کار آزاد خواهد شد.'
                  : 'موجودی کیف پول شما به‌روزرسانی شد.'
                : 'اگر مبلغی از حساب شما کسر شده باشد، به‌صورت خودکار بازگردانده می‌شود. می‌توانید دوباره تلاش کنید.'}
            </p>
          </div>

          {code || paymentId ? (
            <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {code ? (
                <p className="tabular" dir="ltr">
                  کد سفارش: {code}
                </p>
              ) : null}
              {paymentId ? (
                <p className="tabular break-all" dir="ltr">
                  شناسه پرداخت: {paymentId}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            {orderId ? (
              <Button asChild className="flex-1">
                <Link href={`/orders/${orderId}`}>مشاهده سفارش</Link>
              </Button>
            ) : (
              <Button asChild className="flex-1">
                <Link href="/wallet">مشاهده کیف پول</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="flex-1">
              <Link href={orderId ? '/orders' : '/services'}>{orderId ? 'همه سفارش‌ها' : 'مرور خدمات'}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
