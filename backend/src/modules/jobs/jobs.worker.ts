import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { env } from '../../config/env';
import { logger } from '../../common/logger';
import { jobs, outboxEvents } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { SessionService } from '../auth/session.service';
import { LedgerService } from '../wallet/ledger.service';

type JobHandler = (payload: Record<string, unknown>) => Promise<string | void>;

/** Recurring maintenance jobs and how often they run. */
const RECURRING: Array<{ type: string; intervalMs: number }> = [
  { type: 'expire_payments', intervalMs: 5 * 60 * 1000 },
  { type: 'auto_complete_orders', intervalMs: 10 * 60 * 1000 },
  { type: 'cancel_expired_acceptances', intervalMs: 30 * 60 * 1000 },
  { type: 'reconcile_payments', intervalMs: 60 * 60 * 1000 },
  { type: 'reconcile_ledger', intervalMs: 6 * 60 * 60 * 1000 },
  { type: 'dispatch_outbox', intervalMs: 30 * 1000 },
  { type: 'purge_sessions', intervalMs: 24 * 60 * 60 * 1000 },
];

/**
 * Background worker.
 *
 * Runs as a separate process from the API so slow work (gateway
 * reconciliation, bulk expiry) can never delay a request. The queue lives in
 * PostgreSQL and is claimed with `FOR UPDATE SKIP LOCKED`, so several workers
 * can run side by side without duplicating a job — and the MVP needs no Redis.
 */
@Injectable()
export class JobsWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private ticking = false;
  private readonly workerId = `worker-${process.pid}`;

  constructor(
    private readonly dbService: DbService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly sessions: SessionService,
  ) {}

  private get handlers(): Record<string, JobHandler> {
    return {
      expire_payments: async () => {
        const expired = await this.payments.expireStale();
        return `expired=${expired}`;
      },
      auto_complete_orders: async () => {
        const due = await this.orders.findDueForAutoComplete();
        for (const order of due) {
          await this.orders.autoComplete(order.id);
        }
        return `completed=${due.length}`;
      },
      cancel_expired_acceptances: async () => {
        const overdue = await this.orders.findExpiredAcceptDeadlines();
        for (const order of overdue) {
          await this.orders.systemCancel(order.id, 'مهلت پذیرش سفارش به پایان رسید');
        }
        return `cancelled=${overdue.length}`;
      },
      reconcile_payments: async () => {
        const result = await this.payments.reconcile();
        return `checked=${result.checked} missing=${result.withoutJournal.length}`;
      },
      reconcile_ledger: async () => {
        const result = await this.ledger.reconcile();
        return `checked=${result.checked} mismatches=${result.mismatches.length}`;
      },
      dispatch_outbox: async () => {
        const rows = await this.dbService.db
          .select({ id: outboxEvents.id, eventType: outboxEvents.eventType })
          .from(outboxEvents)
          .where(and(eq(outboxEvents.status, 'pending'), lte(outboxEvents.availableAt, new Date())))
          .orderBy(asc(outboxEvents.createdAt))
          .limit(100);

        for (const row of rows) {
          // In-app notifications are written inside the originating transaction.
          // This dispatcher is the seam where email/SMS/Telegram delivery hooks
          // in once those providers are configured.
          await this.dbService.db
            .update(outboxEvents)
            .set({ status: 'dispatched', dispatchedAt: new Date() })
            .where(eq(outboxEvents.id, row.id));
        }
        return `dispatched=${rows.length}`;
      },
      purge_sessions: async () => {
        const removed = await this.sessions.purgeExpired();
        return `removed=${removed}`;
      },
    };
  }

  async onModuleInit(): Promise<void> {
    for (const job of RECURRING) {
      await this.arm(job.type, job.intervalMs, true);
    }
    logger.info({ jobs: RECURRING.map((job) => job.type) }, 'worker started');
    this.timer = setInterval(() => {
      void this.tick();
    }, env.JOBS_POLL_INTERVAL_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Creates the singleton row for a recurring job, or brings its next run forward. */
  private async arm(type: string, intervalMs: number, onlyIfMissing = false): Promise<void> {
    const runAt = new Date(Date.now() + (onlyIfMissing ? 5_000 : intervalMs));
    await this.dbService.db.execute(sql`
      insert into jobs (type, payload, run_at, max_attempts, unique_key)
      values (${type}, '{}'::jsonb, ${runAt}, 3, ${`recurring:${type}`})
      on conflict (unique_key) do update
        set run_at = case when ${onlyIfMissing} then jobs.run_at else excluded.run_at end,
            status = 'queued',
            attempts = 0
    `);
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.ticking) return;
    this.ticking = true;

    try {
      const claimed = await this.dbService.transaction(async (tx) => {
        const rows = await tx
          .select({ id: jobs.id, type: jobs.type, payload: jobs.payload, attempts: jobs.attempts })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), lte(jobs.runAt, new Date())))
          .orderBy(asc(jobs.runAt))
          .limit(env.JOBS_BATCH_SIZE)
          .for('update', { skipLocked: true });

        if (rows.length === 0) return [];

        for (const row of rows) {
          await tx
            .update(jobs)
            .set({ status: 'running', lockedAt: new Date(), lockedBy: this.workerId, attempts: row.attempts + 1 })
            .where(eq(jobs.id, row.id));
        }
        return rows;
      });

      for (const job of claimed) {
        await this.run(job);
      }
    } catch (error) {
      logger.error({ err: error }, 'worker tick failed');
    } finally {
      this.ticking = false;
    }
  }

  private async run(job: { id: string; type: string; payload: Record<string, unknown>; attempts: number }): Promise<void> {
    const handler = this.handlers[job.type];
    const recurring = RECURRING.find((entry) => entry.type === job.type);

    if (!handler) {
      await this.dbService.db
        .update(jobs)
        .set({ status: 'failed', lastError: `no handler for ${job.type}`, finishedAt: new Date() })
        .where(eq(jobs.id, job.id));
      logger.error({ type: job.type }, 'job without handler');
      return;
    }

    try {
      const summary = await handler(job.payload);
      await this.dbService.db
        .update(jobs)
        .set({ status: 'done', finishedAt: new Date(), lastError: null })
        .where(eq(jobs.id, job.id));

      if (summary) logger.debug({ type: job.type, summary }, 'job completed');
    } catch (error) {
      const attempts = job.attempts + 1;
      const lastError = String((error as Error).message ?? error).slice(0, 500);
      logger.error({ err: error, type: job.type, attempts }, 'job failed');

      await this.dbService.db
        .update(jobs)
        .set({ status: attempts >= 3 ? 'failed' : 'queued', lastError, finishedAt: new Date(), runAt: new Date(Date.now() + 60_000) })
        .where(eq(jobs.id, job.id));
    } finally {
      // Recurring jobs re-arm themselves regardless of the outcome, so a single
      // failure never stops the schedule.
      if (recurring) {
        await this.arm(recurring.type, recurring.intervalMs);
      }
    }
  }
}
