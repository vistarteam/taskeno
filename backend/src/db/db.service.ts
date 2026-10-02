import { Inject, Injectable, Optional, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { closeDatabase, getDatabaseHandle, runMigrations, type Database, type DatabaseHandle } from './client';
import { isProduction } from '../config/env';
import { logger } from '../common/logger';

/**
 * Single shared database handle for the process.
 *
 * The handle is created lazily on module init so the connection is ready before
 * any request is served, and pending migrations are applied automatically
 * outside production (production applies them explicitly in the release step).
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private handle: DatabaseHandle | null = null;

  /**
   * `handleOverride` lets tests point the service at an isolated embedded
   * database instead of the process-wide one. It has no default provider, so
   * it is explicitly optional — without the decorators Nest would try to
   * resolve the type alias and fail to boot the application.
   */
  constructor(
    @Optional() @Inject('TASKENO_DB_HANDLE_OVERRIDE') private readonly handleOverride?: DatabaseHandle,
  ) {}

  async onModuleInit(): Promise<void> {
    this.handle = this.handleOverride ?? (await getDatabaseHandle());
    if (!isProduction) {
      await runMigrations(this.handle);
    }
    logger.info({ driver: this.handle.driver }, 'database ready');
  }

  get db(): Database {
    if (!this.handle) {
      throw new Error('Database accessed before initialisation');
    }
    return this.handle.db;
  }

  get driver(): 'pglite' | 'pg' {
    return this.handle?.driver ?? 'pglite';
  }

  /**
   * Runs `fn` inside a single transaction. Every multi-step financial change
   * must go through here: partial writes in a ledger are not recoverable.
   */
  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const result = await this.db.transaction(async (tx) => fn(tx as unknown as Database));
    return result as T;
  }

  async onModuleDestroy(): Promise<void> {
    await closeDatabase();
    this.handle = null;
  }
}
