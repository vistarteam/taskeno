import { customType } from 'drizzle-orm/pg-core';

/**
 * Exact money column.
 *
 * Values are stored as PostgreSQL `numeric(20, 0)` (integer Rial) and exposed to
 * application code as `bigint`. Never `real`/`double precision`: a ledger with
 * floating point rounding errors is worse than useless.
 */
export const money = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'numeric(20, 0)';
  },
  fromDriver(value: unknown): bigint {
    if (value === null || value === undefined) return value as unknown as bigint;
    return BigInt(String(value));
  },
  toDriver(value: bigint): string {
    return value.toString();
  },
});

/** Nullable money column helper (returns `bigint | null`). */
export const nullableMoney = customType<{ data: bigint | null; driverData: string | null }>({
  dataType() {
    return 'numeric(20, 0)';
  },
  fromDriver(value: unknown): bigint | null {
    if (value === null || value === undefined) return null;
    return BigInt(String(value));
  },
  toDriver(value: bigint | null): string | null {
    return value === null ? null : value.toString();
  },
});
