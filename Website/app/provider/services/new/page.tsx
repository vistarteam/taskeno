'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuthGuard } from '@/components/auth-guard';
import { useResource, request } from '@/lib/hooks';
import { ApiError, toTomanInputRial } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { faNumber } from '@/lib/format';
import type { Category, ServiceEntity } from '@/lib/types';

export default function NewServicePage() {
  return (
    <AuthGuard requireProvider>
      <NewServiceForm />
    </AuthGuard>
  );
}

function NewServiceForm() {
  const router = useRouter();
  const toast = useToast();
  const categories = useResource<Category[]>('/categories');

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('3');
  const [revisions, setRevisions] = useState('1');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const options = useMemo(
    () =>
      (categories.data ?? []).flatMap((parent) => [
        { value: parent.id, label: parent.titleFa },
        ...(parent.children ?? []).map((child) => ({
          value: child.id,
          label: `— ${child.titleFa}`,
        })),
      ]),
    [categories.data],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const priceRial = toTomanInputRial(price);
    if (!priceRial) {
      setError(new ApiError(400, 'VALIDATION_FAILED', 'قیمت را به تومان و با عدد وارد کنید.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await request<ServiceEntity>('/services', {
        method: 'POST',
        body: {
          title: title.trim(),
          categoryId,
          description: description.trim(),
          priceRial,
          deliveryDays: Number(deliveryDays),
          revisions: Number(revisions),
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 10),
        },
      });
      toast.success('پیش‌نویس خدمت ساخته شد. حالا تصویر اضافه کنید و برای بازبینی بفرستید.');
      router.push(`/provider/services/${created.id}`);
    } catch (cause) {
      setError(cause as ApiError);
      if (!(cause instanceof ApiError)) toast.error('ساخت خدمت ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">ساخت خدمت جدید</h1>
        <p className="text-sm text-muted-foreground">
          خدمت ابتدا به‌صورت پیش‌نویس ساخته می‌شود؛ سپس تصویر اضافه می‌کنید و برای بازبینی ارسال می‌شود.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات خدمت</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field
              label="عنوان خدمت"
              required
              error={fieldErrors.title}
              hint="حداقل ۸ کاراکتر؛ همان چیزی که در فهرست خدمات دیده می‌شود."
            >
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
            </Field>

            <Field label="دسته‌بندی" required error={fieldErrors.categoryId}>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger aria-label="دسته‌بندی">
                  <SelectValue placeholder="یک دسته انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="توضیحات"
              required
              error={fieldErrors.description}
              hint="حداقل ۴۰ کاراکتر: چه چیزی تحویل می‌دهید، چه چیزی شامل نمی‌شود، نیاز به چه اطلاعاتی دارید."
            >
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={7}
                maxLength={5000}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="قیمت (تومان)" required error={fieldErrors.priceRial} hint="حداقل ۱٬۰۰۰ تومان">
                <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" required />
              </Field>

              <Field label="زمان تحویل (روز)" required error={fieldErrors.deliveryDays}>
                <Input
                  value={deliveryDays}
                  onChange={(event) => setDeliveryDays(event.target.value)}
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={180}
                  required
                />
              </Field>

              <Field label="تعداد اصلاح" error={fieldErrors.revisions}>
                <Input
                  value={revisions}
                  onChange={(event) => setRevisions(event.target.value)}
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={20}
                />
              </Field>
            </div>

            <Field label="برچسب‌ها" hint="با کاما جدا کنید؛ حداکثر ۱۰ برچسب.">
              <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="لوگو, برندینگ" />
            </Field>

            {error ? <Alert tone="danger" title="ثبت خدمت ناموفق بود">{error.message}</Alert> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={busy}>
                ذخیره پیش‌نویس
              </Button>
              <Button asChild variant="ghost">
                <Link href="/provider">انصراف</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Alert tone="info" title="پیش از ارسال به بازبینی">
        <ul className="list-inside list-disc space-y-1">
          <li>حداقل یک تصویر لازم است؛ بدون تصویر، ارسال به بازبینی رد می‌شود.</li>
          <li>پس از تأیید مدیر، خدمت در فهرست عمومی نمایش داده می‌شود.</li>
          <li>
            کمیسیون پیش‌فرض پلتفرم <Badge tone="neutral">{faNumber(10)}٪</Badge> است و فقط پس از تکمیل سفارش کسر
            می‌شود.
          </li>
        </ul>
      </Alert>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5" />
        قیمت‌ها همیشه به تومان نمایش داده می‌شوند اما در سرور به ریال نگهداری می‌شوند.
      </p>
    </div>
  );
}
