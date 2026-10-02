import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLATFORM_WALLET_CODES, ROLE_KEYS } from '@taskeno/contracts';
import { createDatabase, runMigrations, type DatabaseHandle } from '../../src/db/client';
import { DbService } from '../../src/db/db.service';
import { profiles, roles, users, wallets } from '../../src/db/schema';
import { PasswordService } from '../../src/common/password';

export type TestContext = {
  handle: DatabaseHandle;
  dbService: DbService;
  close: () => Promise<void>;
};

/**
 * Creates a throwaway embedded PostgreSQL instance with the real migrations
 * applied — the same SQL that runs in production, including the financial
 * invariant triggers. Each test file gets its own directory so suites cannot
 * interfere with each other.
 */
export const createTestContext = async (): Promise<TestContext> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskeno-test-'));
  const handle = await createDatabase({ dataDir: dir });
  const dbService = new DbService(handle);
  await dbService.onModuleInit();

  const db = handle.db;
  for (const key of ROLE_KEYS) {
    await db.insert(roles).values({ key, titleFa: key }).onConflictDoNothing({ target: roles.key });
  }
  for (const code of PLATFORM_WALLET_CODES) {
    await db
      .insert(wallets)
      .values({ ownerType: 'platform', code, currency: 'IRR', balance: 0n })
      .onConflictDoNothing({ target: wallets.code });
  }

  return {
    handle,
    dbService,
    close: async () => {
      await handle.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
};

let counter = 0;

/** Creates a user with a profile and a wallet, returning the ids. */
export const createUser = async (
  context: TestContext,
  options: { displayName?: string; isProvider?: boolean } = {},
): Promise<{ userId: string; username: string; walletId: string }> => {
  counter += 1;
  const db = context.handle.db;
  const suffix = `${Date.now().toString(36)}${counter}`;
  const passwordHash = await new PasswordService().hash('Taskeno!12345');

  const [user] = await db
    .insert(users)
    .values({ email: `user_${suffix}@example.com`, passwordHash })
    .returning();
  const username = `user_${suffix}`;
  await db.insert(profiles).values({
    userId: user.id,
    username,
    displayName: options.displayName ?? username,
    isProvider: options.isProvider ?? false,
  });
  const [wallet] = await db
    .insert(wallets)
    .values({ ownerType: 'user', ownerId: user.id, currency: 'IRR', balance: 0n })
    .returning();

  return { userId: user.id, username, walletId: wallet.id };
};

/** Credits a user wallet through the ledger (a real, balanced journal). */
export const fundWallet = async (context: TestContext, userId: string, amount: bigint): Promise<void> => {
  const { LedgerService } = await import('../../src/modules/wallet/ledger.service');
  const ledger = new LedgerService(context.dbService);
  await context.dbService.transaction(async (tx) => {
    const [userWallet, clearing] = await Promise.all([
      ledger.userWallet(userId, tx),
      ledger.platformWallet('GATEWAY_CLEARING', tx),
    ]);
    await ledger.post(tx, {
      kind: 'deposit',
      idempotencyKey: `test-fund:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      postings: [
        { walletId: clearing.id, direction: 'debit', amount },
        { walletId: userWallet.id, direction: 'credit', amount },
      ],
    });
  });
};
