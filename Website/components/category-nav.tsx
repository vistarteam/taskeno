'use client';

import Link from 'next/link';
import { useResource } from '@/lib/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import type { Category } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Horizontal category filter. `active` is a category slug from the URL. */
export function CategoryNav({ active, className }: { active?: string; className?: string }) {
  const { data, loading } = useResource<Category[]>('/categories');

  if (loading && !data) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-28 rounded-full" />
        ))}
      </div>
    );
  }

  const children = (data ?? []).flatMap((parent) => parent.children ?? []);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <FilterPill href="/services" label="همه" active={!active} />
      {(data ?? []).map((parent) => (
        <FilterPill key={parent.id} href={`/services?category=${parent.slug}`} label={parent.titleFa} active={active === parent.slug} />
      ))}
      {children.slice(0, 4).map((child) => (
        <FilterPill
          key={child.id}
          href={`/services?category=${child.slug}`}
          label={child.titleFa}
          active={active === child.slug}
        />
      ))}
    </div>
  );
}

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition',
        active
          ? 'border-primary/40 bg-primary/10 font-medium text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
      )}
    >
      {label}
    </Link>
  );
}
