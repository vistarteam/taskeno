'use client';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/skeleton';

/**
 * The API paginates with an opaque cursor, so pages append rather than jump.
 * `hasMore` comes straight from the server response.
 */
export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
  label = 'نمایش بیشتر',
  count,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  label?: string;
  count?: number;
}) {
  if (!hasMore) {
    return count !== undefined && count > 0 ? (
      <p className="text-center text-xs text-muted-foreground">به پایان فهرست رسیدید.</p>
    ) : null;
  }

  return (
    <div className="flex justify-center pt-2">
      {loading ? (
        <Spinner label="در حال بارگذاری…" />
      ) : (
        <Button variant="outline" onClick={onLoadMore} className="min-w-40">
          {label}
        </Button>
      )}
    </div>
  );
}
