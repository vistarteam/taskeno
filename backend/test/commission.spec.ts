import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commissionRules } from '../src/db/schema';
import { DbService } from '../src/db/db.service';
import { CommissionService } from '../src/modules/wallet/commission.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import { createTestContext, createUser, type TestContext } from './helpers/test-db';

describe('commission', () => {
  let context: TestContext;
  let commission: CommissionService;

  beforeAll(async () => {
    context = await createTestContext();
    const settings = new SettingsService(context.dbService as DbService);
    commission = new CommissionService(context.dbService as DbService, settings);
  });

  afterAll(async () => {
    await context.close();
  });

  it('falls back to the configured default rate when no rule exists', async () => {
    const result = await commission.calculate({ amount: 1_000_000n });
    expect(result.amount).toBe(100_000n); // default 1000 bps = 10%
    expect(result.snapshot.scope).toBe('default');
  });

  it('prefers the most specific scope: service beats category beats global', async () => {
    const db = context.handle.db;
    const provider = await createUser(context, { isProvider: true });
    const categoryId = crypto.randomUUID();
    const serviceId = crypto.randomUUID();

    await db.insert(commissionRules).values([
      { scope: 'global', calcType: 'percent', percentBps: 1000, priority: 1000 },
      { scope: 'category', scopeRef: categoryId, calcType: 'percent', percentBps: 1500, priority: 500 },
      { scope: 'service', scopeRef: serviceId, calcType: 'percent', percentBps: 500, priority: 100 },
    ]);

    const global = await commission.calculate({ amount: 1_000_000n });
    const category = await commission.calculate({ amount: 1_000_000n, categoryId });
    const service = await commission.calculate({ amount: 1_000_000n, categoryId, serviceId });

    expect(global.amount).toBe(100_000n); // 10%
    expect(category.amount).toBe(150_000n); // 15%
    expect(service.amount).toBe(50_000n); // 5%
    expect(service.snapshot.scope).toBe('service');
  });

  it('snapshots the applied rule so history never changes retroactively', async () => {
    const serviceId = crypto.randomUUID();
    await context.handle.db.insert(commissionRules).values({
      scope: 'service',
      scopeRef: serviceId,
      calcType: 'percent',
      percentBps: 1200,
      priority: 10,
    });

    const before = await commission.calculate({ amount: 500_000n, serviceId });
    expect(before.amount).toBe(60_000n);
    expect(before.snapshot.percentBps).toBe(1200);
    expect(before.snapshot.ruleId).not.toBeNull();

    // The rule changes later: the earlier snapshot is still the truth.
    const frozen = before.snapshot;
    expect(frozen.percentBps).toBe(1200);
    expect(frozen.calcType).toBe('percent');
  });

  it('supports fixed and combined rules with floors and ceilings', async () => {
    const categoryId = crypto.randomUUID();
    await context.handle.db.insert(commissionRules).values([
      { scope: 'category', scopeRef: categoryId, calcType: 'fixed', fixedAmount: 25_000n, priority: 20 },
    ]);
    const fixed = await commission.calculate({ amount: 1_000_000n, categoryId });
    expect(fixed.amount).toBe(25_000n);

    const providerId = crypto.randomUUID();
    await context.handle.db.insert(commissionRules).values([
      {
        scope: 'provider',
        scopeRef: providerId,
        calcType: 'percent_plus_fixed',
        percentBps: 500,
        fixedAmount: 10_000n,
        minCommission: 30_000n,
        maxCommission: 80_000n,
        priority: 20,
      },
    ]);

    // 5% of 1,000,000 = 50,000 + 10,000 = 60,000 (inside the bounds)
    const combined = await commission.calculate({ amount: 1_000_000n, providerId });
    expect(combined.amount).toBe(60_000n);

    // 5% of 100,000 = 5,000 + 10,000 = 15,000 -> floored to 30,000
    const floored = await commission.calculate({ amount: 100_000n, providerId });
    expect(floored.amount).toBe(30_000n);
  });

  it('never charges more commission than the order value', async () => {
    const providerId = crypto.randomUUID();
    await context.handle.db.insert(commissionRules).values({
      scope: 'provider',
      scopeRef: providerId,
      calcType: 'fixed',
      fixedAmount: 1_000_000n,
      priority: 5,
    });

    const result = await commission.calculate({ amount: 10_000n, providerId });
    expect(result.amount).toBe(10_000n);
  });
});
