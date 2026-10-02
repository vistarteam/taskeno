'use client';

import { useState } from 'react';
import { Flag, Percent, Plus, ScrollText, Settings2, Tags } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useResource, request } from '@/lib/hooks';
import { ApiError, toTomanInputRial } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { faNumber, formatJalaliDateTime } from '@/lib/format';
import type { AdminCategory, AdminReport, AppSetting, AuditLogEntry, CommissionRule } from '@/lib/types';

export function SettingsPanel() {
  const settings = useResource<AppSetting[]>('/admin/settings');
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async (key: string) => {
    setBusy(true);
    try {
      // Booleans and numbers are sent as their JSON types; everything else is a
      // string, which is what the settings store persists.
      const parsed = value.trim() === 'true' ? true : value.trim() === 'false' ? false : /^-?\d+$/.test(value.trim()) ? Number(value) : value;
      await request('/admin/settings', { method: 'PUT', body: { key, value: parsed } });
      toast.success('تنظیمات ذخیره شد.');
      setEditing(null);
      settings.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ذخیره تنظیمات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  if (settings.loading && !settings.data) return <Spinner label="در حال بارگذاری تنظیمات…" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="size-4 text-primary" />
          تنظیمات پلتفرم
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(settings.data ?? []).map((setting) => (
          <div key={setting.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0 space-y-1">
              <p className="tabular text-sm font-medium" dir="ltr">
                {setting.key}
              </p>
              <p className="text-xs text-muted-foreground">{setting.description ?? '—'}</p>
              <p className="text-[11px] text-muted-foreground">آخرین تغییر: {formatJalaliDateTime(setting.updatedAt)}</p>
            </div>
            {editing === setting.key ? (
              <div className="flex items-center gap-2">
                <Input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="w-40"
                  dir="ltr"
                  aria-label={setting.key}
                />
                <Button size="sm" loading={busy} onClick={() => void save(setting.key)}>
                  ذخیره
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  انصراف
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Badge tone="neutral" className="tabular" dir="ltr">
                  {JSON.stringify(setting.value)}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(setting.key);
                    setValue(String(setting.value));
                  }}
                >
                  ویرایش
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CommissionPanel() {
  const rules = useResource<CommissionRule[]>('/admin/commission-rules');
  const toast = useToast();
  const [scope, setScope] = useState<'global' | 'category' | 'service' | 'provider'>('global');
  const [percent, setPercent] = useState('10');
  const [fixed, setFixed] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await request('/admin/commission-rules', {
        method: 'POST',
        body: {
          scope,
          calcType: fixed ? 'percent_plus_fixed' : 'percent',
          // Basis points: 10% is 1000 bps.
          percentBps: Math.round(Number(percent) * 100),
          fixedAmount: fixed ? toTomanInputRial(fixed) ?? '0' : '0',
          priority: 100,
          isActive: true,
        },
      });
      toast.success('قانون کمیسیون ثبت شد.');
      rules.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ثبت قانون ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="size-4 text-primary" />
            قوانین کمیسیون
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rules.loading && !rules.data ? (
            <Spinner />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>دامنه</TableHead>
                  <TableHead>درصد</TableHead>
                  <TableHead>مبلغ ثابت</TableHead>
                  <TableHead>اولویت</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>از تاریخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rules.data ?? []).map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="text-xs">{rule.scope}</TableCell>
                    <TableCell className="tabular">{faNumber(rule.percentBps / 100)}٪</TableCell>
                    <TableCell>
                      <Money value={rule.fixedAmount} muted />
                    </TableCell>
                    <TableCell className="tabular text-xs">{rule.priority}</TableCell>
                    <TableCell>
                      <Badge tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'فعال' : 'غیرفعال'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatJalaliDateTime(rule.effectiveFrom)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>افزودن قانون جدید</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="دامنه">
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as typeof scope)}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
                aria-label="دامنه"
              >
                <option value="global">سراسری</option>
                <option value="category">دسته‌بندی</option>
                <option value="service">خدمت</option>
                <option value="provider">ارائه‌دهنده</option>
              </select>
            </Field>
            <Field label="درصد کمیسیون" required>
              <Input value={percent} onChange={(event) => setPercent(event.target.value)} inputMode="decimal" />
            </Field>
            <Field label="مبلغ ثابت (تومان)" hint="اختیاری">
              <Input value={fixed} onChange={(event) => setFixed(event.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <Button loading={busy} onClick={() => void submit()}>
            <Plus />
            ثبت قانون
          </Button>
          <Alert tone="info">
            کمیسیون هنگام پرداخت سفارش محاسبه و به‌صورت «اسنپ‌شات» روی سفارش ذخیره می‌شود؛ تغییر قانون روی سفارش‌های
            قبلی اثر ندارد.
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

export function CategoriesPanel() {
  const categories = useResource<AdminCategory[]>('/admin/categories');
  const toast = useToast();
  const [titleFa, setTitleFa] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await request('/admin/categories', { method: 'POST', body: { titleFa: titleFa.trim(), slug: slug.trim() } });
      toast.success('دسته‌بندی ساخته شد.');
      setTitleFa('');
      setSlug('');
      categories.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ساخت دسته‌بندی ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="size-4 text-primary" />
            افزودن دسته‌بندی
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="عنوان فارسی" required>
              <Input value={titleFa} onChange={(event) => setTitleFa(event.target.value)} placeholder="طراحی موشن" />
            </Field>
            <Field label="نامک (انگلیسی)" required hint="فقط حروف کوچک، عدد و خط تیره.">
              <Input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                dir="ltr"
                placeholder="motion-design"
              />
            </Field>
          </div>
          <Button loading={busy} disabled={titleFa.trim().length < 2 || slug.trim().length < 2} onClick={() => void submit()}>
            <Plus />
            افزودن دسته
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {categories.loading && !categories.data ? (
            <Spinner />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead>
                  <TableHead>نامک</TableHead>
                  <TableHead>والد</TableHead>
                  <TableHead>ترتیب</TableHead>
                  <TableHead>فعال</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(categories.data ?? []).map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>{category.titleFa}</TableCell>
                    <TableCell className="tabular text-xs" dir="ltr">
                      {category.slug}
                    </TableCell>
                    <TableCell className="tabular text-xs" dir="ltr">
                      {category.parentId ?? '—'}
                    </TableCell>
                    <TableCell className="tabular text-xs">{category.sortOrder}</TableCell>
                    <TableCell>
                      <Badge tone={category.isActive ? 'success' : 'neutral'}>
                        {category.isActive ? 'فعال' : 'غیرفعال'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsPanel() {
  const reports = useResource<AdminReport[]>('/admin/reports');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const resolve = async (report: AdminReport, status: 'resolved' | 'dismissed') => {
    setBusy(report.id);
    try {
      await request(`/admin/reports/${report.id}`, {
        method: 'PATCH',
        body: { status, note: 'بررسی توسط مدیر' },
      });
      toast.success('گزارش رسیدگی شد.');
      reports.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  if (reports.loading && !reports.data) return <Spinner label="در حال بارگذاری گزارش‌ها…" />;
  const items = reports.data ?? [];

  if (items.length === 0) return <EmptyState icon={Flag} title="گزارشی ثبت نشده است" />;

  return (
    <div className="space-y-3">
      {items.map((report) => (
        <Card key={report.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline">{report.targetType}</Badge>
                <StatusBadge kind="report" status={report.status} />
              </div>
              <p className="text-sm">{report.reason}</p>
              {report.description ? (
                <p className="text-xs text-muted-foreground">{report.description}</p>
              ) : null}
              <p className="tabular text-[11px] text-muted-foreground" dir="ltr">
                {report.targetId}
              </p>
              <p className="text-[11px] text-muted-foreground">{formatJalaliDateTime(report.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" loading={busy === report.id} onClick={() => void resolve(report, 'resolved')}>
                رسیدگی شد
              </Button>
              <Button size="sm" variant="outline" onClick={() => void resolve(report, 'dismissed')}>
                رد گزارش
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AuditPanel() {
  const logs = useResource<AuditLogEntry[]>('/admin/audit-logs?limit=100');

  if (logs.loading && !logs.data) return <Spinner label="در حال بارگذاری ردگیری…" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-4 text-primary" />
          ردگیری عملیات مدیران و سیستم
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>عملیات</TableHead>
              <TableHead>موجودیت</TableHead>
              <TableHead>نقش</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>تاریخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs.data ?? []).map((log) => (
              <TableRow key={log.id}>
                <TableCell className="tabular text-xs" dir="ltr">
                  {log.action}
                </TableCell>
                <TableCell className="tabular text-xs text-muted-foreground" dir="ltr">
                  {log.entityType ?? '—'}
                </TableCell>
                <TableCell className="text-xs">{log.actorRole ?? '—'}</TableCell>
                <TableCell className="tabular text-xs text-muted-foreground" dir="ltr">
                  {log.ip ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatJalaliDateTime(log.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
