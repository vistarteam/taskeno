'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock3, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { useResource } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

type Category = {
    id: string;
    slug: string;
    titleFa: string;
    icon: string | null;
    children: Array<{
        id: string;
        slug: string;
        titleFa: string;
        icon: string | null;
    }>;
};

export default function NewTaskPage() {
    const router = useRouter();
    const { user, loading: sessionLoading } = useSession();

    const categories = useResource<Category[]>('/categories');

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState('');
    const [estimatedMinutes, setEstimatedMinutes] = useState('10');
    const [expiresInMinutes, setExpiresInMinutes] = useState('1440');
    const [categoryId, setCategoryId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (sessionLoading) {
        return <div className="py-12 text-center text-sm text-muted-foreground">در حال بررسی حساب…</div>;
    }

    if (!user) {
        return (
            <div className="mx-auto max-w-xl">
                <Alert tone="warning" title="ورود لازم است">
                    برای ثبت تسک ابتدا وارد حساب کاربری خود شوید.
                    <div className="mt-3">
                        <Button onClick={() => router.push('/login')}>ورود به حساب</Button>
                    </div>
                </Alert>
            </div>
        );
    }

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        setBusy(true);

        try {
            const normalizedBudget = budget
                .replace(/[٬,\s]/g, '')
                .replace(/[۰-۹]/g, (digit) =>
                    String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
                );

            const result = await api.post<{
                id: string;
            }>('/tasks', {
                title: title.trim(),
                description: description.trim(),
                budgetRial: String(BigInt(normalizedBudget) * 10n),
                estimatedMinutes: Number(estimatedMinutes),
                expiresInMinutes: Number(expiresInMinutes),
                categoryId: categoryId || null,
            });

            router.push(/tasks/${result.id});
            router.refresh();
        } catch (cause) {
            setError(
                cause instanceof ApiError
                    ? cause.message
                    : 'ثبت تسک ناموفق بود. دوباره تلاش کنید.',
            );
        } finally {
            setBusy(false);
        }
    };

    const parentCategories = categories.data ?? [];

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <header className="space-y-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/tasks')}
                >
                    <ArrowRight />
                    بازگشت به تسک‌ها
                </Button>

                <div>
                    <h1 className="text-xl font-bold">ثبت تسک جدید</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        کار کوچک و مشخصی که می‌خواهید یک نفر سریع انجام دهد.
                    </p>
                </div>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>جزئیات تسک</CardTitle>
                </CardHeader>

                <CardContent>
                    <form onSubmit={submit} className="space-y-5">
                        {error ? <Alert tone="danger">{error}</Alert> : null}

                        <Field label="عنوان تسک" htmlFor="task-title">
                            <Input
                                id="task-title"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="مثلاً تبدیل PDF به Word"
                                minLength={5}
                                maxLength={120}
                                required
                            />
                        </Field>
                        <Field label="توضیحات" htmlFor="task-description">
              <textarea
                  id="task-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="دقیقاً توضیح دهید چه کاری باید انجام شود…"
                  minLength={10}
                  maxLength={5000}
                  required
                  rows={6}
                  className="flex min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="بودجه (تومان)" htmlFor="task-budget">
                                <Input
                                    id="task-budget"
                                    value={budget}
                                    onChange={(event) => setBudget(event.target.value)}
                                    placeholder="مثلاً ۵۰۰۰۰"
                                    inputMode="numeric"
                                    required
                                />
                            </Field>

                            <Field label="زمان تقریبی" htmlFor="task-minutes">
                                <div className="relative">
                                    <Input
                                        id="task-minutes"
                                        value={estimatedMinutes}
                                        onChange={(event) =>
                                            setEstimatedMinutes(event.target.value)
                                        }
                                        type="number"
                                        min={1}
                                        max={240}
                                        required
                                    />
                                    <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    بین ۱ تا ۲۴۰ دقیقه
                                </p>
                            </Field>
                        </div>

                        <Field label="دسته‌بندی" htmlFor="task-category">
                            <select
                                id="task-category"
                                value={categoryId}
                                onChange={(event) => setCategoryId(event.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                            >
                                <option value="">بدون دسته‌بندی</option>

                                {parentCategories.map((parent) => (
                                    <optgroup key={parent.id} label={parent.titleFa}>
                                        <option value={parent.id}>{parent.titleFa}</option>

                                        {parent.children.map((child) => (
                                            <option key={child.id} value={child.id}>
                                                {child.titleFa}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </Field>

                        <Field label="مدت فعال بودن تسک" htmlFor="task-expiry">
                            <select
                                id="task-expiry"
                                value={expiresInMinutes}
                                onChange={(event) => setExpiresInMinutes(event.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                            >
                                <option value="60">۱ ساعت</option>
                                <option value="360">۶ ساعت</option>
                                <option value="720">۱۲ ساعت</option>
                                <option value="1440">۱ روز</option>
                                <option value="4320">۳ روز</option>
                                <option value="10080">۷ روز</option>
                            </select>
                        </Field>

                        <Button type="submit" className="w-full" disabled={busy}>
                            <Send />
                            {busy ? 'در حال ثبت…' : 'ثبت تسک'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}