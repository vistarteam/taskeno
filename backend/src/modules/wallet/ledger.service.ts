import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  ERROR_CODES,
  type JournalKind,
  type LedgerDirection,
  type PlatformWalletCode,
} from '@taskeno/contracts';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { env } from '../../config/env';
import type { Database } from '../../db/client';
import { journals, ledgerEntries, wallets } from '../../db/schema';
import { DbService } from '../../db/db.service';

export type Posting = {
  walletId: string;
  /** `debit` takes money out of this wallet, `credit` puts money in. */
  direction: LedgerDirection;
  amount: bigint;
};

export type JournalInput = {
  kind: JournalKind;
  postings: Posting[];
  /** Unique per money movement: the database rejects a duplicate posting. */
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string | null;
  memo?: string;
  createdBy?: string | null;
  requestId?: string;
};

export type JournalResult = {
  journalId: string;
  /** True when this exact movement had already been recorded. */
  replayed: boolean;
  balances: Array<{ walletId: string; balanceBefore: bigint; balanceAfter: bigint }>;
};

export type ReconciliationRow = {
  walletId: string;
  code: string | null;
  ownerType: string;
  cachedBalance: bigint;
  ledgerBalance: bigint;
  consistent: boolean;
};

/**
 * Double-entry ledger.
 *
 * Rules enforced here (and again by the database):
 *  - every journal contains at least two postings whose debits equal credits,
 *  - money is never created or destroyed, only moved between wallets,
 *  - a wallet row is locked before its balance is read and written, so two
 *    concurrent payments cannot both spend the same funds,
 *  - an idempotency key makes a retried request a no-op instead of a double
 *    spend,
 *  - a user wallet can never go negative,
 *  - entries are append-only; corrections are compensating journals.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly dbService: DbService) {}

  /** Platform wallet that exists for the lifetime of the installation. */
  async platformWallet(code: PlatformWalletCode, tx?: Database) {
    const db = tx ?? this.dbService.db;
    const [wallet] = await db.select().from(wallets).where(eq(wallets.code, code)).limit(1);
    if (wallet) return wallet;

    const [created] = await db
      .insert(wallets)
      .values({ ownerType: 'platform', code, currency: env.CURRENCY, balance: 0n })
      .onConflictDoNothing({ target: wallets.code })
      .returning();

    if (created) return created;
    const [existing] = await db.select().from(wallets).where(eq(wallets.code, code)).limit(1);
    return existing;
  }

  /** User wallet, created on first use so no code path can hit a missing row. */
  async userWallet(userId: string, tx?: Database) {
    const db = tx ?? this.dbService.db;
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.ownerType, 'user'), eq(wallets.ownerId, userId), eq(wallets.currency, env.CURRENCY)))
      .limit(1);
    if (wallet) return wallet;

    const [created] = await db
      .insert(wallets)
      .values({ ownerType: 'user', ownerId: userId, currency: env.CURRENCY, balance: 0n })
      .onConflictDoNothing({ target: [wallets.ownerType, wallets.ownerId, wallets.currency] })
      .returning();

    if (created) return created;

    const [existing] = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.ownerType, 'user'), eq(wallets.ownerId, userId), eq(wallets.currency, env.CURRENCY)))
      .limit(1);
    return existing;
  }

  /**
   * Posts a balanced journal inside the caller's transaction.
   *
   * The caller must pass a transaction: this method intentionally has no
   * "auto-commit" mode, because a money movement that is not part of a larger
   * business transaction is almost always a bug.
   */
  async post(tx: Database, input: JournalInput): Promise<JournalResult> {
    if (input.postings.length < 2) {
      throw new AppError(ERROR_CODES.LEDGER_UNBALANCED_JOURNAL, {
        details: { reason: 'a journal needs at least two postings' },
      });
    }

    // 1. Idempotency: the unique index on `idempotency_key` is the real guard,
    //    this check turns the common retry case into a cheap read.
    const [existing] = await tx
      .select({ id: journals.id })
      .from(journals)
      .where(eq(journals.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      return { journalId: existing.id, replayed: true, balances: [] };
    }

    // 2. The journal must balance, in integer arithmetic.
    let debitTotal = 0n;
    let creditTotal = 0n;
    for (const posting of input.postings) {
      if (posting.amount <= 0n) {
        throw new AppError(ERROR_CODES.LEDGER_UNBALANCED_JOURNAL, {
          details: { reason: 'posting amount must be positive' },
        });
      }
      if (posting.direction === 'debit') debitTotal += posting.amount;
      else creditTotal += posting.amount;
    }
    if (debitTotal !== creditTotal) {
      throw new AppError(ERROR_CODES.LEDGER_UNBALANCED_JOURNAL, {
        details: { debit: debitTotal.toString(), credit: creditTotal.toString() },
      });
    }

    // 3. Lock every affected wallet in ascending id order. A consistent order
    //    is what prevents deadlocks between two concurrent payments that touch
    //    the same pair of wallets in opposite directions.
    const walletIds = [...new Set(input.postings.map((posting) => posting.walletId))].sort();
    const locked = new Map<string, typeof wallets.$inferSelect>();
    for (const walletId of walletIds) {
      const [row] = await tx.select().from(wallets).where(eq(wallets.id, walletId)).limit(1).for('update');
      if (!row) {
        throw new AppError(ERROR_CODES.WALLET_NOT_FOUND, { status: 404, details: { walletId } });
      }
      if (!row.isActive) {
        throw new AppError(ERROR_CODES.WALLET_NOT_FOUND, { status: 409, details: { walletId, reason: 'inactive' } });
      }
      locked.set(walletId, row);
    }

    // 4. A journal may hold at most one entry per wallet and direction (the
    //    database enforces the same rule). Rejecting it here yields a clear
    //    error instead of a unique-violation from the driver.
    const seen = new Set<string>();
    for (const posting of input.postings) {
      const key = `${posting.walletId}:${posting.direction}`;
      if (seen.has(key)) {
        throw new AppError(ERROR_CODES.LEDGER_UNBALANCED_JOURNAL, {
          details: { reason: 'duplicate posting for the same wallet and direction' },
        });
      }
      seen.add(key);
    }

    // 5. Net effect per wallet, with an explicit overdraft check for user
    //    wallets (platform wallets may legitimately hold transient negatives).
    const netDelta = new Map<string, bigint>();
    for (const posting of input.postings) {
      const wallet = locked.get(posting.walletId)!;
      const delta = posting.direction === 'credit' ? posting.amount : -posting.amount;
      const accumulated = (netDelta.get(posting.walletId) ?? 0n) + delta;
      netDelta.set(posting.walletId, accumulated);

      if (wallet.ownerType === 'user' && wallet.balance + accumulated < 0n) {
        throw new AppError(ERROR_CODES.WALLET_INSUFFICIENT_FUNDS, { status: 409 });
      }
    }

    // 6. Write the journal header, then its entries chained in order so each
    //    row's balance_after matches the database check constraint.
    const [journal] = await tx
      .insert(journals)
      .values({
        kind: input.kind,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        idempotencyKey: input.idempotencyKey,
        memo: input.memo?.slice(0, 300) ?? null,
        createdBy: input.createdBy ?? null,
        requestId: input.requestId ?? null,
      })
      .returning();

    for (const walletId of walletIds) {
      const wallet = locked.get(walletId)!;
      let running = wallet.balance;
      for (const posting of input.postings.filter((item) => item.walletId === walletId)) {
        const after = posting.direction === 'credit' ? running + posting.amount : running - posting.amount;
        await tx.insert(ledgerEntries).values({
          journalId: journal.id,
          walletId,
          direction: posting.direction,
          amount: posting.amount,
          balanceBefore: running,
          balanceAfter: after,
        });
        running = after;
      }
    }

    // 7. Persist the cached balance (the projection the ledger was validated
    //    against). The deferred trigger re-checks balance at commit time.
    const balances: JournalResult['balances'] = [];
    for (const walletId of walletIds) {
      const wallet = locked.get(walletId)!;
      const after = wallet.balance + (netDelta.get(walletId) ?? 0n);
      await tx
        .update(wallets)
        .set({ balance: after, version: wallet.version + 1 })
        .where(eq(wallets.id, walletId));
      balances.push({ walletId, balanceBefore: wallet.balance, balanceAfter: after });
    }

    return { journalId: journal.id, replayed: false, balances };
  }

  async entriesForWallet(walletId: string, limit = 50) {
    return this.dbService.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, walletId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit);
  }

  /**
   * Sum of all ledger entries for one wallet. Must always equal the cached
   * `wallets.balance`; a mismatch means a code path bypassed the ledger.
   */
  async ledgerBalanceOf(walletId: string): Promise<bigint> {
    const [row] = await this.dbService.db
      .select({
        total: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amount} else -${ledgerEntries.amount} end), 0)`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, walletId));
    return BigInt(row?.total ?? '0');
  }

  /**
   * Compares every cached balance with the ledger. Run nightly, and after any
   * incident: this is the check that proves the books balance.
   */
  async reconcile(): Promise<{ checked: number; mismatches: ReconciliationRow[] }> {
    const db = this.dbService.db;
    const rows = await db
      .select({
        walletId: wallets.id,
        code: wallets.code,
        ownerType: wallets.ownerType,
        cachedBalance: wallets.balance,
        ledgerBalance: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amount} else -${ledgerEntries.amount} end), 0)`,
      })
      .from(wallets)
      .leftJoin(ledgerEntries, eq(ledgerEntries.walletId, wallets.id))
      .groupBy(wallets.id, wallets.code, wallets.ownerType, wallets.balance);

    const mismatches: ReconciliationRow[] = [];
    for (const row of rows) {
      const ledgerBalance = BigInt(row.ledgerBalance);
      if (ledgerBalance !== row.cachedBalance) {
        mismatches.push({
          walletId: row.walletId,
          code: row.code,
          ownerType: row.ownerType,
          cachedBalance: row.cachedBalance,
          ledgerBalance,
          consistent: false,
        });
      }
    }

    if (mismatches.length > 0) {
      logger.error({ mismatches: mismatches.length }, 'LEDGER RECONCILIATION FAILED');
    }

    return { checked: rows.length, mismatches };
  }

  /** Total debits must equal total credits across the whole ledger. */
  async assertGlobalBalance(): Promise<{ debit: bigint; credit: bigint; balanced: boolean }> {
    const [row] = await this.dbService.db
      .select({
        debit: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'debit' then ${ledgerEntries.amount} else 0 end), 0)`,
        credit: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amount} else 0 end), 0)`,
      })
      .from(ledgerEntries);
    const debit = BigInt(row?.debit ?? '0');
    const credit = BigInt(row?.credit ?? '0');
    return { debit, credit, balanced: debit === credit };
  }

  async recentJournals(limit = 50) {
    const rows = await this.dbService.db
      .select()
      .from(journals)
      .orderBy(desc(journals.createdAt))
      .limit(limit);

    if (rows.length === 0) return [];
    const entries = await this.dbService.db
      .select()
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.journalId, rows.map((row) => row.id)))
      .orderBy(asc(ledgerEntries.direction));
    return rows.map((journal) => ({
      ...journal,
      entries: entries.filter((entry) => entry.journalId === journal.id),
    }));
  }
}
