'use client';

import { Fragment, useState } from 'react';
import { BookOpen, ChevronDown, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResource } from '@/lib/hooks';
import { formatJalaliDateTime } from '@/lib/format';
import type { LedgerHealth, LedgerJournal, PlatformWallet } from '@/lib/types';
import { cn } from '@/lib/utils';

export function LedgerPanel() {
  const health = useResource<LedgerHealth>('/admin/ledger/health');
  const wallets = useResource<PlatformWallet[]>('/admin/ledger/wallets');
  const journals = useResource<LedgerJournal[]>('/admin/ledger/journals?limit=25');
  const [openJournal, setOpenJournal] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className={cn('size-4', health.data?.balanced ? 'text-success' : 'text-destructive')} />
              سلامت دفتر مالی
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {health.loading && !health.data ? (
              <Spinner />
            ) : health.data ? (
              <>
                <Badge tone={health.data.balanced ? 'success' : 'danger'}>
                  {health.data.balanced ? 'تراز است' : 'نامتوازن'}
                </Badge>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>
                    جمع بدهکار: <Money value={health.data.debit} muted />
                  </p>
                  <p>
                    جمع بستانکار: <Money value={health.data.credit} muted />
                  </p>
                  <p>کیف پول‌های بررسی‌شده: {health.data.checkedWallets}</p>
                  <p>مغایرت‌ها: {health.data.mismatches.length}</p>
                </div>
                {health.data.mismatches.length > 0 ? (
                  <Alert tone="danger" title="مغایرت موجودی">
                    موجودی کش‌شده برخی کیف پول‌ها با ثبت‌های دفتر مالی هم‌خوان نیست.
                  </Alert>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    هر رویداد مالی دوطرفه ثبت می‌شود؛ مجموع موجودی همه کیف پول‌ها همیشه صفر است.
                  </p>
                )}
              </>
            ) : (
              <Alert tone="warning">اطلاعات دفتر مالی در دسترس نیست.</Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>کیف پول‌های سیستمی</CardTitle>
          </CardHeader>
          <CardContent>
            {wallets.loading && !wallets.data ? (
              <Spinner />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {(wallets.data ?? []).map((wallet) => (
                  <li key={wallet.code} className="flex items-center justify-between py-2">
                    <span className="tabular text-xs text-muted-foreground" dir="ltr">
                      {wallet.code}
                    </span>
                    <Money value={wallet.balance} className="font-medium" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" />
            آخرین ثبت‌های دفتر مالی
          </CardTitle>
        </CardHeader>
        <CardContent>
          {journals.loading && !journals.data ? (
            <Spinner label="در حال بارگذاری…" />
          ) : (journals.data ?? []).length === 0 ? (
            <EmptyState icon={BookOpen} title="ثبتی وجود ندارد" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نوع</TableHead>
                  <TableHead>شرح</TableHead>
                  <TableHead>ردیف‌ها</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(journals.data ?? []).map((journal) => {
                  const open = openJournal === journal.id;
                  const debit = journal.entries.reduce(
                    (sum, entry) => (entry.direction === 'debit' ? sum + BigInt(entry.amount) : sum),
                    0n,
                  );
                  return (
                    <Fragment key={journal.id}>
                      <TableRow>
                        <TableCell>
                          <Badge tone="neutral">{journal.kind}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{journal.memo ?? '—'}</TableCell>
                        <TableCell>
                          <span className="tabular text-xs">{journal.entries.length}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatJalaliDateTime(journal.createdAt)}
                        </TableCell>
                        <TableCell className="text-left">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setOpenJournal(open ? null : journal.id)}
                            aria-expanded={open}
                          >
                            <ChevronDown className={cn('transition', open && 'rotate-180')} />
                            جزئیات
                          </Button>
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/40">
                            <div className="space-y-2 py-1">
                              <p className="text-xs text-muted-foreground">
                                جمع بدهکار: <Money value={debit.toString()} muted /> · کلید یکتا:{' '}
                                <span className="tabular" dir="ltr">
                                  {journal.idempotencyKey}
                                </span>
                              </p>
                              <ul className="space-y-1 text-xs">
                                {journal.entries.map((entry) => (
                                  <li key={entry.id} className="flex items-center justify-between gap-3">
                                    <span className="tabular text-muted-foreground" dir="ltr">
                                      {entry.walletId}
                                    </span>
                                    <span className="flex items-center gap-2">
                                      <Badge tone={entry.direction === 'debit' ? 'danger' : 'success'}>
                                        {entry.direction === 'debit' ? 'بدهکار' : 'بستانکار'}
                                      </Badge>
                                      <Money value={entry.amount} className="font-medium" />
                                      <span className="text-muted-foreground">
                                        (<Money value={entry.balanceAfter} muted />)
                                      </span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <TriangleAlert className="size-3.5" />
        اگر «نامتوازن» دیدید، به‌معنای نقض یک اتحاد مالی است و باید پیش از هر عملیات دیگری بررسی شود.
      </p>
    </div>
  );
}
