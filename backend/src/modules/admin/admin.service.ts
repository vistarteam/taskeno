import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import {
  ERROR_CODES,
  type AdminAdjustmentInput,
  type CommissionRuleInput,
  type CreateCategoryInput,
  type ModerationDecisionInput,
} from '@taskeno/contracts';
import { AppError } from '../../common/errors';
import { AuditService } from '../../common/audit.service';
import type { ActorContext } from '../../common/types';
import {
  auditLogs,
  categories,
  commissionRules,
  disputes,
  orders,
  profiles,
  reports,
  services,
  settings,
  users,
  wallets,
} from '../../db/schema';
import { DbService } from '../../db/db.service';
import { CatalogService } from '../catalog/catalog.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { ReviewsService } from '../reviews/reviews.service';
import { SettingsService } from '../settings/settings.service';
import { CommissionService } from '../wallet/commission.service';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';

/**
 * Admin/back-office operations.
 *
 * Every mutating method delegates to the owning service (never writes money or
 * order state directly) and records an audit entry, so the back office has no
 * private path into the ledger.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly dbService: DbService,
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly wallet: WalletService,
    private readonly ledger: LedgerService,
    private readonly commission: CommissionService,
    private readonly settings: SettingsService,
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Dashboard                                                           */
  /* ------------------------------------------------------------------ */

  async metrics() {
    const db = this.dbService.db;

    const [[userCount], [providerCount], orderAgg, [pendingModeration], [openDisputes], [openReports], paymentTotals] =
      await Promise.all([
        db.select({ value: count() }).from(users).where(eq(users.status, 'active')),
        db.select({ value: count() }).from(profiles).where(eq(profiles.isProvider, true)),
        db
          .select({
            total: count(),
            completed: sql<string>`count(*) filter (where ${orders.status} = 'completed')`,
            active: sql<string>`count(*) filter (where ${orders.status} in ('paid','accepted','in_progress','delivered'))`,
            disputed: sql<string>`count(*) filter (where ${orders.status} = 'disputed')`,
            gmv: sql<string>`coalesce(sum(case when ${orders.status} = 'completed' then ${orders.total} else 0 end), 0)`,
            commission: sql<string>`coalesce(sum(case when ${orders.status} = 'completed' then ${orders.commissionAmount} else 0 end), 0)`,
          })
          .from(orders),
        db
          .select({ value: sql<string>`count(*)` })
          .from(services)
          .where(eq(services.status, 'pending_review')),
        db
          .select({ value: sql<string>`count(*)` })
          .from(disputes)
          .where(or(eq(disputes.status, 'open'), eq(disputes.status, 'under_review'))),
        db
          .select({ value: sql<string>`count(*)` })
          .from(reports)
          .where(eq(reports.status, 'open')),
        this.payments.totals(),
      ]);

    const revenueWallet = await this.ledger.platformWallet('REVENUE');
    const escrowWallet = await this.ledger.platformWallet('ESCROW');
    const globalBalance = await this.ledger.assertGlobalBalance();

    return {
      users: { active: userCount?.value ?? 0, providers: providerCount?.value ?? 0 },
      orders: {
        total: orderAgg[0]?.total ?? 0,
        completed: Number(orderAgg[0]?.completed ?? 0),
        active: Number(orderAgg[0]?.active ?? 0),
        disputed: Number(orderAgg[0]?.disputed ?? 0),
        gmv: BigInt(orderAgg[0]?.gmv ?? '0').toString(),
        grossCommission: BigInt(orderAgg[0]?.commission ?? '0').toString(),
      },
      moderation: { pendingServices: Number(pendingModeration?.value ?? 0) },
      disputes: { open: Number(openDisputes?.value ?? 0) },
      reports: { open: Number(openReports?.value ?? 0) },
      payments: paymentTotals,
      ledger: {
        revenue: revenueWallet.balance.toString(),
        escrow: escrowWallet.balance.toString(),
        balanced: globalBalance.balanced,
        debit: globalBalance.debit.toString(),
        credit: globalBalance.credit.toString(),
      },
      generatedAt: new Date(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Users                                                              */
  /* ------------------------------------------------------------------ */

  async listUsers(query: { q?: string; limit?: number }) {
    const limit = Math.min(query.limit ?? 50, 200);
    const rows = await this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        username: profiles.username,
        displayName: profiles.displayName,
        isProvider: profiles.isProvider,
        ratingCount: profiles.ratingCount,
        ratingSum: profiles.ratingSum,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(
        query.q
          ? or(ilike(users.email, `%${query.q}%`), ilike(profiles.username, `%${query.q}%`), ilike(profiles.displayName, `%${query.q}%`))
          : undefined,
      )
      .orderBy(desc(users.createdAt))
      .limit(limit);

    return rows.map((row) => {
      const ratingCount = row.ratingCount ?? 0;
      const ratingSum = Number(row.ratingSum ?? 0);
      return {
        ...row,
        rating: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : 0,
      };
    });
  }

  async setUserStatus(userId: string, status: 'active' | 'suspended', reason: string, actor: ActorContext) {
    const [before] = await this.dbService.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!before) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });

    await this.dbService.transaction(async (tx) => {
      await tx.update(users).set({ status }).where(eq(users.id, userId));
      await this.audit.record(
        {
          actor,
          action: status === 'suspended' ? 'admin.user_suspended' : 'admin.user_activated',
          entityType: 'user',
          entityId: userId,
          before: { status: before.status },
          after: { status, reason },
        },
        tx,
      );
    });

    return { ok: true };
  }

  /** Wallet snapshot for the account detail view. */
  async userWallet(userId: string) {
    return this.wallet.walletOverview(userId);
  }

  /* ------------------------------------------------------------------ */
  /* Moderation                                                          */
  /* ------------------------------------------------------------------ */

  async moderationQueue() {
    return this.catalog.moderationQueue();
  }

  async moderateService(serviceId: string, input: ModerationDecisionInput, actor: ActorContext) {
    return this.catalog.moderate(serviceId, input.decision, input.reason, actor);
  }

  async setReviewVisibility(reviewId: string, visible: boolean, actor: ActorContext) {
    return this.reviews.setVisibility(reviewId, visible, actor);
  }

  /* ------------------------------------------------------------------ */
  /* Orders / payments / disputes                                        */
  /* ------------------------------------------------------------------ */

  async listOrders(status?: string, limit = 100) {
    const db = this.dbService.db;
    const rows = await db
      .select({
        id: orders.id,
        code: orders.code,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        total: orders.total,
        commissionAmount: orders.commissionAmount,
        createdAt: orders.createdAt,
        buyerUsername: sql<string | null>`(select username from profiles where user_id = ${orders.buyerId})`,
        providerUsername: sql<string | null>`(select username from profiles where user_id = ${orders.providerId})`,
      })
      .from(orders)
      .where(status ? eq(orders.status, status as never) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      total: row.total.toString(),
      commissionAmount: row.commissionAmount.toString(),
    }));
  }

  async listPayments() {
    return this.payments.recent(100);
  }

  async listDisputes(status?: string) {
    const rows = await this.orders.listDisputes(status);
    return rows.map((row) => ({ ...row, total: row.total.toString() }));
  }

  async resolveDispute(
    orderId: string,
    input: { decision: 'release_to_provider' | 'refund_buyer' | 'partial_refund'; note: string; partialAmountRial?: bigint },
    actor: ActorContext,
  ) {
    return this.orders.adminResolve(orderId, input.decision, input.note, actor, input.partialAmountRial);
  }

  /* ------------------------------------------------------------------ */
  /* Ledger                                                              */
  /* ------------------------------------------------------------------ */

  async ledgerJournals(limit = 50) {
    const rows = await this.ledger.recentJournals(limit);
    return rows.map((journal) => ({
      ...journal,
      entries: journal.entries.map((entry) => ({
        ...entry,
        amount: entry.amount.toString(),
        balanceBefore: entry.balanceBefore.toString(),
        balanceAfter: entry.balanceAfter.toString(),
      })),
    }));
  }

  /** Read-only check: cached balances versus the ledger, and global balance. */
  async ledgerHealth() {
    const [reconciliation, global] = await Promise.all([this.ledger.reconcile(), this.ledger.assertGlobalBalance()]);
    return {
      checkedWallets: reconciliation.checked,
      mismatches: reconciliation.mismatches.map((row) => ({
        walletId: row.walletId,
        code: row.code,
        cached: row.cachedBalance.toString(),
        ledger: row.ledgerBalance.toString(),
      })),
      balanced: global.balanced,
      debit: global.debit.toString(),
      credit: global.credit.toString(),
    };
  }

  async adjustWallet(input: AdminAdjustmentInput, actor: ActorContext) {
    return this.wallet.adminAdjust(actor, {
      userId: input.userId,
      amount: input.amountRial,
      reason: input.reason,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Catalog configuration                                               */
  /* ------------------------------------------------------------------ */

  async createCategory(input: CreateCategoryInput, actor: ActorContext) {
    return this.catalog.createCategory(input, actor);
  }

  async listCategories() {
    return this.dbService.db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.titleFa));
  }

  async listCommissionRules() {
    return this.commission.listRules();
  }

  async createCommissionRule(input: CommissionRuleInput, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const [created] = await tx
        .insert(commissionRules)
        .values({
          scope: input.scope,
          scopeRef: input.scopeRef ?? null,
          calcType: input.calcType,
          percentBps: input.percentBps,
          fixedAmount: input.fixedAmount,
          minCommission: input.minCommission ?? null,
          maxCommission: input.maxCommission ?? null,
          priority: input.priority,
          isActive: input.isActive,
          createdBy: actor.userId,
        })
        .returning();

      await this.audit.record(
        {
          actor,
          action: 'admin.commission_rule_created',
          entityType: 'commission_rule',
          entityId: created.id,
          after: { scope: created.scope, percentBps: created.percentBps },
        },
        tx,
      );

      return created;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Settings / audit / reports                                          */
  /* ------------------------------------------------------------------ */

  async listSettings() {
    return this.settings.all();
  }

  async updateSetting(key: string, value: unknown, actor: ActorContext) {
    await this.dbService.transaction(async (tx) => {
      const [before] = await tx.select().from(settings).where(eq(settings.key, key)).limit(1);
      await this.settings.set(key, value, actor.userId, tx);
      await this.audit.record(
        {
          actor,
          action: 'admin.setting_updated',
          entityType: 'setting',
          entityId: key,
          before: { value: before?.value ?? null },
          after: { value },
        },
        tx,
      );
    });
    return { ok: true };
  }

  async listAuditLogs(limit = 100) {
    return this.dbService.db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async listReports(status?: string) {
    return this.dbService.db
      .select()
      .from(reports)
      .where(status ? eq(reports.status, status as never) : undefined)
      .orderBy(desc(reports.createdAt))
      .limit(100);
  }

  async resolveReport(reportId: string, status: 'resolved' | 'dismissed', note: string, actor: ActorContext) {
    const [before] = await this.dbService.db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (!before) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });

    await this.dbService.transaction(async (tx) => {
      await tx
        .update(reports)
        .set({ status, handledBy: actor.userId, resolutionNote: note, resolvedAt: new Date() })
        .where(eq(reports.id, reportId));
      await this.audit.record(
        {
          actor,
          action: 'admin.report_resolved',
          entityType: 'report',
          entityId: reportId,
          before: { status: before.status },
          after: { status, note },
        },
        tx,
      );
    });

    return { ok: true };
  }

  /** Platform wallet balances: the executive view of money on the platform. */
  async platformWalletBalances() {
    const rows = await this.dbService.db
      .select({ code: wallets.code, balance: wallets.balance, currency: wallets.currency })
      .from(wallets)
      .where(eq(wallets.ownerType, 'platform'));
    return rows.map((row) => ({ code: row.code, balance: row.balance.toString(), currency: row.currency }));
  }
}
