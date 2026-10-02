'use client';

import Link from 'next/link';
import { Clock3, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import { PageLoader } from '@/components/ui/skeleton';
import { useResource } from '@/lib/hooks';
import { faNumber } from '@/lib/format';

type TaskItem = {
    id: string;
    title: string;
    description: string;
    budget: string;
    budgetToman: string;
    estimatedMinutes: number;
    status: 'open' | 'taken' | 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'expired';
    expiresAt: string;
    createdAt: string;
    requester?: {
        username: string | null;
        displayName: string | null;
    };
    category?: {
        name: string;
    } | null;
};

type TaskListResponse = {
    items: TaskItem[];
    hasMore: boolean;
};

export default function TasksPage() {
    const { data, loading, error, reload } =
        useResource<TaskListResponse>('/tasks?limit=30');

    const items = data?.items ?? [];

    if (loading && !data) {
        return <PageLoader label="در حال بارگذاری تسک‌ها…" />;
    }

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-xl font-bold">تسک‌های سریع</h1>
                    <p className="text-sm text-muted-foreground">
                        کارهای کوچک را پیدا کنید، سریع قبول کنید و انجام دهید.
                    </p>
                </div>

                <Button asChild>
                    <Link href="/tasks/new">
                        <Plus />
                        ثبت تسک
                    </Link>
                </Button>
            </header>

            {error ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                        <p className="font-medium">دریافت تسک‌ها ناموفق بود.</p>
                        <p className="text-sm text-muted-foreground">{error.message}</p>
                        <Button variant="outline" onClick={() => reload()}>
                            <RefreshCw />
                            تلاش دوباره
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {!error && items.length === 0 ? (
                <EmptyState
                    icon={Search}
                    title="فعلاً تسک بازی وجود ندارد"
                    description="اولین نفری باشید که یک کار کوچک و سریع ثبت می‌کند."
                    action={
                        <Button asChild>
                            <Link href="/tasks/new">
                                <Plus />
                                ثبت اولین تسک
                            </Link>
                        </Button>
                    }
                />
            ) : null}

            {items.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((task) => (
                        <Card
                            key={task.id}
                            className="group transition hover:border-primary/40 hover:shadow-sm"
                        >
                            <CardContent className="flex h-full flex-col gap-4 p-5">
                                <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <h2 className="line-clamp-2 font-semibold">
                                            {task.title}
                                        </h2>

                                        {task.category ? (
                                            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {task.category.name}
                      </span>
                                        ) : null}
                                    </div>

                                    <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                                        {task.description}
                                    </p>
                                </div>

                                <div className="mt-auto grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground">بودجه</p>
                                        <p className="mt-1 font-bold">{task.budgetToman}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">زمان تقریبی</p>
                                        <p className="mt-1 flex items-center gap-1 font-bold">
                                            <Clock3 className="size-4" />
                                            {faNumber(task.estimatedMinutes)} دقیقه
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground">
                    {task.requester?.displayName ?? 'کاربر تسکنو'}
                  </span>

                                    <Button asChild size="sm">
                                        <Link href={/tasks/${task.id}}>مشاهده و قبول</Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : null}
        </div>
    );
}