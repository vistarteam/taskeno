import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lte, or, gt, desc } from 'drizzle-orm';
import {
  type CommissionCalcType,
  type CommissionScope,
  applyBasisPoints,
  clampMoney,
} from '@taskeno/contracts';
import type { Database } from '../../db/client';
import { commissionRules } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { SettingsService } from '../settings/settings.service';

export type CommissionContext = {
  amount: bigint;
  categoryId?: string | null;
  serviceId?: string | null;
  providerId?: string | null;
};

export type CommissionResult = {
  amount: bigint;
  /** Frozen copy stored on the order so history is immune to rule edits. */
  snapshot: {
    ruleId: string | null;
    scope: CommissionScope | 'default';
    calcType: CommissionCalcType;
    percentBps: number;
    fixedAmount: string;
    minCommission: string | null;
    maxCommission: string | null;
  };
};

/** Most specific scope wins; `priority` breaks ties inside the same scope. */
const SCOPE_RANK: Record<CommissionScope, number> = {
  service: 4,
  category: 3,
  provider: 2,
  global: 1,
};

/**
 * Commission is configuration, not code.
 *
 * Rules are stored in the database (global / category / service / provider),
 * so an admin can change pricing without a deployment. Every amount is computed
 * with integer basis-point math — never floats — and clamped to the rule's
 * floor/ceiling.
 */
@Injectable()
export class CommissionService {
  constructor(
    private readonly dbService: DbService,
    private readonly settings: SettingsService,
  ) {}

  async calculate(context: CommissionContext, tx?: Database): Promise<CommissionResult> {
    const db = tx ?? this.dbService.db;
    const now = new Date();

    const rules = await db
      .select()
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.isActive, true),
          lte(commissionRules.effectiveFrom, now),
          or(isNull(commissionRules.effectiveTo), gt(commissionRules.effectiveTo, now)),
        ),
      )
      .orderBy(desc(commissionRules.priority));

    const applicable = rules.filter((rule) => {
      switch (rule.scope) {
        case 'global':
          return true;
        case 'category':
          return Boolean(context.categoryId) && rule.scopeRef === context.categoryId;
        case 'service':
          return Boolean(context.serviceId) && rule.scopeRef === context.serviceId;
        case 'provider':
          return Boolean(context.providerId) && rule.scopeRef === context.providerId;
        default:
          return false;
      }
    });

    const winner = applicable.sort((a, b) => {
      const rankDiff = SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope];
      if (rankDiff !== 0) return rankDiff;
      return b.priority - a.priority;
    })[0];

    if (!winner) {
      // Fallback to the configured default rate so a missing rule can never
      // silently mean "no commission".
      const defaultBps = await this.settings.getNumber('commission.default_bps', 1000, tx);
      return {
        amount: applyBasisPoints(context.amount, defaultBps),
        snapshot: {
          ruleId: null,
          scope: 'default',
          calcType: 'percent',
          percentBps: defaultBps,
          fixedAmount: '0',
          minCommission: null,
          maxCommission: null,
        },
      };
    }

    let amount = 0n;
    if (winner.calcType === 'percent') {
      amount = applyBasisPoints(context.amount, winner.percentBps);
    } else if (winner.calcType === 'fixed') {
      amount = winner.fixedAmount;
    } else {
      amount = applyBasisPoints(context.amount, winner.percentBps) + winner.fixedAmount;
    }

    amount = clampMoney(amount, winner.minCommission, winner.maxCommission);
    // Commission can never exceed the order value.
    if (amount > context.amount) amount = context.amount;

    return {
      amount,
      snapshot: {
        ruleId: winner.id,
        scope: winner.scope,
        calcType: winner.calcType,
        percentBps: winner.percentBps,
        fixedAmount: winner.fixedAmount.toString(),
        minCommission: winner.minCommission?.toString() ?? null,
        maxCommission: winner.maxCommission?.toString() ?? null,
      },
    };
  }

  async listRules() {
    return this.dbService.db.select().from(commissionRules).orderBy(desc(commissionRules.priority));
  }
}
