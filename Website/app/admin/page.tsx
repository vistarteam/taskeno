'use client';

import { AlertTriangle, Gavel, Package, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert } from '@/components/ui/alert';
import { PageLoader } from '@/components/ui/skeleton';
import { Money } from '@/components/money';
import { AuthGuard } from '@/components/auth-guard';
import { UsersPanel } from '@/components/admin/users-panel';
import { ModerationPanel } from '@/components/admin/moderation-panel';
import { DisputesPanel, OrdersPanel } from '@/components/admin/orders-panel';
import { LedgerPanel } from '@/components/admin/ledger-panel';
import {
  AuditPanel,
  CategoriesPanel,
  CommissionPanel,
  ReportsPanel,
  SettingsPanel,
} from '@/components/admin/config-panel';
import { useResource } from '@/lib/hooks';
import { faNumber, formatJalaliDateTime } from '@/lib/format';
import type { AdminMetrics } from '@/lib/types';

export default function AdminPage() {
  return (
    <AuthGuard requireAdmin>
      <AdminView />
    </AuthGuard>
  );
}

function AdminView() {
  const metrics = useResource<AdminMetrics>('/admin/metrics');

  if (metrics.loading && !metrics.data) return <PageLoader label="در حال بارگذاری پنل مدیریت…" />;

  const data = metrics.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ShieldCheck className="size-5 text-primary" />
            پنل مدیریت تسکنو
          </h1>
          <p className="text-sm text-muted-foreground">
            نظارت بر کاربران، بازبینی خدمات، اختلاف‌ها و سلامت دفتر مالی.
          </p>
        </div>
        {data ? (
          <p className="text-xs text-muted-foreground">آخرین به‌روزرسانی: {formatJalaliDateTime(data.generatedAt)}</p>
        ) : null}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="کاربران فعال"
          value={faNumber(data?.users.active ?? 0)}
          hint={`${faNumber(data?.users.providers ?? 0)} ارائه‌دهنده`}
          icon={<Users className="size-4 text-primary" />}
        />
        <MetricCard
          title="سفارش‌ها"
          value={faNumber(data?.orders.total ?? 0)}
          hint={`${faNumber(data?.orders.active ?? 0)} فعال · ${faNumber(data?.orders.completed ?? 0)} تکمیل‌شده`}
          icon={<Package className="size-4 text-primary" />}
        />
        <MetricCard
          title="گردش مالی (GMV)"
          value={<Money value={data?.orders.gmv ?? '0'} compact />}
          hint={
            <>
              کمیسیون: <Money value={data?.orders.grossCommission ?? '0'} compact muted />
            </>
          }
          icon={<Wallet className="size-4 text-success" />}
        />
        <MetricCard
          title="در انتظار اقدام"
          value={faNumber((data?.moderation.pendingServices ?? 0) + (data?.reports.open ?? 0))}
          hint={`${faNumber(data?.moderation.pendingServices ?? 0)} خدمت · ${faNumber(data?.reports.open ?? 0)} گزارش`}
          icon={<AlertTriangle className="size-4 text-warning" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 pt-5">
            <p className="text-xs text-muted-foreground">وجه در امانت (Escrow)</p>
            <Money value={data?.ledger.escrow ?? '0'} className="text-lg font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-5">
            <p className="text-xs text-muted-foreground">درآمد پلتفرم</p>
            <Money value={data?.ledger.revenue ?? '0'} className="text-lg font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-2 pt-5">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">سلامت دفتر مالی</p>
              <Badge tone={data?.ledger.balanced ? 'success' : 'danger'}>
                {data?.ledger.balanced ? 'تراز است' : 'نامتوازن'}
              </Badge>
            </div>
            <div className="text-left text-xs text-muted-foreground">
              <p>
                بدهکار: <Money value={data?.ledger.debit ?? '0'} compact muted />
              </p>
              <p>
                بستانکار: <Money value={data?.ledger.credit ?? '0'} compact muted />
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(data?.disputes.open ?? 0) > 0 ? (
        <Alert tone="warning" title="اختلاف‌های باز">
          {faNumber(data?.disputes.open ?? 0)} اختلاف در انتظار بررسی است؛ تا صدور رأی، مبلغ سفارش در امانت می‌ماند.
        </Alert>
      ) : null}

      <Tabs defaultValue="moderation">
        <TabsList>
          <TabsTrigger value="moderation">
            <ShieldCheck className="size-4" />
            بازبینی خدمات
            {data && data.moderation.pendingServices > 0 ? (
              <Badge tone="warning">{faNumber(data.moderation.pendingServices)}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="size-4" />
            کاربران
          </TabsTrigger>
          <TabsTrigger value="orders">
            <Package className="size-4" />
            سفارش‌ها
          </TabsTrigger>
          <TabsTrigger value="disputes">
            <Gavel className="size-4" />
            اختلاف‌ها
            {data && data.disputes.open > 0 ? <Badge tone="danger">{faNumber(data.disputes.open)}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="ledger">
            <Wallet className="size-4" />
            دفتر مالی
          </TabsTrigger>
          <TabsTrigger value="reports">گزارش‌ها</TabsTrigger>
          <TabsTrigger value="settings">تنظیمات</TabsTrigger>
          <TabsTrigger value="commission">کمیسیون</TabsTrigger>
          <TabsTrigger value="categories">دسته‌بندی‌ها</TabsTrigger>
          <TabsTrigger value="audit">ردگیری</TabsTrigger>
        </TabsList>

        <TabsContent value="moderation">
          <ModerationPanel />
        </TabsContent>
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="orders">
          <OrdersPanel />
        </TabsContent>
        <TabsContent value="disputes">
          <DisputesPanel />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerPanel />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsPanel />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
        <TabsContent value="commission">
          <CommissionPanel />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-5">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {title}
        </p>
        <p className="text-xl font-bold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
