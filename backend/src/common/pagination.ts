import { and, lt, or, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@taskeno/contracts';
import { AppError, ERROR_CODES } from './errors';

/** Wire format of a cursor: short keys keep the token small. */
export type Cursor = { t: string; i: string };

/** Cursors are opaque to clients so the ordering strategy can change later. */
export const encodeCursor = (input: { createdAt: Date; id: string }): string =>
  Buffer.from(JSON.stringify({ t: input.createdAt.toISOString(), i: input.id }), 'utf8').toString('base64url');

export const decodeCursor = (raw?: string | null): Cursor | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const resolveLimit = (limit?: number): number => {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
};

/**
 * Keyset pagination over `(created_at, id)` ordered DESC. Offset pagination is
 * deliberately avoided: it skips/duplicates rows when new records arrive.
 */
export const cursorCondition = (
  createdAtColumn: PgColumn,
  idColumn: PgColumn,
  cursor: Cursor | null,
): SQL | undefined => {
  if (!cursor) return undefined;
  const createdAt = new Date(cursor.t);
  if (Number.isNaN(createdAt.getTime())) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: 'نشانگر صفحه‌بندی نامعتبر است.' });
  }
  return and(
    or(lt(createdAtColumn, createdAt), and(eq(createdAtColumn, createdAt), lt(idColumn, cursor.i))),
  ) as SQL;
};

/** Fetches `limit + 1` rows to detect whether another page exists. */
export const buildPage = <T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
};
