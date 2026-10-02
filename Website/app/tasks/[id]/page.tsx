'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowRight,
    Clock3,
    UserRound,
    Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { PageLoader } from '@/components/ui/skeleton';
import { useResource } from '@/lib/hooks';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { faNumber } from '@/lib/format';

type Task = {
    id: string;
    buyerId: string;
    providerId: string | null;
    orderId: string | null;
    title: string;
    description: string;
    budget: string;
    budgetToman: string;
    currency: string;
    estimatedMinutes: number;
    status:
        | 'open'
        | 'taken'
        | 'in_progress'
        | 'delivered'
        | 'completed'
        | 'cancelled'
        | 'expired';
    expiresAt: string;
    takenAt: string | null;
    completedAt: string | null;
    createdAt: string;
    requester?: {
        username: string | null;
        displayName: string | null;
    };
    category?: {
        name: string;
    } | null;
};

export default function TaskDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();

    const {
        user,
        loading: sessionLoading,
    } = useSession();

    const task = useResource<Task>(
        `/tasks/${params.id}`,
    );

    if (task.loading && !task.data) {
        return (
            <PageLoader label="در حال بارگذاری تسک…" />
        );
    }

    if (task.error || !task.data) {
        return (
            <div className="mx-auto max-w-xl">
                <Alert
                    tone="danger"
                    title="تسک پیدا نشد"
                >
                    {task.error?.message ??
                        'این تسک دیگر در دسترس نیست.'}

                    <div className="mt-3">
                        <Button asChild variant="outline">
                            <Link href="/tasks">
                                بازگشت به تسک‌ها
                            </Link>
                        </Button>
                    </div>
                </Alert>
            </div>
        );
    }

    const data = task.data;

    const isOwner =
        user?.id === data.buyerId;

    const isAvailable =
        data.status === 'open';

    const take = async () => {
        if (!user) {
            router.push('/login');
            return;
        }

        try {
            const result = await api.post<{
                task: Task;
                order: {
                    id: string;
                    code: string;
                    status: string;
                    paymentStatus: string;
                    subtotal: string;
                    commissionAmount: string;
                    total: string;
                    totalToman: string;
                };
            }>(`/tasks/${data.id}/take`);

            router.push(
                `/orders/${result.order.id}`,
            );

            router.refresh();
        } catch (cause) {
            if (cause instanceof ApiError) {
                if (
                    cause.code ===
                    'TASK_NOT_AVAILABLE'
                ) {
                    await task.reload();
                    return;
                }

                window.alert(cause.message);
                return;
            }

            window.alert(
                'قبول تسک ناموفق بود.',
            );
        }
    };

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/tasks')}
            >
                <ArrowRight />
                بازگشت به تسک‌ها
            </Button>

            <Card>
                <CardContent className="space-y-6 p-5 sm:p-7">
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {data.category ? (
                                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {data.category.name}
                </span>
                            ) : null}

                            <span
                                className={
                                    isAvailable
                                        ? 'rounded-full bg-success/10 px-3 py-1 text-xs text-success'
                                        : 'rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground'
                                }
                            >
                {isAvailable
                    ? 'آماده قبول'
                    : 'دیگر قابل قبول نیست'}
              </span>
                        </div>

                        <h1 className="text-2xl font-bold">
                            {data.title}
                        </h1>

                        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                            {data.description}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <Info
                            icon={
                                <Wallet className="size-4" />
                            }
                            label="بودجه"
                            value={data.budgetToman}
                        />

                        <Info
                            icon={
                                <Clock3 className="size-4" />
                            }
                            label="زمان تقریبی"
                            value={`${faNumber(data.estimatedMinutes)} دقیقه`}
                        />

                        <Info
                            icon={
                                <UserRound className="size-4" />
                            }
                            label="ثبت‌کننده"
                            value={
                                data.requester?.displayName ??
                                'کاربر تسکنو'
                            }
                        />
                    </div>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <p className="text-sm leading-6">
                            با قبول این تسک، یک سفارش برای شما
                            و ثبت‌کننده ایجاد می‌شود و تسک از
                            فهرست عمومی خارج خواهد شد.
                        </p>
                    </div>

                    {sessionLoading ? (
                        <Button
                            className="w-full"
                            disabled
                        >
                            در حال بررسی حساب…
                        </Button>
                    ) : isOwner ? (
                        <Alert tone="warning">
                            این تسک را خودتان ثبت کرده‌اید و
                            نمی‌توانید آن را قبول کنید.
                        </Alert>
                    ) : !isAvailable ? (
                        <Alert tone="info">
                            این تسک قبلاً توسط شخص دیگری گرفته
                            شده یا دیگر فعال نیست.
                        </Alert>
                    ) : (
                        <Button
                            className="w-full"
                            size="lg"
                            onClick={() => void take()}
                        >
                            قبول تسک
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Info({
                  icon,
                  label,
                  value,
              }: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {icon}
                {label}
            </div>

            <p className="mt-2 truncate font-bold">
                {value}
            </p>
        </div>
    );
}