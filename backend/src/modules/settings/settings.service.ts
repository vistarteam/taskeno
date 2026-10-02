import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { settings } from '../../db/schema';
import { DbService } from '../../db/db.service';

/**
 * Runtime settings (feature flags, limits, defaults) edited by admins.
 *
 * Values are read through this service rather than from the environment so an
 * operator can change business behaviour without a deploy. A short cache keeps
 * hot paths off the database; writes invalidate it immediately.
 */
@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly ttlMs = 30_000;

  constructor(private readonly dbService: DbService) {}

  async get<T>(key: string, fallback: T, tx?: Database): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;

    const db = tx ?? this.dbService.db;
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
    const value = (row?.value ?? fallback) as T;
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  async getNumber(key: string, fallback: number, tx?: Database): Promise<number> {
    const value = await this.get<unknown>(key, fallback, tx);
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async getBoolean(key: string, fallback: boolean, tx?: Database): Promise<boolean> {
    const value = await this.get<unknown>(key, fallback, tx);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    return fallback;
  }

  async getBigInt(key: string, fallback: bigint, tx?: Database): Promise<bigint> {
    const value = await this.get<unknown>(key, fallback.toString(), tx);
    try {
      return BigInt(String(value));
    } catch {
      return fallback;
    }
  }

  async set(key: string, value: unknown, updatedBy?: string | null, tx?: Database): Promise<void> {
    const db = tx ?? this.dbService.db;
    await db
      .insert(settings)
      .values({ key, value, updatedBy: updatedBy ?? null })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: updatedBy ?? null, updatedAt: new Date() } });
    this.cache.delete(key);
  }

  async all() {
    return this.dbService.db.select().from(settings).orderBy(settings.key);
  }
}
