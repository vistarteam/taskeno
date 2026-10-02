import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import {
  ERROR_CODES,
  formatToman,
  type CreateOrderInput,
  type OrderQuery,
  type OrderStatus,
} from '@taskeno/contracts';
import { AppError, conflict } from '../../common/errors';
import { generateOrderCode } from '../../common/crypto';
import { AuditService } from '../../common/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { buildPage, cursorCondition, decodeCursor, resolveLimit } from '../../common/pagination';
import type { ActorContext } from '../../common/types';
import type { Database } from '../../db/client';
import {
  conversations,
  disputes,
  messages,
  orderDeliveries,
  orderItems,
  orderStatusHistory,
  orders,
  profiles,
  services,
} from '../../db/schema';
import { DbService } from '../../db/db.service';
import { CatalogService } from '../catalog/catalog.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CommissionService } from '../wallet/commission.service';
import { WalletService } from '../wallet/wallet.service';
import { OrderStateMachine, holdsEscrow, type OrderAction, type OrderActor } from './order-state-machine';

type OrderRow = typeof orders.$inferSelect;

/**
 * Orders.
 *
 * Two rules shape this service:
 *  - the order line is an immutable snapshot of the service at purchase time,
 *  - money only moves as a consequence of a state transition, and always
 *    through the ledger, inside the same transaction as the status change.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly dbService: DbService,
    private readonly catalog: CatalogService,
    private readonly wallet: WalletService,
    private readonly commission: CommissionService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Creation                                                            */
  /* ------------------------------------------------------------------ */

  async create(buyerId: string, input: CreateOrderInput, idempotencyKey: string, actor: ActorContext) {
    // Replaying the same key must return the same order, not create a second one.
    const [existing] = await this.dbService.db
      .select()
      .from(orders)
      .where(and(eq(orders.buyerId, buyerId), eq(orders.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) return this.detailForActor(existing.id, buyerId, actor.roles);

    const service = await this.catalog.loadPurchasableService(input.serviceId);
    if (service.providerId === buyerId) throw conflict(ERROR_CODES.ORDER_CANNOT_ORDER_OWN_SERVICE);

    const commission = await this.commission.calculate({
      amount: service.price,
      categoryId: service.categoryId,
      serviceId: service.id,
      providerId: service.providerId,
    });

    const created = await this.dbService.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          code: generateOrderCode(),
          buyerId,
          providerId: service.providerId,
          currency: service.currency,
          subtotal: service.price + commission.amount,
          commissionAmount: commission.amount,
          commissionSnapshot: commission.snapshot as unknown as Record<string, unknown>,
          total: service.price,
          status: 'pending_payment',
          paymentStatus: 'unpaid',
          note: input.note ?? null,
          idempotencyKey,
        })
        .returning();

      await tx.insert(orderItems).values({
        orderId: order.id,
        serviceId: service.id,
        serviceSnapshot: {
          title: service.title,
          description: service.description,
          price: service.price.toString(),
          deliveryDays: service.deliveryDays,
          revisions: service.revisions,
          categoryId: service.categoryId,
        },
        titleSnapshot: service.title,
        descriptionSnapshot: service.description,
        priceSnapshot: service.price,
        deliveryDaysSnapshot: service.deliveryDays,
        quantity: 1,
        total: service.price,
      });

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: 'pending_payment',
        actorUserId: buyerId,
        actorRole: 'buyer',
        reason: 'ایجاد سفارش',
      });

      await tx.insert(conversations).values({
        orderId: order.id,
        participantA: buyerId,
        participantB: service.providerId,
      });

      await this.outbox.publish(tx, {
        type: 'order.created',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: { orderCode: order.code, buyerId, providerId: service.providerId },
      });

      await this.notifications.notify(tx, {
        userId: service.providerId,
        type: 'order.created',
        payload: { orderCode: order.code },
        entityType: 'order',
        entityId: order.id,
      });

      await this.audit.record(
        {
          actor,
          action: 'order.create',
          entityType: 'order',
          entityId: order.id,
          after: { code: order.code, serviceId: service.id, total: order.total.toString() },
        },
        tx,
      );

      return order;
    });

    return this.detailForActor(created.id, buyerId, actor.roles);
  }

  /* ------------------------------------------------------------------ */
  /* Payment                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Pays for an order out of the buyer's wallet balance.
   *
   * The money moves into the escrow wallet in the same transaction that flips
   * the status, so an order can never be `paid` without the funds being held.
   */
  async payWithWallet(buyerId: string, orderId: string, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      this.assertParticipant(order, buyerId, actor.roles, 'buyer');

      if (order.status === 'paid') throw conflict(ERROR_CODES.ORDER_ALREADY_PAID);
      if (order.status !== 'pending_payment') throw conflict(ERROR_CODES.ORDER_NOT_PAYABLE);

      await this.wallet.holdOrderPayment(tx, {
        orderId: order.id,
        orderCode: order.code,
        buyerId,
        amount: order.total,
        paymentId: `wallet-${order.id}`,
      });

      return this.markPaid(tx, order, actor, 'wallet');
    });
  }

  /** Adds a delivery submission to the order (provider only). */
  async deliver(
    providerId: string,
    orderId: string,
    input: { message?: string; reason?: string },
    actor: ActorContext,
  ) {
    if (!input.message || input.message.trim().length < 5) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: 'متن تحویل کار الزامی است.' });
    }

    return this.dbService.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      this.assertParticipant(order, providerId, actor.roles, 'provider');

      const toStatus = OrderStateMachine.resolve(order.status, 'deliver', 'provider');

      await tx.insert(orderDeliveries).values({
        orderId: order.id,
        providerId,
        message: input.message!.trim(),
      });

      return this.applyTransition(tx, order, toStatus, 'provider', actor, input.reason);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Generic transitions                                                 */
  /* ------------------------------------------------------------------ */

  async applyAction(
    orderId: string,
    action: OrderAction,
    userId: string,
    input: { reason?: string; message?: string },
    actor: ActorContext,
  ) {
    return this.dbService.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);

      // The role is derived from the order itself, so a provider can never be
      // treated as the buyer (or vice versa) by passing a different id.
      // Participation decides the role first: an admin who is also the order's
      // provider must act as the provider (the state machine only lets
      // 'provider' accept/start/deliver), and an admin who is the buyer must act
      // as the buyer. 'admin' is reserved for staff acting on other people's
      // orders — the same rule `detailForActor` uses when it builds `actions`.
      const actorRole: OrderActor =
        order.buyerId === userId
          ? 'buyer'
          : order.providerId === userId
            ? 'provider'
            : actor.roles.includes('admin')
              ? 'admin'
              : (() => {
                  throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });
                })();

      if (action === 'dispute') {
        const [existing] = await tx.select({ id: disputes.id }).from(disputes).where(eq(disputes.orderId, order.id)).limit(1);
        if (existing) throw conflict(ERROR_CODES.DISPUTE_ALREADY_OPEN);

        const toStatus = OrderStateMachine.resolve(order.status, 'dispute', actorRole as OrderActor);
        await tx.insert(disputes).values({
          orderId: order.id,
          openedBy: userId,
          reason: input.reason ?? 'اختلاف',
          description: input.message ?? null,
        });
        return this.applyTransition(tx, order, toStatus, actorRole, actor, input.reason);
      }

      const toStatus = OrderStateMachine.resolve(order.status, action, actorRole as OrderActor);
      return this.applyTransition(tx, order, toStatus, actorRole, actor, input.reason);
    });
  }

  /**
   * Applies a validated transition: status, side effects, history, events and
   * notifications. Everything happens inside the caller's transaction.
   */
  private async applyTransition(
    tx: Database,
    order: OrderRow,
    toStatus: OrderStatus,
    actorRole: OrderActor,
    actor: ActorContext,
    reason?: string,
  ) {
    const now = new Date();
    const patch: Partial<typeof orders.$inferInsert> = { status: toStatus };
    let memo = reason ?? null;

    switch (toStatus) {
      case 'accepted':
        patch.acceptedAt = now;
        break;
      case 'in_progress':
        patch.startedAt = now;
        break;
      case 'delivered': {
        const autoCompleteDays = await this.settings.getNumber('orders.auto_complete_days', 7, tx);
        patch.deliveredAt = now;
        patch.autoCompleteAt = new Date(now.getTime() + autoCompleteDays * 24 * 60 * 60 * 1000);
        break;
      }
      case 'completed': {
        // Money leaves escrow exactly once, in this transaction.
        await this.wallet.releaseEscrow(tx, {
          orderId: order.id,
          orderCode: order.code,
          providerId: order.providerId,
          total: order.total,
          commission: order.commissionAmount,
        });
        patch.completedAt = now;
        patch.autoCompleteAt = null;
        patch.paymentStatus = 'released';

        await tx
          .update(profiles)
          .set({ completedOrdersCount: sql`${profiles.completedOrdersCount} + 1` })
          .where(eq(profiles.userId, order.providerId));
        break;
      }
      case 'cancelled':
      case 'refunded': {
        if (holdsEscrow(order.status) || order.paymentStatus === 'escrow_held') {
          await this.wallet.refundFromEscrow(tx, {
            orderId: order.id,
            orderCode: order.code,
            buyerId: order.buyerId,
            amount: order.total,
            memo: toStatus === 'cancelled' ? 'لغو سفارش' : 'بازگشت وجه سفارش',
          });
          patch.paymentStatus = 'refunded';
        }
        patch.cancelledAt = now;
        patch.autoCompleteAt = null;
        memo = reason ?? 'لغو سفارش';
        break;
      }
      default:
        break;
    }

    const [updated] = await tx.update(orders).set(patch).where(eq(orders.id, order.id)).returning();

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus,
      actorUserId: actor.userId,
      actorRole,
      reason: memo,
    });

    await this.outbox.publish(tx, {
      type: `order.${toStatus}`,
      aggregateType: 'order',
      aggregateId: order.id,
      payload: { orderCode: order.code, from: order.status, to: toStatus },
    });

    const notifyTargets: Array<{ userId: string; type: Parameters<NotificationsService['notify']>[1]['type'] }> = [];
    if (toStatus === 'delivered' || toStatus === 'accepted' || toStatus === 'in_progress' || toStatus === 'completed') {
      notifyTargets.push({ userId: order.buyerId, type: `order.${toStatus}` as never });
    }
    if (toStatus === 'completed' || toStatus === 'cancelled' || toStatus === 'refunded') {
      notifyTargets.push({ userId: order.providerId, type: `order.${toStatus}` as never });
    }
    if (toStatus === 'disputed') {
      notifyTargets.push({ userId: order.providerId, type: 'order.disputed' });
    }

    for (const target of notifyTargets) {
      await this.notifications.notify(tx, {
        userId: target.userId,
        type: target.type,
        payload: { orderCode: order.code, amountToman: (order.total / 10n).toString() },
        entityType: 'order',
        entityId: order.id,
      });
    }

    await this.audit.record(
      {
        actor,
        action: `order.${toStatus}`,
        entityType: 'order',
        entityId: order.id,
        before: { status: order.status },
        after: { status: toStatus, reason: memo },
      },
      tx,
    );

    return updated;
  }

  /** Called by the payment flows once money is confirmed to be in escrow. */
  async markPaid(tx: Database, order: OrderRow, actor: ActorContext, source: string) {
    if (order.status !== 'pending_payment') throw conflict(ERROR_CODES.ORDER_ALREADY_PAID);

    const deadlineHours = await this.settings.getNumber('orders.accept_deadline_hours', 48, tx);
    const now = new Date();

    const [updated] = await tx
      .update(orders)
      .set({
        status: 'paid',
        paymentStatus: 'escrow_held',
        acceptDeadlineAt: new Date(now.getTime() + deadlineHours * 60 * 60 * 1000),
      })
      .where(eq(orders.id, order.id))
      .returning();

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: 'paid',
      actorUserId: actor.userId,
      actorRole: 'system',
      reason: `پرداخت از ${source}`,
    });

    await tx
      .update(services)
      .set({ ordersCount: sql`${services.ordersCount} + 1` })
      .where(eq(services.id, (await this.serviceIdOf(tx, order.id)) ?? order.id));

    await this.outbox.publish(tx, {
      type: 'order.paid',
      aggregateType: 'order',
      aggregateId: order.id,
      payload: { orderCode: order.code, source },
    });

    await this.notifications.notify(tx, {
      userId: order.providerId,
      type: 'order.paid',
      payload: { orderCode: order.code },
      entityType: 'order',
      entityId: order.id,
    });
    await this.notifications.notify(tx, {
      userId: order.buyerId,
      type: 'order.paid',
      payload: { orderCode: order.code },
      entityType: 'order',
      entityId: order.id,
    });

    await this.audit.record(
      { actor, action: 'order.paid', entityType: 'order', entityId: order.id, after: { source } },
      tx,
    );

    return updated;
  }

  /** Locks the order row: concurrent transitions on one order must serialise. */
  async lockOrder(tx: Database, orderId: string): Promise<OrderRow> {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for('update');
    if (!order) throw new AppError(ERROR_CODES.ORDER_NOT_FOUND, { status: 404 });
    return order;
  }

  async findByIdOrCodeTx(tx: Database, idOrCode: string): Promise<OrderRow> {
    const [order] = await tx
      .select()
      .from(orders)
      .where(or(eq(orders.id, idOrCode), eq(orders.code, idOrCode.toUpperCase())))
      .limit(1);
    if (!order) throw new AppError(ERROR_CODES.ORDER_NOT_FOUND, { status: 404 });
    return order;
  }

  /* ------------------------------------------------------------------ */
  /* Reads                                                               */
  /* ------------------------------------------------------------------ */

  async list(userId: string, query: OrderQuery) {
    const limit = resolveLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const conditions = [
      query.role === 'provider' ? eq(orders.providerId, userId) : eq(orders.buyerId, userId),
      query.status ? eq(orders.status, query.status) : undefined,
      cursorCondition(orders.createdAt, orders.id, cursor),
    ].filter(Boolean);

    const rows = await this.dbService.db
      .select({
        order: orders,
        item: {
          titleSnapshot: orderItems.titleSnapshot,
          deliveryDaysSnapshot: orderItems.deliveryDaysSnapshot,
          serviceId: orderItems.serviceId,
        },
        buyerUsername: profiles.username,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(profiles, eq(profiles.userId, orders.buyerId))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit + 1);

    const page = buildPage(
      rows.map((row) => ({ ...row.order, id: row.order.id, createdAt: row.order.createdAt })),
      limit,
    );

    const byId = new Map(rows.map((row) => [row.order.id, row]));

    return {
      items: page.items.map((row) => {
        const full = byId.get(row.id)!;
        return {
          id: row.id,
          code: row.code,
          status: row.status,
          paymentStatus: row.paymentStatus,
          total: row.total.toString(),
          totalToman: formatToman(row.total),
          serviceTitle: full.item?.titleSnapshot ?? '',
          deliveryDays: full.item?.deliveryDaysSnapshot ?? 0,
          role: query.role,
          createdAt: row.createdAt,
          autoCompleteAt: row.autoCompleteAt,
          actions: OrderStateMachine.availableActions(row.status, query.role === 'provider' ? 'provider' : 'buyer'),
        };
      }),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  /** Full detail including history, delivery and conversation. */
  async detailForActor(orderIdOrCode: string, userId: string, roles: string[] = []) {
    const isAdmin = roles.includes('admin');
    const db = this.dbService.db;

    const [row] = await db
      .select({ order: orders, item: orderItems })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(or(eq(orders.id, orderIdOrCode), eq(orders.code, orderIdOrCode.toUpperCase())))
      .limit(1);

    if (!row) throw new AppError(ERROR_CODES.ORDER_NOT_FOUND, { status: 404 });

    const isBuyer = row.order.buyerId === userId;
    const isProvider = row.order.providerId === userId;
    if (!isBuyer && !isProvider && !isAdmin) throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });

    const role: OrderActor = isBuyer ? 'buyer' : isProvider ? 'provider' : 'admin';

    const [history, deliveries, dispute, participants] = await Promise.all([
      db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, row.order.id)).orderBy(asc(orderStatusHistory.createdAt)),
      db.select().from(orderDeliveries).where(eq(orderDeliveries.orderId, row.order.id)).orderBy(asc(orderDeliveries.createdAt)),
      db.select().from(disputes).where(eq(disputes.orderId, row.order.id)).limit(1),
      db
        .select({ userId: profiles.userId, username: profiles.username, displayName: profiles.displayName })
        .from(profiles)
        .where(or(eq(profiles.userId, row.order.buyerId), eq(profiles.userId, row.order.providerId))),
    ]);

    const buyerProfile = participants.find((participant) => participant.userId === row.order.buyerId);
    const providerProfile = participants.find((participant) => participant.userId === row.order.providerId);

    return {
      id: row.order.id,
      code: row.order.code,
      status: row.order.status,
      paymentStatus: row.order.paymentStatus,
      role,
      total: row.order.total.toString(),
      totalToman: formatToman(row.order.total),
      subtotal: row.order.subtotal.toString(),
      commission:
        isProvider || isAdmin
          ? { amount: row.order.commissionAmount.toString(), amountToman: formatToman(row.order.commissionAmount) }
          : undefined,
      providerNet: isProvider || isAdmin ? (row.order.total - row.order.commissionAmount).toString() : undefined,
      currency: row.order.currency,
      note: row.order.note,
      createdAt: row.order.createdAt,
      acceptedAt: row.order.acceptedAt,
      deliveredAt: row.order.deliveredAt,
      completedAt: row.order.completedAt,
      autoCompleteAt: row.order.autoCompleteAt,
      acceptDeadlineAt: row.order.acceptDeadlineAt,
      service: row.item
        ? {
            id: row.item.serviceId,
            title: row.item.titleSnapshot,
            description: row.item.descriptionSnapshot,
            deliveryDays: row.item.deliveryDaysSnapshot,
            price: row.item.priceSnapshot.toString(),
          }
        : null,
      buyer: buyerProfile ?? null,
      provider: providerProfile ?? null,
      history: history.map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        actorRole: entry.actorRole,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        message: delivery.message,
        fileIds: delivery.fileIds,
        createdAt: delivery.createdAt,
      })),
      dispute: dispute[0]
        ? {
            id: dispute[0].id,
            status: dispute[0].status,
            reason: dispute[0].reason,
            description: dispute[0].description,
            createdAt: dispute[0].createdAt,
            resolutionNote: dispute[0].resolutionNote,
          }
        : null,
      actions: OrderStateMachine.availableActions(row.order.status, role),
      progress: OrderStateMachine.progress(row.order.status),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Messaging                                                           */
  /* ------------------------------------------------------------------ */

  async listMessages(orderIdOrCode: string, userId: string, roles: string[] = []) {
    const order = await this.findByIdOrCode(orderIdOrCode);
    const isParticipant =
      order.buyerId === userId || order.providerId === userId || roles.includes('admin');
    if (!isParticipant) throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });

    const [conversation] = await this.dbService.db
      .select()
      .from(conversations)
      .where(eq(conversations.orderId, order.id))
      .limit(1);
    if (!conversation) return { items: [] };

    const rows = await this.dbService.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt))
      .limit(200);

    return {
      conversationId: conversation.id,
      items: rows.map((message) => ({
        id: message.id,
        senderId: message.senderId,
        body: message.body,
        fileIds: message.fileIds,
        createdAt: message.createdAt,
        mine: message.senderId === userId,
      })),
    };
  }

  async sendMessage(orderIdOrCode: string, userId: string, input: { body: string; fileIds?: string[] }) {
    const order = await this.findByIdOrCode(orderIdOrCode);
    if (order.buyerId !== userId && order.providerId !== userId) {
      throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });
    }

    const recipientId = order.buyerId === userId ? order.providerId : order.buyerId;

    return this.dbService.transaction(async (tx) => {
      let [conversation] = await tx.select().from(conversations).where(eq(conversations.orderId, order.id)).limit(1);
      if (!conversation) {
        [conversation] = await tx
          .insert(conversations)
          .values({ orderId: order.id, participantA: order.buyerId, participantB: order.providerId })
          .returning();
      }

      const [message] = await tx
        .insert(messages)
        .values({
          conversationId: conversation.id,
          senderId: userId,
          body: input.body,
          fileIds: input.fileIds ?? [],
        })
        .returning();

      await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));

      await this.notifications.notify(tx, {
        userId: recipientId,
        type: 'message.received',
        payload: { orderCode: order.code },
        entityType: 'order',
        entityId: order.id,
      });

      return { id: message.id, createdAt: message.createdAt };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Admin                                                              */
  /* ------------------------------------------------------------------ */

  /** Admin resolves a dispute, moving the money accordingly. */
  async adminResolve(
    orderId: string,
    decision: 'release_to_provider' | 'refund_buyer' | 'partial_refund',
    note: string,
    actor: ActorContext,
    partialAmount?: bigint,
  ) {
    return this.dbService.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== 'disputed') throw conflict(ERROR_CODES.ORDER_INVALID_TRANSITION);

      if (decision === 'release_to_provider') {
        const updated = await this.applyTransition(tx, order, 'completed', 'admin', actor, note);
        await tx
          .update(disputes)
          .set({ status: 'resolved_provider', resolutionNote: note, resolvedBy: actor.userId, resolvedAt: new Date() })
          .where(eq(disputes.orderId, order.id));
        return updated;
      }

      if (decision === 'refund_buyer') {
        const updated = await this.applyTransition(tx, order, 'refunded', 'admin', actor, note);
        await tx
          .update(disputes)
          .set({ status: 'resolved_buyer', resolutionNote: note, resolvedBy: actor.userId, resolvedAt: new Date() })
          .where(eq(disputes.orderId, order.id));
        return updated;
      }

      // Partial refund: part back to the buyer, the rest released to the provider.
      const amount = partialAmount ?? order.total / 2n;
      if (amount <= 0n || amount >= order.total) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: 'مبلغ بازگشت بخشی معتبر نیست.' });
      }

      await this.wallet.refundFromEscrow(tx, {
        orderId: order.id,
        orderCode: order.code,
        buyerId: order.buyerId,
        amount,
        memo: 'بازگشت بخشی وجه',
      });
      await this.wallet.releaseEscrow(tx, {
        orderId: order.id,
        orderCode: order.code,
        providerId: order.providerId,
        total: order.total - amount,
        commission: 0n,
      });

      const [updated] = await tx
        .update(orders)
        .set({ status: 'partially_refunded', paymentStatus: 'partially_refunded', completedAt: new Date() })
        .where(eq(orders.id, order.id))
        .returning();

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: 'partially_refunded',
        actorUserId: actor.userId,
        actorRole: 'admin',
        reason: note,
      });

      await tx
        .update(disputes)
        .set({
          status: 'resolved_buyer',
          resolutionNote: `${note} (بازگشت ${amount.toString()} ریال)`,
          resolvedBy: actor.userId,
          resolvedAt: new Date(),
        })
        .where(eq(disputes.orderId, order.id));

      await this.audit.record(
        {
          actor,
          action: 'order.partial_refund',
          entityType: 'order',
          entityId: order.id,
          after: { amount: amount.toString(), note },
        },
        tx,
      );

      return updated;
    });
  }

  async listDisputes(status?: string) {
    return this.dbService.db
      .select({
        id: disputes.id,
        orderId: disputes.orderId,
        status: disputes.status,
        reason: disputes.reason,
        description: disputes.description,
        createdAt: disputes.createdAt,
        orderCode: orders.code,
        total: orders.total,
      })
      .from(disputes)
      .innerJoin(orders, eq(orders.id, disputes.orderId))
      .where(status ? eq(disputes.status, status as never) : undefined)
      .orderBy(desc(disputes.createdAt))
      .limit(100);
  }

  /** Orders awaiting action, used by the auto-complete and deadline jobs. */
  async findDueForAutoComplete(limit = 50) {
    return this.dbService.db
      .select({ id: orders.id, code: orders.code })
      .from(orders)
      .where(and(eq(orders.status, 'delivered'), sql`${orders.autoCompleteAt} is not null`, sql`${orders.autoCompleteAt} <= now()`))
      .limit(limit);
  }

  async findExpiredAcceptDeadlines(limit = 50) {
    return this.dbService.db
      .select({ id: orders.id, code: orders.code })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'paid'),
          sql`${orders.acceptDeadlineAt} is not null`,
          sql`${orders.acceptDeadlineAt} <= now()`,
        ),
      )
      .limit(limit);
  }

  /**
   * System-driven cancellation: the provider did not accept in time, so the
   * buyer gets their money back automatically.
   */
  async systemCancel(orderId: string, reason: string): Promise<void> {
    await this.dbService.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== 'paid') return;
      await this.applyTransition(tx, order, 'cancelled', 'system', {
        userId: null,
        roles: [],
        requestId: 'accept-deadline',
      }, reason);
    });
  }

  /** System-driven completion after the buyer's review window expires. */
  async autoComplete(orderId: string): Promise<void> {
    await this.dbService.transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== 'delivered') return;
      await this.applyTransition(tx, order, 'completed', 'system', {
        userId: null,
        roles: [],
        requestId: 'auto-complete',
      });
      await this.notifications.notify(tx, {
        userId: order.buyerId,
        type: 'order.auto_completed',
        payload: { orderCode: order.code },
        entityType: 'order',
        entityId: order.id,
      });
    });
  }

  async findByIdOrCode(idOrCode: string): Promise<OrderRow> {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(or(eq(orders.id, idOrCode), eq(orders.code, idOrCode.toUpperCase())))
      .limit(1);
    if (!order) throw new AppError(ERROR_CODES.ORDER_NOT_FOUND, { status: 404 });
    return order;
  }

  private serviceIdOf(tx: Database, orderId: string): Promise<string | null> {
    return tx
      .select({ serviceId: orderItems.serviceId })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .limit(1)
      .then((rows) => rows[0]?.serviceId ?? null);
  }

  private assertParticipant(order: OrderRow, userId: string, roles: string[], expectedRole: OrderActor): void {
    if (roles.includes('admin')) return;
    if (expectedRole === 'buyer' && order.buyerId !== userId) {
      throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });
    }
    if (expectedRole === 'provider' && order.providerId !== userId) {
      throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });
    }
    if (order.buyerId !== userId && order.providerId !== userId) {
      throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });
    }
  }

  /** Used by the payments module to unlock an order after gateway payment. */
  async loadOrderRow(tx: Database, orderId: string): Promise<OrderRow> {
    return this.lockOrder(tx, orderId);
  }

  async unreadMessageCount(userId: string): Promise<number> {
    const [row] = await this.dbService.db
      .select({ count: sql<string>`count(*)` })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          or(eq(conversations.participantA, userId), eq(conversations.participantB, userId)),
          sql`${messages.senderId} <> ${userId}`,
          isNull(messages.readAt),
        ),
      );
    return Number(row?.count ?? 0);
  }
}
