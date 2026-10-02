/* Temporary verification probe for the database-level financial invariants. */
import { and, eq, sql } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { journals, ledgerEntries, wallets, users, profiles } from '../src/db/schema';

const run = async () => {
  const { db, close } = await createDatabase();

  const uniq = Date.now().toString(36);
  const [user] = await db
    .insert(users)
    .values({ email: `probe_${uniq}@example.com`, passwordHash: 'x' })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({ userId: user.id, username: `probe_${uniq}`, displayName: 'Probe' })
    .returning();

  const [userWallet] = await db
    .insert(wallets)
    .values({ ownerType: 'user', ownerId: user.id, balance: 0n })
    .returning();

  const [clearing] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.ownerType, 'platform'), eq(wallets.code, 'GATEWAY_CLEARING')));
  if (!clearing) {
    await db.insert(wallets).values({ ownerType: 'platform', code: 'GATEWAY_CLEARING', balance: 0n });
  }
  const clearingWallet =
    clearing ??
    (
      await db
        .select()
        .from(wallets)
        .where(eq(wallets.code, 'GATEWAY_CLEARING'))
    )[0];

  const results: Record<string, boolean> = {};

  // 1) Unbalanced journal must be rejected at commit.
  try {
    await db.transaction(async (tx) => {
      const [journal] = await tx
        .insert(journals)
        .values({ kind: 'deposit', idempotencyKey: `probe-unbalanced-${uniq}` })
        .returning();
      await tx.insert(ledgerEntries).values({
        journalId: journal.id,
        walletId: userWallet.id,
        direction: 'credit',
        amount: 5_000n,
        balanceBefore: 0n,
        balanceAfter: 5_000n,
      });
    });
    results.unbalancedRejected = false;
  } catch {
    results.unbalancedRejected = true;
  }

  // 2) Balanced journal succeeds and moves the cached balance.
  await db.transaction(async (tx) => {
    const [journal] = await tx
      .insert(journals)
      .values({ kind: 'deposit', idempotencyKey: `probe-balanced-${uniq}` })
      .returning();
    await tx.insert(ledgerEntries).values([
      {
        journalId: journal.id,
        walletId: userWallet.id,
        direction: 'credit',
        amount: 200_000n,
        balanceBefore: 0n,
        balanceAfter: 200_000n,
      },
      {
        journalId: journal.id,
        walletId: clearingWallet.id,
        direction: 'debit',
        amount: 200_000n,
        balanceBefore: clearingWallet.balance,
        balanceAfter: clearingWallet.balance - 200_000n,
      },
    ]);
    await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} + 200000`, version: sql`${wallets.version} + 1` })
      .where(eq(wallets.id, userWallet.id));
  });
  const [afterDeposit] = await db.select().from(wallets).where(eq(wallets.id, userWallet.id));
  results.balanceUpdated = afterDeposit.balance === 200_000n;

  // 3) Ledger rows are append-only.
  try {
    await db.update(ledgerEntries).set({ amount: 1n }).where(eq(ledgerEntries.walletId, userWallet.id));
    results.immutable = false;
  } catch {
    results.immutable = true;
  }

  // 4) History rows cannot be deleted.
  try {
    await db.delete(journals).where(eq(journals.idempotencyKey, `probe-balanced-${uniq}`));
    results.deletableJournals = true;
  } catch {
    results.deletableJournals = false;
  }

  // 5) A user wallet may never go negative.
  try {
    await db.update(wallets).set({ balance: -1n }).where(eq(wallets.id, userWallet.id));
    results.negativeRejected = false;
  } catch {
    results.negativeRejected = true;
  }

  await db.delete(profiles).where(eq(profiles.userId, user.id));
  await db.delete(users).where(eq(users.id, user.id));

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ...results, profileCreated: Boolean(profile) }, null, 2));
  await close();
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('probe failed', error);
  process.exit(1);
});
