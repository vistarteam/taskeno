import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { wallets } from '../src/db/schema';
import { LedgerService } from '../src/modules/wallet/ledger.service';
import { createTestContext, createUser, fundWallet, type TestContext } from './helpers/test-db';

/**
 * These tests are the safety net for Taskeno's money. They exercise the real
 * database (same migrations, same triggers), not a mock, because the guarantees
 * we rely on live in SQL.
 */
describe('ledger', () => {
  let context: TestContext;
  let ledger: LedgerService;

  beforeAll(async () => {
    context = await createTestContext();
    ledger = new LedgerService(context.dbService);
  });

  afterAll(async () => {
    await context.close();
  });

  it('rejects a journal whose debits and credits do not match', async () => {
    const user = await createUser(context);
    const wallet = await ledger.userWallet(user.userId);
    const clearing = await ledger.platformWallet('GATEWAY_CLEARING');

    await expect(
      context.dbService.transaction(async (tx) => {
        await ledger.post(tx, {
          kind: 'deposit',
          idempotencyKey: `unbalanced-${crypto.randomUUID()}`,
          postings: [
            { walletId: clearing.id, direction: 'debit', amount: 5_000n },
            { walletId: wallet.id, direction: 'credit', amount: 4_999n },
          ],
        });
      }),
    ).rejects.toThrow();

    // Nothing may survive a rejected journal.
    const [after] = await context.handle.db.select().from(wallets).where(eq(wallets.id, wallet.id));
    expect(after.balance).toBe(0n);
  });

  it('posts a balanced journal and moves the cached balance', async () => {
    const user = await createUser(context);
    await fundWallet(context, user.userId, 250_000n);

    const wallet = await ledger.userWallet(user.userId);
    expect(wallet.balance).toBe(250_000n);

    const ledgerBalance = await ledger.ledgerBalanceOf(wallet.id);
    expect(ledgerBalance).toBe(250_000n);
  });

  it('is idempotent: replaying the same key never posts twice', async () => {
    const user = await createUser(context);
    await fundWallet(context, user.userId, 100_000n);

    const wallet = await ledger.userWallet(user.userId);
    const adjustment = await ledger.platformWallet('ADJUSTMENT');
    const key = `adjust-replay-${crypto.randomUUID()}`;

    const first = await context.dbService.transaction(async (tx) =>
      ledger.post(tx, {
        kind: 'adjustment',
        idempotencyKey: key,
        postings: [
          { walletId: adjustment.id, direction: 'debit', amount: 10_000n },
          { walletId: wallet.id, direction: 'credit', amount: 10_000n },
        ],
      }),
    );
    expect(first.replayed).toBe(false);

    const second = await context.dbService.transaction(async (tx) =>
      ledger.post(tx, {
        kind: 'adjustment',
        idempotencyKey: key,
        postings: [
          { walletId: adjustment.id, direction: 'debit', amount: 10_000n },
          { walletId: wallet.id, direction: 'credit', amount: 10_000n },
        ],
      }),
    );
    expect(second.replayed).toBe(true);
    expect(second.journalId).toBe(first.journalId);

    const after = await ledger.userWallet(user.userId);
    expect(after.balance).toBe(110_000n);
  });

  it('refuses to spend more than the balance and leaves no partial write', async () => {
    const sender = await createUser(context);
    const recipient = await createUser(context);
    await fundWallet(context, sender.userId, 50_000n);

    const senderWallet = await ledger.userWallet(sender.userId);
    const recipientWallet = await ledger.userWallet(recipient.userId);

    await expect(
      context.dbService.transaction(async (tx) => {
        await ledger.post(tx, {
          kind: 'transfer',
          idempotencyKey: `overdraft-${crypto.randomUUID()}`,
          postings: [
            { walletId: senderWallet.id, direction: 'debit', amount: 80_000n },
            { walletId: recipientWallet.id, direction: 'credit', amount: 80_000n },
          ],
        });
      }),
    ).rejects.toMatchObject({ code: 'WALLET_INSUFFICIENT_FUNDS' });

    const afterSender = await ledger.userWallet(sender.userId);
    const afterRecipient = await ledger.userWallet(recipient.userId);
    expect(afterSender.balance).toBe(50_000n);
    expect(afterRecipient.balance).toBe(0n);
  });

  it('lets only one of two simultaneous spends of the same funds succeed', async () => {
    const spender = await createUser(context);
    await fundWallet(context, spender.userId, 100_000n);

    const first = await createUser(context);
    const second = await createUser(context);
    const spenderWallet = await ledger.userWallet(spender.userId);

    const attempt = async (toUserId: string, walletId: string) =>
      context.dbService.transaction(async (tx) => {
        await ledger.post(tx, {
          kind: 'transfer',
          idempotencyKey: `race-${crypto.randomUUID()}`,
          postings: [
            { walletId: spenderWallet.id, direction: 'debit', amount: 100_000n },
            { walletId, direction: 'credit', amount: 100_000n },
          ],
        });
      });

    const [firstWallet, secondWallet] = await Promise.all([
      ledger.userWallet(first.userId),
      ledger.userWallet(second.userId),
    ]);

    // Fired together: the row lock + balance re-check must serialise them.
    const results = await Promise.allSettled([
      attempt(first.userId, firstWallet.id),
      attempt(second.userId, secondWallet.id),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const after = await ledger.userWallet(spender.userId);
    expect(after.balance).toBe(0n);

    const allEntries = await context.handle.db.select().from(wallets).where(eq(wallets.id, spenderWallet.id));
    expect(allEntries[0].balance).toBe(0n);
  });

  it('keeps the ledger append-only', async () => {
    const user = await createUser(context);
    await fundWallet(context, user.userId, 10_000n);
    const wallet = await ledger.userWallet(user.userId);
    const entries = await ledger.entriesForWallet(wallet.id);
    expect(entries.length).toBeGreaterThan(0);

    await expect(
      context.handle.db.execute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await import('drizzle-orm')).sql`update ledger_entries set amount = 1 where id = ${entries[0].id}`,
      ),
    ).rejects.toThrow();
  });

  it('stays balanced globally: total debits equal total credits', async () => {
    const user = await createUser(context);
    await fundWallet(context, user.userId, 777_777n);

    const balance = await ledger.assertGlobalBalance();
    expect(balance.balanced).toBe(true);
    expect(balance.debit).toBe(balance.credit);
  });

  it('detects a tampered cached balance in reconciliation', async () => {
    const user = await createUser(context);
    await fundWallet(context, user.userId, 5_000n);
    const wallet = await ledger.userWallet(user.userId);

    const clean = await ledger.reconcile();
    expect(clean.mismatches.find((row) => row.walletId === wallet.id)).toBeUndefined();

    // Simulating a code path that bypassed the ledger: reconciliation must catch it.
    await context.handle.db.update(wallets).set({ balance: 9_999n }).where(eq(wallets.id, wallet.id));

    const dirty = await ledger.reconcile();
    const mismatch = dirty.mismatches.find((row) => row.walletId === wallet.id);
    expect(mismatch).toBeDefined();
    expect(mismatch?.cachedBalance).toBe(9_999n);
    expect(mismatch?.ledgerBalance).toBe(5_000n);
  });
});
