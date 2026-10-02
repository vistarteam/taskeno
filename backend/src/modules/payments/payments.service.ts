import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { ERROR_CODES, type PaymentPurpose } from '@taskeno/contracts';
import { AppError, conflict } from '../../common/errors';
import { AuditService } from '../../common/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { logger } from '../../common/logger';
import type { ActorContext } from '../../common/types';
import { env } from '../../config/env';
import { journals, paymentEvents, payments } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { WalletService } from '../wallet/wallet.service';
import { createPaymentProvider, type PaymentProvider } from './payment-provider';

export type CallbackInput = {
  authority?: string;
  status?: string;
  ip?: string;
  raw?: Record<string, unknown>;
};

/**
 * Payments.
 *
 * The only path to "paid" runs through `settle`, which is:
 *  1. recorded raw in `payment_events` (never trusted, only evidence),
 *  2. verified server-to-server with the gateway,
 *  3. matched against the expected amount,
 *  4. settled inside one transaction together with the ledger posting.
 *
 * A callback is therefore never sufficient on its own, and replayed callbacks
 * are idempotent because the settlement keys off the payment row.
 */
@Injectable()
export class PaymentsService {
  private provider: PaymentProvider;

  constructor(
    private readonly dbService: DbService,
    private readonly wallet: WalletService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {
    this.provider = createPaymentProvider(env.PAYMENT_PROVIDER);
  }

  get providerKey(): string {
    return this.provider.key;
  }

  get providerName(): string {
    return this.provider.displayName;
  }

  /** Exposes the sandbox instance so the fake gateway page can pick an outcome. */
  get sandbox() {
    return this.provider.key === 'sandbox' ? (this.provider as unknown as { setOutcome: (a: string, o: 'success' | 'failure') => void }) : null;
  }

  private async expiryMinutes(): Promise<number> {
    return this.settings.getNumber('payments.expiry_minutes', env.PAYMENT_EXPIRY_MINUTES);
  }

  /* ------------------------------------------------------------------ */
  /* Intent creation                                                     */
  /* ------------------------------------------------------------------ */

  async createIntent(
    userId: string,
    input: { purpose: PaymentPurpose; amount: bigint; orderId?: string; idempotencyKey: string; description: string },
    actor: ActorContext,
  ) {
    // Replay: the same key returns the same intent instead of a second charge.
    const [existing] = await this.dbService.db
      .select()
      .from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      return {
        paymentId: existing.id,
        status: existing.status,
        redirectUrl: existing.redirectUrl,
        replayed: true,
        provider: this.providerName,
      };
    }

    const minutes = await this.expiryMinutes();
    const [payment] = await this.dbService.db
      .insert(payments)
      .values({
        userId,
        orderId: input.orderId ?? null,
        purpose: input.purpose,
        provider: this.provider.key,
        amount: input.amount,
        currency: env.CURRENCY,
        status: 'created',
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
      })
      .returning();

    const callbackUrl = `${env.APP_URL}/api/payments/callback/${this.provider.key}?paymentId=${payment.id}`;

    try {
      const result = await this.provider.createPayment({
        paymentId: payment.id,
        amount: input.amount,
        description: input.description,
        callbackUrl,
      });

      const [updated] = await this.dbService.db
        .update(payments)
        .set({
          status: 'pending',
          providerAuthority: result.authority,
          redirectUrl: result.redirectUrl,
          requestPayload: { authority: result.authority },
        })
        .where(eq(payments.id, payment.id))
        .returning();

      await this.audit.record(
        {
          actor,
          action: 'payment.intent_created',
          entityType: 'payment',
          entityId: payment.id,
          after: { purpose: input.purpose, amount: input.amount.toString(), provider: this.provider.key },
        },
      );

      return {
        paymentId: updated.id,
        status: updated.status,
        redirectUrl: updated.redirectUrl,
        replayed: false,
        provider: this.providerName,
      };
    } catch (error) {
      await this.dbService.db
        .update(payments)
        .set({ status: 'failed', failureCode: 'PROVIDER_UNAVAILABLE', failureMessage: String((error as Error).message).slice(0, 300) })
        .where(eq(payments.id, payment.id));
      logger.error({ err: error, paymentId: payment.id }, 'failed to create gateway payment');
      throw new AppError(ERROR_CODES.PAYMENT_PROVIDER_UNAVAILABLE, { status: 502 });
    }
  }

  /** Charges the buyer through the gateway to fund an order into escrow. */
  async createOrderPayment(userId: string, orderId: string, idempotencyKey: string, actor: ActorContext) {
    const order = await this.orders.findByIdOrCode(orderId);
    if (order.buyerId !== userId) throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });
    if (order.status === 'paid') throw conflict(ERROR_CODES.ORDER_ALREADY_PAID);
    if (order.status !== 'pending_payment') throw conflict(ERROR_CODES.ORDER_NOT_PAYABLE);

    return this.createIntent(
      userId,
      {
        purpose: 'order_payment',
        amount: order.total,
        orderId: order.id,
        idempotencyKey,
        description: `پرداخت سفارش ${order.code}`,
      },
      actor,
    );
  }

  /* ------------------------------------------------------------------ */
  /* Callback + settlement                                               */
  /* ------------------------------------------------------------------ */

  async handleCallback(input: CallbackInput, providerKey: string) {
    const authority = input.authority;

    // Evidence first: every callback is stored, valid or not.
    const [payment] = authority
      ? await this.dbService.db.select().from(payments).where(eq(payments.providerAuthority, authority)).limit(1)
      : [];

    await this.dbService.db.insert(paymentEvents).values({
      paymentId: payment?.id ?? null,
      source: 'callback',
      payload: { ...(input.raw ?? {}), status: input.status ?? null },
      signatureValid: null,
      ip: input.ip ?? null,
    });

    if (!payment) {
      logger.warn({ authority, providerKey }, 'callback for unknown payment authority');
      return { ok: false, code: ERROR_CODES.PAYMENT_NOT_FOUND, paymentId: null, orderId: null };
    }

    if (payment.status === 'succeeded') {
      // Replayed callback: report the same outcome without touching the ledger.
      return { ok: true, code: 'ALREADY_SETTLED', paymentId: payment.id, orderId: payment.orderId, replayed: true };
    }

    if (payment.expiresAt.getTime() < Date.now()) {
      await this.dbService.db.update(payments).set({ status: 'expired' }).where(eq(payments.id, payment.id));
      return { ok: false, code: ERROR_CODES.PAYMENT_EXPIRED, paymentId: payment.id, orderId: payment.orderId };
    }

    // The gateway decides, not the query string.
    const verification = await this.provider.verifyPayment({
      authority: authority!,
      amount: payment.amount,
    });

    await this.dbService.db.insert(paymentEvents).values({
      paymentId: payment.id,
      source: 'verify',
      payload: (verification.raw ?? {}) as Record<string, unknown>,
      signatureValid: verification.ok,
      ip: input.ip ?? null,
    });

    if (!verification.ok) {
      await this.dbService.db
        .update(payments)
        .set({
          status: 'failed',
          failureCode: verification.errorCode ?? 'VERIFY_FAILED',
          failureMessage: verification.errorMessage?.slice(0, 300) ?? null,
          verifyPayload: (verification.raw ?? {}) as Record<string, unknown>,
        })
        .where(eq(payments.id, payment.id));

      await this.notifications.notify(this.dbService.db, {
        userId: payment.userId,
        type: 'payment.failed',
        entityType: 'payment',
        entityId: payment.id,
      });

      return { ok: false, code: ERROR_CODES.PAYMENT_VERIFICATION_FAILED, paymentId: payment.id, orderId: payment.orderId };
    }

    if (verification.amount !== undefined && verification.amount !== payment.amount) {
      await this.dbService.db
        .update(payments)
        .set({ status: 'failed', failureCode: 'AMOUNT_MISMATCH' })
        .where(eq(payments.id, payment.id));
      logger.error(
        { paymentId: payment.id, expected: payment.amount.toString(), received: verification.amount.toString() },
        'payment amount mismatch — possible tampering',
      );
      return { ok: false, code: ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, paymentId: payment.id, orderId: payment.orderId };
    }

    return this.settle(payment.id, verification.reference ?? null, input.ip);
  }

  /**
   * Settles a verified payment: gateway state, ledger posting and (for order
   * payments) the order transition, all in one transaction.
   */
  private async settle(paymentId: string, reference: string | null, ip?: string) {
    return this.dbService.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for('update');
      if (!payment) throw new AppError(ERROR_CODES.PAYMENT_NOT_FOUND, { status: 404 });

      // Double settlement guard: the row lock above serialises concurrent callbacks.
      if (payment.status === 'succeeded') {
        return { ok: true, code: 'ALREADY_SETTLED', paymentId: payment.id, orderId: payment.orderId, replayed: true };
      }

      await tx
        .update(payments)
        .set({
          status: 'succeeded',
          paidAt: new Date(),
          verifiedAt: new Date(),
          providerReference: reference,
        })
        .where(eq(payments.id, payment.id));

      await tx.insert(paymentEvents).values({
        paymentId: payment.id,
        source: 'settlement',
        payload: { reference, ip: ip ?? null },
        signatureValid: true,
      });

      if (payment.purpose === 'deposit') {
        await this.wallet.creditGatewayDeposit(tx, {
          userId: payment.userId,
          amount: payment.amount,
          paymentId: payment.id,
        });
      } else if (payment.purpose === 'order_payment' && payment.orderId) {
        const order = await this.orders.loadOrderRow(tx, payment.orderId);

        await this.wallet.holdOrderPayment(tx, {
          orderId: order.id,
          orderCode: order.code,
          buyerId: order.buyerId,
          amount: order.total,
          paymentId: payment.id,
        });

        await this.orders.markPaid(
          tx,
          order,
          { userId: payment.userId, roles: [], requestId: `payment:${payment.id}` },
          this.provider.key,
        );
      }

      await this.notifications.notify(tx, {
        userId: payment.userId,
        type: 'payment.succeeded',
        payload: { amount: payment.amount.toString(), amountToman: (payment.amount / 10n).toString() },
        entityType: 'payment',
        entityId: payment.id,
      });

      await this.outbox.publish(tx, {
        type: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        payload: { purpose: payment.purpose, amount: payment.amount.toString() },
      });

      return { ok: true, code: 'SETTLED', paymentId: payment.id, orderId: payment.orderId };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Reads / maintenance                                                 */
  /* ------------------------------------------------------------------ */

  async statusForUser(userId: string, paymentId: string) {
    const [payment] = await this.dbService.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.userId, userId)))
      .limit(1);
    if (!payment) throw new AppError(ERROR_CODES.PAYMENT_NOT_FOUND, { status: 404 });

    return {
      id: payment.id,
      status: payment.status,
      purpose: payment.purpose,
      amount: payment.amount.toString(),
      orderId: payment.orderId,
      provider: payment.provider,
      redirectUrl: payment.redirectUrl,
      failureMessage: payment.failureMessage,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
    };
  }

  async listForUser(userId: string, limit = 20) {
    const rows = await this.dbService.db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      purpose: row.purpose,
      amount: row.amount.toString(),
      orderId: row.orderId,
      provider: row.provider,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
    }));
  }

  /** Job: close intents whose window elapsed so they cannot be settled later. */
  async expireStale(limit = 100): Promise<number> {
    const rows = await this.dbService.db
      .update(payments)
      .set({ status: 'expired' })
      .where(and(inArray(payments.status, ['created', 'pending']), lt(payments.expiresAt, new Date())))
      .returning({ id: payments.id });
    return rows.length;
  }

  /**
   * Job: a successful payment must always have produced a ledger posting.
   * Any row that cannot be matched is a critical inconsistency and is logged
   * loudly so it can be repaired with a compensating journal.
   */
  async reconcile(): Promise<{ checked: number; withoutJournal: string[] }> {
    const succeeded = await this.dbService.db
      .select({ id: payments.id, purpose: payments.purpose, orderId: payments.orderId, userId: payments.userId })
      .from(payments)
      .where(and(eq(payments.status, 'succeeded'), eq(payments.purpose, 'deposit')))
      .orderBy(desc(payments.createdAt))
      .limit(500);

    const keys = succeeded.map((payment) => `deposit:${payment.id}`);
    if (keys.length === 0) return { checked: 0, withoutJournal: [] };

    const found = await this.dbService.db
      .select({ key: journals.idempotencyKey })
      .from(journals)
      .where(inArray(journals.idempotencyKey, keys));
    const foundKeys = new Set(found.map((row) => row.key));

    const withoutJournal = succeeded.filter((payment) => !foundKeys.has(`deposit:${payment.id}`)).map((payment) => payment.id);

    if (withoutJournal.length > 0) {
      logger.error({ withoutJournal }, 'PAYMENT RECONCILIATION FAILED: succeeded payments without ledger postings');
    }

    return { checked: succeeded.length, withoutJournal };
  }

  async sandboxComplete(authority: string, outcome: 'success' | 'failure'): Promise<{ ok: boolean }> {
    if (env.PAYMENT_PROVIDER !== 'sandbox') {
      throw new AppError(ERROR_CODES.FEATURE_DISABLED, { status: 403 });
    }
    const sandbox = this.provider as unknown as { setOutcome: (a: string, o: 'success' | 'failure') => void };
    sandbox.setOutcome(authority, outcome);
    return { ok: true };
  }

  /** Recorded intent for the sandbox gateway page (no auth: it is a fake page). */
  async intentByAuthority(authority: string) {
    const [row] = await this.dbService.db
      .select({
        id: payments.id,
        amount: payments.amount,
        status: payments.status,
        purpose: payments.purpose,
        provider: payments.provider,
      })
      .from(payments)
      .where(eq(payments.providerAuthority, authority))
      .limit(1);
    if (!row) throw new AppError(ERROR_CODES.PAYMENT_NOT_FOUND, { status: 404 });
    return {
      paymentId: row.id,
      amount: row.amount.toString(),
      amountToman: (row.amount / 10n).toString(),
      status: row.status,
      purpose: row.purpose,
    };
  }

  /** Admin: aggregate figures for the dashboard. */
  async totals() {
    const [row] = await this.dbService.db
      .select({
        succeeded: sql<string>`coalesce(sum(case when ${payments.status} = 'succeeded' then ${payments.amount} else 0 end), 0)`,
        failed: sql<string>`count(*) filter (where ${payments.status} = 'failed')`,
        pending: sql<string>`count(*) filter (where ${payments.status} in ('created','pending'))`,
      })
      .from(payments);
    return {
      succeeded: BigInt(row?.succeeded ?? '0').toString(),
      failed: Number(row?.failed ?? 0),
      pending: Number(row?.pending ?? 0),
    };
  }

  async recent(limit = 50) {
    const rows = await this.dbService.db
      .select({
        id: payments.id,
        userId: payments.userId,
        orderId: payments.orderId,
        purpose: payments.purpose,
        provider: payments.provider,
        status: payments.status,
        amount: payments.amount,
        createdAt: payments.createdAt,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .orderBy(desc(payments.createdAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, amount: row.amount.toString() }));
  }
}
