'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Eye, ImagePlus, PauseCircle, Send, Trash2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Money } from '@/components/money';
import { StatusBadge } from '@/components/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuthGuard } from '@/components/auth-guard';
import { useResource, request } from '@/lib/hooks';
import { ApiError, apiFetch, toTomanInputRial } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { rialToTomanInput } from '@/lib/format';
import type { Category, Paginated, ServiceCard as ServiceCardModel, ServiceDetail, ServiceEntity } from '@/lib/types';

export default function EditServicePage() {
  return (
    <AuthGuard requireProvider>
      <EditService />
    </AuthGuard>
  );
}

function EditService() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const router = useRouter();
  const toast = useToast();

  // The provider's own list is the reliable way to load a service by id; its
  // slug then unlocks the full detail payload (images, tags, description).
  const mine = useResource<Paginated<ServiceCardModel>>('/me/services?limit=100');
  const card = useMemo(() => mine.data?.items.find((item) => item.id === id), [mine.data, id]);
  const detail = useResource<ServiceDetail>(
    card ? `/services/${encodeURIComponent(card.slug)}` : null,
    [card?.slug],
  );
  const categories = useResource<Category[]>('/categories');

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [deliveryDays, setDeliveryDays] = useState('1');
  const [revisions, setRevisions] = useState('0');
  const [tags, setTags] = useState('');
  const [initialised, setInitialised] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!detail.data || initialised) return;
    setTitle(detail.data.title);
    setCategoryId(detail.data.category.id);
    setDescription(detail.data.description);
    setPrice(rialToTomanInput(detail.data.price));
    setDeliveryDays(String(detail.data.deliveryDays));
    setRevisions(String(detail.data.revisions));
    setTags((detail.data.tags ?? []).join(', '));
    setInitialised(true);
  }, [detail.data, initialised]);

  const options = useMemo(
    () =>
      (categories.data ?? []).flatMap((parent) => [
        { value: parent.id, label: parent.titleFa },
        ...(parent.children ?? []).map((child) => ({ value: child.id, label: `— ${child.titleFa}` })),
      ]),
    [categories.data],
  );

  if (mine.loading && !mine.data) return <PageLoader />;

  if (mine.data && !card) {
    return (
      <EmptyState
        icon={Eye}
        title="این خدمت پیدا نشد"
        description="ممکن است حذف شده باشد یا متعلق به حساب شما نباشد."
        action={
          <Button asChild variant="outline">
            <Link href="/provider">بازگشت به داشبورد</Link>
          </Button>
        }
      />
    );
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const priceRial = toTomanInputRial(price);
    if (!priceRial) {
      setError(new ApiError(400, 'VALIDATION_FAILED', 'قیمت را به تومان و با عدد وارد کنید.'));
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await request<ServiceEntity>(`/services/${id}`, {
        method: 'PATCH',
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
      toast.success('تغییرات ذخیره شد.');
      mine.reload();
      detail.reload();
    } catch (cause) {
      setError(cause as ApiError);
      toast.error(cause instanceof ApiError ? cause.message : 'ذخیره تغییرات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy('upload');
    try {
      const form = new FormData();
      form.append('file', file);
      await apiFetch(`/services/${id}/images`, { method: 'POST', rawBody: form });
      toast.success('تصویر اضافه شد.');
      mine.reload();
      detail.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'بارگذاری تصویر ناموفق بود.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeImage = async (imageId: string) => {
    setBusy(`image:${imageId}`);
    try {
      await request(`/services/${id}/images/${imageId}`, { method: 'DELETE' });
      toast.success('تصویر حذف شد.');
      detail.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'حذف تصویر ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  const transition = async (action: 'submit' | 'pause') => {
    setBusy(action);
    try {
      await request(`/services/${id}/${action}`, { method: 'POST', body: {} });
      toast.success(action === 'submit' ? 'خدمت برای بازبینی ارسال شد.' : 'خدمت متوقف شد.');
      mine.reload();
      detail.reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'عملیات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  const status = detail.data?.status ?? card?.status ?? 'draft';
  const images = detail.data?.images ?? [];
  const canSubmit = status === 'draft' || status === 'rejected' || status === 'paused';
  const canPause = status === 'published';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">مدیریت خدمت</h1>
            <StatusBadge kind="service" status={status} />
          </div>
          {detail.data ? (
            <Link
              href={`/services/${encodeURIComponent(detail.data.slug)}`}
              className="text-xs text-primary hover:underline"
            >
              مشاهده صفحه عمومی خدمت
            </Link>
          ) : null}
        </div>
        <Money value={price ? (toTomanInputRial(price) ?? '0') : '0'} className="text-lg font-semibold" />
      </header>

      {status === 'rejected' && detail.data ? (
        <Alert tone="danger" title="این خدمت رد شده است">
          دلیل بازبینی: {detail.data.status === 'rejected' ? 'مطابق اعلام مدیر، نیاز به اصلاح دارد.' : '—'}
        </Alert>
      ) : null}
      {status === 'pending_review' ? (
        <Alert tone="info" title="در انتظار بازبینی مدیر">
          پس از تأیید، خدمت در فهرست عمومی نمایش داده می‌شود.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>تصاویر خدمت</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {images.map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/files/${image.fileId}`} alt={image.alt ?? ''} className="aspect-square object-cover" />
                <button
                  type="button"
                  onClick={() => void removeImage(image.id)}
                  className="absolute left-1 top-1 rounded-md bg-destructive/90 p-1 text-destructive-foreground opacity-0 transition group-hover:opacity-100"
                  aria-label="حذف تصویر"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary">
              <ImagePlus className="size-5" />
              افزودن تصویر
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => void uploadImage(event)}
                disabled={busy === 'upload'}
              />
            </label>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            {images.length === 0
              ? 'حداقل یک تصویر برای ارسال به بازبینی لازم است (PNG، JPEG یا WebP تا ۲ مگابایت).'
              : `${images.length} تصویر ثبت شده است.`}
          </p>

          <Separator />

          <div className="flex flex-wrap gap-3">
            {canSubmit ? (
              <Button loading={busy === 'submit'} disabled={images.length === 0} onClick={() => void transition('submit')}>
                <Send />
                ارسال برای بازبینی
              </Button>
            ) : null}
            {canPause ? (
              <Button variant="outline" loading={busy === 'pause'} onClick={() => void transition('pause')}>
                <PauseCircle />
                توقف فروش
              </Button>
            ) : null}
            {status === 'pending_review' ? (
              <p className="text-xs text-muted-foreground">در حال بازبینی؛ امکان ویرایش تا تأیید وجود دارد.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات خدمت</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.loading && !detail.data ? (
            <PageLoader />
          ) : (
            <form onSubmit={save} className="space-y-4">
              <Field label="عنوان" required error={error?.fieldErrors.title}>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
              </Field>

              <Field label="دسته‌بندی" required error={error?.fieldErrors.categoryId}>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger aria-label="دسته‌بندی">
                    <SelectValue placeholder="دسته را انتخاب کنید" />
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

              <Field label="توضیحات" required error={error?.fieldErrors.description}>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={7}
                  maxLength={5000}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="قیمت (تومان)" required error={error?.fieldErrors.priceRial}>
                  <Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" />
                </Field>
                <Field label="زمان تحویل (روز)" error={error?.fieldErrors.deliveryDays}>
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    value={deliveryDays}
                    onChange={(event) => setDeliveryDays(event.target.value)}
                  />
                </Field>
                <Field label="تعداد اصلاح" error={error?.fieldErrors.revisions}>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={revisions}
                    onChange={(event) => setRevisions(event.target.value)}
                  />
                </Field>
              </div>

              <Field label="برچسب‌ها">
                <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="لوگو, برندینگ" />
              </Field>

              {error ? <Alert tone="danger">{error.message}</Alert> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={busy === 'save'}>
                  <Upload />
                  ذخیره تغییرات
                </Button>
                <Button type="button" variant="ghost" onClick={() => router.push('/provider')}>
                  بازگشت
                </Button>
                {status === 'published' ? <Badge tone="success">این خدمت فعال است</Badge> : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
