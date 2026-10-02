'use client';

import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, RotateCcw, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLoader } from '@/components/ui/skeleton';
import { ServiceCard, ServiceCardSkeleton } from '@/components/service-card';
import { CategoryNav } from '@/components/category-nav';
import { EmptyState } from '@/components/empty-state';
import { LoadMore } from '@/components/load-more';
import { useResource, request } from '@/lib/hooks';
import { qs, toTomanInputRial } from '@/lib/api';
import { faNumber } from '@/lib/format';
import type { Category, Paginated, ServiceCard as ServiceCardModel } from '@/lib/types';

const SORTS = [
  { value: 'newest', label: 'جدیدترین' },
  { value: 'popular', label: 'پرطرفدارترین' },
  { value: 'rating', label: 'بیشترین امتیاز' },
  { value: 'price_asc', label: 'ارزان‌ترین' },
  { value: 'price_desc', label: 'گران‌ترین' },
];

/** `useSearchParams` needs a Suspense boundary, so the page is a thin shell. */
export default function ServicesPage() {
  return (
    <Suspense fallback={<PageLoader label="در حال آماده‌سازی فهرست…" />}>
      <Browse />
    </Suspense>
  );
}

function Browse() {
  const router = useRouter();
  const params = useSearchParams();

  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const min = params.get('min') ?? '';
  const max = params.get('max') ?? '';
  const rating = params.get('rating') ?? '';

  const [term, setTerm] = useState(q);
  const [minInput, setMinInput] = useState(min);
  const [maxInput, setMaxInput] = useState(max);
  useEffect(() => setTerm(q), [q]);

  // Toman inputs become Rial for the API, so the server range check is exact.
  const path = useMemo(
    () =>
      `/services${qs({
        q: q || undefined,
        categorySlug: category || undefined,
        sort,
        minPriceRial: min ? toTomanInputRial(min) ?? undefined : undefined,
        maxPriceRial: max ? toTomanInputRial(max) ?? undefined : undefined,
        minRating: rating || undefined,
        limit: 12,
      })}`,
    [q, category, sort, min, max, rating],
  );

  const first = useResource<Paginated<ServiceCardModel>>(path);
  const categories = useResource<Category[]>('/categories');

  const [items, setItems] = useState<ServiceCardModel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (first.data) {
      setItems(first.data.items);
      setCursor(first.data.nextCursor);
    }
  }, [first.data]);

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`/services${next.toString() ? `?${next.toString()}` : ''}`);
  };

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setParams({ q: term.trim(), min: minInput.trim(), max: maxInput.trim() });
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const separator = path.includes('?') ? '&' : '?';
      const page = await request<Paginated<ServiceCardModel>>(
        `${path}${separator}cursor=${encodeURIComponent(cursor)}`,
      );
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const flatCategories = (categories.data ?? []).flatMap((parent) =>
    (parent.children ?? []).map((child) => ({
      value: child.slug,
      label: `${parent.titleFa} › ${child.titleFa}`,
    })),
  );
  if (categories.data) {
    for (const parent of categories.data) {
      flatCategories.unshift({ value: parent.slug, label: parent.titleFa });
    }
  }

  const activeCount = [q, category, min, max, rating].filter(Boolean).length;
  const isInitialLoading = first.loading && items.length === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-bold">مرور خدمات</h1>
        <p className="text-sm text-muted-foreground">
          {q ? <>نتایج جست‌وجو برای «{q}»</> : 'با فیلترها دقیقاً همان چیزی را پیدا کنید که لازم دارید.'}
        </p>
      </header>

      <CategoryNav active={category || undefined} />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit lg:sticky lg:top-20">
          <CardContent className="space-y-4 pt-5">
            <p className="flex items-center gap-2 font-medium">
              <Filter className="size-4 text-primary" />
              فیلترها
              {activeCount > 0 ? <span className="text-xs text-muted-foreground">({faNumber(activeCount)})</span> : null}
            </p>

            <form onSubmit={applyFilters} className="space-y-4">
              <Field label="جست‌وجو" htmlFor="filter-q">
                <Input
                  id="filter-q"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="عنوان خدمت…"
                />
              </Field>

              <Field label="دسته‌بندی">
                <Select
                  value={category || 'all'}
                  onValueChange={(value) => setParams({ category: value === 'all' ? '' : value })}
                >
                  <SelectTrigger aria-label="دسته‌بندی">
                    <SelectValue placeholder="همه دسته‌ها" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه دسته‌ها</SelectItem>
                    {flatCategories.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="ترتیب نمایش">
                <Select value={sort} onValueChange={(value) => setParams({ sort: value })}>
                  <SelectTrigger aria-label="ترتیب نمایش">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="از (تومان)" htmlFor="filter-min">
                  <Input
                    id="filter-min"
                    value={minInput}
                    onChange={(event) => setMinInput(event.target.value)}
                    inputMode="numeric"
                    placeholder="۱۰۰٬۰۰۰"
                  />
                </Field>
                <Field label="تا (تومان)" htmlFor="filter-max">
                  <Input
                    id="filter-max"
                    value={maxInput}
                    onChange={(event) => setMaxInput(event.target.value)}
                    inputMode="numeric"
                    placeholder="۵٬۰۰۰٬۰۰۰"
                  />
                </Field>
              </div>

              <Field label="حداقل امتیاز">
                <Select
                  value={rating || 'any'}
                  onValueChange={(value) => setParams({ rating: value === 'any' ? '' : value })}
                >
                  <SelectTrigger aria-label="حداقل امتیاز">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">بدون محدودیت</SelectItem>
                    {[3, 4, 4.5].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {faNumber(value)} و بالاتر
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  اعمال فیلتر
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="پاک کردن فیلترها"
                  onClick={() => {
                    setTerm('');
                    setMinInput('');
                    setMaxInput('');
                    router.replace('/services');
                  }}
                >
                  <RotateCcw />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {isInitialLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <ServiceCardSkeleton key={index} />
              ))}
            </div>
          ) : items.length > 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((service) => (
                  <ServiceCard key={service.id} service={service} />
                ))}
              </div>
              <LoadMore hasMore={Boolean(cursor)} loading={loadingMore} onLoadMore={loadMore} count={items.length} />
            </>
          ) : (
            <EmptyState
              icon={SearchX}
              title="خدمتی با این مشخصات پیدا نشد"
              description="فیلترها را تغییر دهید یا عبارت جست‌وجو را کوتاه‌تر کنید."
              action={
                <Button variant="outline" onClick={() => router.replace('/services')}>
                  نمایش همه خدمات
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
