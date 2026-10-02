'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, BadgeCheck, BookOpen, CreditCard, Search, ShieldCheck, Store, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ServiceCard, ServiceCardSkeleton } from '@/components/service-card';
import { EmptyState } from '@/components/empty-state';
import { useResource } from '@/lib/hooks';
import type { Category, Paginated, ServiceCard as ServiceCardModel } from '@/lib/types';
import { faNumber } from '@/lib/format';
import { useSession } from '@/lib/session';

export default function HomePage() {
  const router = useRouter();
  const { user, isProvider } = useSession();
  const [term, setTerm] = useState('');

  const categories = useResource<Category[]>('/categories');
  const newest = useResource<Paginated<ServiceCardModel>>('/services?limit=8&sort=newest');
  const topRated = useResource<Paginated<ServiceCardModel>>('/services?limit=4&sort=rating');

  const search = (event: FormEvent) => {
    event.preventDefault();
    router.push(term.trim() ? `/services?q=${encodeURIComponent(term.trim())}` : '/services');
  };

  return (
    <div className="space-y-14">
      <section className="overflow-hidden rounded-2xl border border-border bg-linear-to-bl from-primary/12 via-card to-card p-6 sm:p-10">
        <div className="mx-auto max-w-3xl space-y-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" />
            پرداخت امن همراه با نگهداری وجه در کیف پول داخلی و برداشت مستقیم به حساب بانکی
          </span>
          <h1 className="text-2xl font-bold leading-10 sm:text-4xl sm:leading-[3.2rem]">
            خدمات دیجیتال مورد نیازت را از متخصص‌ها سفارش بده
          </h1>
          <p className="text-sm leading-7 text-muted-foreground sm:text-base">
            طراحی، برنامه‌نویسی، محتوا و بازاریابی — با قیمت شفاف به تومان، زمان تحویل مشخص و کیف پول ریالی.
            مبلغ سفارش تا تأیید نهایی کار در امانت تسکنو می‌ماند.
          </p>

          <form onSubmit={search} className="mx-auto flex max-w-xl gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="مثلاً طراحی لوگو"
                aria-label="جست‌وجوی خدمات"
                className="h-12 w-full rounded-xl border border-input bg-card pr-10 pl-3 text-sm shadow-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
              />
            </div>
            <Button type="submit" size="lg">
              جست‌وجو
            </Button>
          </form>

          {!user ? (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-sm">
              <Button asChild variant="outline">
                <Link href="/register">
                  <Store />
                  ثبت‌نام ارائه‌دهنده
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/services">
                  مرور همه خدمات
                  <ArrowLeft />
                </Link>
              </Button>
            </div>
          ) : !isProvider ? (
            <Button asChild variant="outline">
              <Link href="/account">
                <Store />
                ارائه‌دهنده شوید و خدمت منتشر کنید
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title="دسته‌بندی‌ها" subtitle="از طراحی و برنامه‌نویسی تا محتوا و بازاریابی" href="/services" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(categories.data ?? []).map((category) => (
            <Link
              key={category.id}
              href={`/services?category=${category.slug}`}
              className="group rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
            >
              <p className="font-medium transition group-hover:text-primary">{category.titleFa}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {faNumber(category.children?.length ?? 0)} زیردسته
              </p>
            </Link>
          ))}
          {categories.loading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-xl border border-border bg-muted/60" />
              ))
            : null}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title="تازه‌ترین خدمات" subtitle="جدیدترین کارهای منتشرشده" href="/services" />
        {newest.loading && !newest.data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <ServiceCardSkeleton key={index} />
            ))}
          </div>
        ) : newest.data && newest.data.items.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {newest.data.items.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Store}
            title="هنوز خدمتی منتشر نشده است"
            description="اگر ارائه‌دهنده هستید، اولین خدمت را منتشر کنید تا اینجا نمایش داده شود."
            action={
              <Button asChild variant="outline">
                <Link href="/provider/services/new">افزودن خدمت</Link>
              </Button>
            }
          />
        )}
      </section>

      {topRated.data && topRated.data.items.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading title="محبوب‌ترین‌ها" subtitle="بر اساس امتیاز خریداران" href="/services?sort=rating" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {topRated.data.items.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeading title="چطور کار می‌کند؟" subtitle="سه گام تا تحویل کار" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Step
            icon={BookOpen}
            title="۱. انتخاب و سفارش"
            body="خدمت مناسب را پیدا کنید، توضیحات را دقیق بنویسید و سفارش را ثبت کنید."
          />
          <Step
            icon={CreditCard}
            title="۲. پرداخت امن"
            body="مبلغ از کیف پول شما برداشت و تا تأیید نهایی در حساب امانت نگهداری می‌شود."
          />
          <Step
            icon={BadgeCheck}
            title="۳. تأیید و تسویه"
            body="پس از تحویل و بررسی کار، تأیید می‌کنید و مبلغ (منهای کمیسیون) به ارائه‌دهنده پرداخت می‌شود."
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <TrendingUp className="size-5 text-primary" />
              ارائه‌دهنده هستید؟
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              با ارتقای حساب، خدمت منتشر کنید؛ قیمت را خودتان تعیین می‌کنید و کمیسیون فقط پس از تکمیل سفارش کسر می‌شود.
            </p>
          </div>
          <Button asChild>
            <Link href={isProvider ? '/provider' : '/account'}>
              {isProvider ? 'داشبورد ارائه‌دهنده' : 'ارتقا به ارائه‌دهنده'}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="flex items-center gap-1 text-sm text-primary transition hover:underline">
          مشاهده همه
          <ArrowLeft className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

function Step({ icon: Icon, title, body }: { icon: typeof BookOpen; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <p className="font-medium">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
