import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { jobs, outboxEvents } from '../db/schema';
import { logger } from './logger';

export type DomainEvent = {
  type: string;
  aggregateType: string;
  aggregateId?: string | null;
  payload?: Record<string, unknown>;
};

/**
 * Writes domain events inside the caller's transaction.
 *
 * Because the event row is committed atomically with the business change, a
 * crash after commit cannot lose the notification, and a rollback cannot send
 * one. Side effects are performed later by the worker.
 */
@Injectable()
export class OutboxService {
  async publish(tx: Database, event: DomainEvent): Promise<void> {
    await tx.insert(outboxEvents).values({
      eventType: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId ?? null,
      payload: event.payload ?? {},
    });
  }
}

export type JobOptions = {
  /** Delays execution, used for retries and reminder jobs. */
  runAt?: Date;
  maxAttempts?: number;
  /** Makes the job a singleton: a second enqueue with the same key is ignored. */
  uniqueKey?: string;
};

@Injectable()
export class JobsService {
  async enqueue(tx: Database, type: string, payload: Record<string, unknown> = {}, options: JobOptions = {}): Promise<void> {
    await tx
      .insert(jobs)
      .values({
        type,
        payload,
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? 5,
        uniqueKey: options.uniqueKey ?? null,
      })
      .onConflictDoNothing({ target: jobs.uniqueKey });
  }

  /**
   * Registers a recurring job. `unique_key` makes this idempotent, so every
   * process start re-arms the schedule instead of duplicating it.
   */
  async scheduleRecurring(db: Database, type: string, intervalMs: number, payload: Record<string, unknown> = {}): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO jobs (type, payload, run_at, max_attempts, unique_key)
        VALUES (${type}, ${JSON.stringify(payload)}::jsonb, now(), 1, ${`recurring:${type}`})
        ON CONFLICT (unique_key) DO UPDATE
          SET run_at = LEAST(jobs.run_at, now() + (${String(intervalMs)} || ' milliseconds')::interval)
      `);
    } catch (error) {
      logger.warn({ err: error, type }, 'failed to schedule recurring job');
    }
  }
}
