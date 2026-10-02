import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { ERROR_CODES, formatToman, toToman } from '@taskeno/contracts';
import { AppError, conflict } from '../../common/errors';
import { AuditService } from '../../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildPage, cursorCondition, decodeCursor, resolveLimit } from '../../common/pagination';
import type { ActorContext } from '../../common/types';
import type { Database } from '../../db/client';
import { journals, ledgerEntries, profiles, wallets } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { SettingsService } from '../settings/settings.service';
import { LedgerService } from './ledger.service';

export type WalletSummary = {
  balance: string;
  balanceToman: string;
  currency: string;
  transfersEnabled: boolean;
  withdrawalsEnabled: boolean;
  dailyTransferLimit: string;
  dailyTransferUsed: string;
};

/**
 * Wallet use cases.
 *
 * Every method here is a thin layer over `LedgerService.post`: the wallet never
 * mutates a balance directly. Each use case names its money movement, which is
 * what makes the ledger readable and auditable.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly dbService: DbService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Reads                                                               */
  /* ------------------------------------------------------------------ */

  async summary(userId: string): Promise<WalletSummary> {
    const wallet = await this.ledger.userWallet(userId);
    const [transfersEnabled, withdrawalsEnabled, dailyLimit] = await Promise.all([
      this.settings.getBoolean('wallet.p2p_transfers.enabled', false),
      this.settings.getBoolean('wallet.withdrawals.enabled', false),
      this.settings.getBigInt('wallet.transfer.daily_limit', 50_000_000n),
    ]);
    const used = await this.dailyTransferTotal(userId);

    return {
      balance: wallet.balance.toString(),
      balanceToman: formatToman(wallet.balance),
      currency: wallet.currency,
      transfersEnabled,
      withdrawalsEnabled,
      dailyTransferLimit: dailyLimit.toString(),
      dailyTransferUsed: used.toString(),
    };
  }

  /** Ledger-backed transaction history, newest first. */
  async transactions(
    userId: string,
    query: { limit?: number; cursor?: string; kind?: string; direction?: string },
  ) {
    const wallet = await this.ledger.userWallet(userId);
    const limit = resolveLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const conditions = [
      eq(ledgerEntries.walletId, wallet.id),
      cursorCondition(ledgerEntries.createdAt, ledgerEntries.id, cursor),
      query.kind ? eq(journals.kind, query.kind as never) : undefined,
      query.direction ? eq(ledgerEntries.direction, query.direction as never) : undefined,
    ].filter(Boolean);

    const rows = await this.dbService.db
      .select({
        id: ledgerEntries.id,
        journalId: journals.id,
        kind: journals.kind,
        direction: ledgerEntries.direction,
        amount: ledgerEntries.amount,
        balanceAfter: ledgerEntries.balanceAfter,
        memo: journals.memo,
        referenceType: journals.referenceType,
        referenceId: journals.referenceId,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .innerJoin(journals, eq(journals.id, ledgerEntries.journalId))
      .where(and(...conditions))
      .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
      .limit(limit + 1);

    const page = buildPage(
      rows.map((row) => ({ ...row, id: row.id, createdAt: row.createdAt })),
      limit,
    );

    return {
      items: page.items.map((row) => ({
        id: row.id,
        kind: row.kind,
        direction: row.direction,
        amount: row.amount.toString(),
        amountToman: formatToman(row.amount),
        balanceAfter: row.balanceAfter.toString(),
        balanceAfterToman: formatToman(row.balanceAfter),
        memo: row.memo,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async dailyTransferTotal(userId: string): Promise<bigint> {
    const wallet = await this.ledger.userWallet(userId);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [row] = await this.dbService.db
      .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
      .from(ledgerEntries)
      .innerJoin(journals, eq(journals.id, ledgerEntries.journalId))
      .where(
        and(
          eq(ledgerEntries.walletId, wallet.id),
          eq(ledgerEntries.direction, 'debit'),
          eq(journals.kind, 'transfer'),
          gte(ledgerEntries.createdAt, startOfDay),
        ),
      );
    return BigInt(row?.total ?? '0');
  }

  /* ------------------------------------------------------------------ */
  /* Use cases (called from inside business transactions)                */
  /* ------------------------------------------------------------------ */

  /** Funds received from the payment gateway. */
  async creditGatewayDeposit(
    tx: Database,
    input: { userId: string; amount: bigint; paymentId: string },
  ): Promise<void> {
    const [userWallet, clearing] = await Promise.all([
      this.ledger.userWallet(input.userId, tx),
      this.ledger.platformWallet('GATEWAY_CLEARING', tx),
    ]);

    await this.ledger.post(tx, {
      kind: 'deposit',
      idempotencyKey: `deposit:${input.paymentId}`,
      referenceType: 'payment',
      referenceId: input.paymentId,
      memo: 'شارژ کیف پول از درگاه پرداخت',
      postings: [
        { walletId: clearing.id, direction: 'debit', amount: input.amount },
        { walletId: userWallet.id, direction: 'credit', amount: input.amount },
      ],
    });

    await this.notifications.notify(tx, {
      userId: input.userId,
      type: 'wallet.deposit',
      payload: { amount: input.amount.toString(), amountToman: toToman(input.amount).toString() },
      entityType: 'payment',
      entityId: input.paymentId,
    });
  }

  /** Buyer funds the order; the money is held by Taskeno until completion. */
  async holdOrderPayment(
    tx: Database,
    input: { orderId: string; orderCode: string; buyerId: string; amount: bigint; paymentId: string },
  ): Promise<void> {
    const [buyerWallet, escrow] = await Promise.all([
      this.ledger.userWallet(input.buyerId, tx),
      this.ledger.platformWallet('ESCROW', tx),
    ]);

    await this.ledger.post(tx, {
      kind: 'order_payment',
      idempotencyKey: `order:${input.orderId}:payment`,
      referenceType: 'order',
      referenceId: input.orderId,
      memo: `پرداخت سفارش ${input.orderCode}`,
      postings: [
        { walletId: buyerWallet.id, direction: 'debit', amount: input.amount },
        { walletId: escrow.id, direction: 'credit', amount: input.amount },
      ],
    });
  }

  /**
   * Order completed: release escrow to the provider minus Taskeno's commission.
   * One journal, three wallets, always balanced.
   */
  async releaseEscrow(
    tx: Database,
    input: { orderId: string; orderCode: string; providerId: string; total: bigint; commission: bigint },
  ): Promise<void> {
    const [escrow, providerWallet, revenue] = await Promise.all([
      this.ledger.platformWallet('ESCROW', tx),
      this.ledger.userWallet(input.providerId, tx),
      this.ledger.platformWallet('REVENUE', tx),
    ]);

    const net = input.total - input.commission;

    // A single balanced journal: escrow is debited by the full amount and the
    // credits split between the provider (net) and Taskeno (commission).
    // Splitting this into two journals would credit the platform twice.
    const postings: Parameters<LedgerService['post']>[1]['postings'] = [
      { walletId: escrow.id, direction: 'debit', amount: input.total },
    ];
    if (net > 0n) postings.push({ walletId: providerWallet.id, direction: 'credit', amount: net });
    if (input.commission > 0n) postings.push({ walletId: revenue.id, direction: 'credit', amount: input.commission });

    if (postings.length < 2) {
      throw new AppError(ERROR_CODES.LEDGER_UNBALANCED_JOURNAL, { details: { reason: 'nothing to release' } });
    }

    await this.ledger.post(tx, {
      kind: 'escrow_release',
      idempotencyKey: `order:${input.orderId}:release`,
      referenceType: 'order',
      referenceId: input.orderId,
      memo: `آزادسازی وجه سفارش ${input.orderCode} (کمیسیون ${input.commission.toString()} ریال)`,
      postings,
    });
  }

  /** Order cancelled or refunded: escrow returns to the buyer. */
  async refundFromEscrow(
    tx: Database,
    input: { orderId: string; orderCode: string; buyerId: string; amount: bigint; memo: string },
  ): Promise<void> {
    const [escrow, buyerWallet] = await Promise.all([
      this.ledger.platformWallet('ESCROW', tx),
      this.ledger.userWallet(input.buyerId, tx),
    ]);

    await this.ledger.post(tx, {
      kind: 'refund',
      idempotencyKey: `order:${input.orderId}:refund`,
      referenceType: 'order',
      referenceId: input.orderId,
      memo: `${input.memo} — سفارش ${input.orderCode}`,
      postings: [
        { walletId: escrow.id, direction: 'debit', amount: input.amount },
        { walletId: buyerWallet.id, direction: 'credit', amount: input.amount },
      ],
    });
  }

  /**
   * Member-to-member transfer.
   *
   * Gated by a setting because moving stored value between users is a regulated
   * activity. Also limited per day to contain abuse of a compromised account.
   */
  async transfer(
    actor: ActorContext,
    input: { fromUserId: string; toUsername: string; amount: bigint; note?: string; idempotencyKey: string },
  ) {
    const enabled = await this.settings.getBoolean('wallet.p2p_transfers.enabled', false);
    if (!enabled) throw new AppError(ERROR_CODES.WALLET_TRANSFER_DISABLED, { status: 409 });

    const [recipient] = await this.dbService.db
      .select({ userId: profiles.userId, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.username, input.toUsername))
      .limit(1);
    if (!recipient) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });
    if (recipient.userId === input.fromUserId) throw conflict(ERROR_CODES.WALLET_TRANSFER_SELF);

    const limit = await this.settings.getBigInt('wallet.transfer.daily_limit', 50_000_000n);
    const usedToday = await this.dailyTransferTotal(input.fromUserId);
    if (usedToday + input.amount > limit) {
      throw conflict(ERROR_CODES.WALLET_TRANSFER_LIMIT_EXCEEDED);
    }

    return this.dbService.transaction(async (tx) => {
      const [fromWallet, toWallet] = await Promise.all([
        this.ledger.userWallet(input.fromUserId, tx),
        this.ledger.userWallet(recipient.userId, tx),
      ]);

      const result = await this.ledger.post(tx, {
        kind: 'transfer',
        idempotencyKey: input.idempotencyKey,
        referenceType: 'user',
        referenceId: recipient.userId,
        memo: input.note ?? 'انتقال داخلی',
        createdBy: input.fromUserId,
        requestId: actor.requestId,
        postings: [
          { walletId: fromWallet.id, direction: 'debit', amount: input.amount },
          { walletId: toWallet.id, direction: 'credit', amount: input.amount },
        ],
      });

      if (!result.replayed) {
        const toman = toToman(input.amount).toString();
        await this.notifications.notify(tx, {
          userId: recipient.userId,
          type: 'wallet.transfer_in',
          payload: { amount: input.amount.toString(), amountToman: toman },
          entityType: 'user',
          entityId: input.fromUserId,
        });
        await this.notifications.notify(tx, {
          userId: input.fromUserId,
          type: 'wallet.transfer_out',
          payload: { amount: input.amount.toString(), amountToman: toman },
          entityType: 'user',
          entityId: recipient.userId,
        });
        await this.audit.record(
          {
            actor,
            action: 'wallet.transfer',
            entityType: 'user',
            entityId: input.fromUserId,
            after: { to: input.toUsername, amount: input.amount.toString() },
          },
          tx,
        );
      }

      return { journalId: result.journalId, replayed: result.replayed };
    });
  }

  /**
   * Manual correction by support/admin. Always needs a reason and is written to
   * the audit trail; a compensating journal is the only way to fix a mistake.
   */
  async adminAdjust(
    actor: ActorContext,
    input: { userId: string; amount: bigint; reason: string; idempotencyKey?: string },
  ) {
    if (input.amount === 0n) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: 'مبلغ اصلاح نمی‌تواند صفر باشد.' });
    }

    return this.dbService.transaction(async (tx) => {
      const [userWallet, adjustment] = await Promise.all([
        this.ledger.userWallet(input.userId, tx),
        this.ledger.platformWallet('ADJUSTMENT', tx),
      ]);

      const magnitude = input.amount < 0n ? -input.amount : input.amount;
      const creditUser = input.amount > 0n;

      const result = await this.ledger.post(tx, {
        kind: 'adjustment',
        idempotencyKey:
          input.idempotencyKey ?? `adjustment:${input.userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        referenceType: 'user',
        referenceId: input.userId,
        memo: input.reason,
        createdBy: actor.userId,
        requestId: actor.requestId,
        postings: creditUser
          ? [
              { walletId: adjustment.id, direction: 'debit', amount: magnitude },
              { walletId: userWallet.id, direction: 'credit', amount: magnitude },
            ]
          : [
              { walletId: userWallet.id, direction: 'debit', amount: magnitude },
              { walletId: adjustment.id, direction: 'credit', amount: magnitude },
            ],
      });

      await this.notifications.notify(tx, {
        userId: input.userId,
        type: 'wallet.adjustment',
        payload: { amount: input.amount.toString() },
        entityType: 'user',
        entityId: input.userId,
      });

      await this.audit.record(
        {
          actor,
          action: 'wallet.adjustment',
          entityType: 'user',
          entityId: input.userId,
          after: { amount: input.amount.toString(), reason: input.reason, journalId: result.journalId },
        },
        tx,
      );

      return { journalId: result.journalId };
    });
  }

  /** Wallet lookup helper for other modules (orders, payments). */
  async walletIdFor(userId: string, tx?: Database): Promise<string> {
    return (await this.ledger.userWallet(userId, tx)).id;
  }

  async ensureWallets(userId: string): Promise<void> {
    await this.ledger.userWallet(userId);
  }

  /** Read-only view used by the admin ledger explorer. */
  async walletOverview(userId: string) {
    const wallet = await this.ledger.userWallet(userId);
    const ledgerBalance = await this.ledger.ledgerBalanceOf(wallet.id);
    return {
      walletId: wallet.id,
      balance: wallet.balance.toString(),
      ledgerBalance: ledgerBalance.toString(),
      consistent: ledgerBalance === wallet.balance,
      currency: wallet.currency,
    };
  }

  async walletRow(userId: string) {
    return this.ledger.userWallet(userId);
  }
}
