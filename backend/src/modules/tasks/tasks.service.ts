import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { ERROR_CODES, formatToman, money } from '@taskeno/contracts';
import { AppError, conflict } from '../../common/errors';
import { generateOrderCode } from '../../common/crypto';
import { AuditService } from '../../common/audit.service';
import { OutboxService } from '../../common/outbox.service';
import type { ActorContext } from '../../common/types';
import type { Database } from '../../db/client';
import {
    categories,
    conversations,
    orderItems,
    orderStatusHistory,
    orders,
    profiles,
    tasks,
} from '../../db/schema';
import { DbService } from '../../db/db.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommissionService } from '../wallet/commission.service';

type CreateTaskInput = {
    title: string;
    description: string;
    budgetRial: bigint;
    estimatedMinutes: number;
    categoryId?: string | null;
    expiresInMinutes: number;
};

@Injectable()
export class TasksService {
    constructor(
        private readonly dbService: DbService,
        private readonly commission: CommissionService,
        private readonly notifications: NotificationsService,
        private readonly outbox: OutboxService,
        private readonly audit: AuditService,
    ) {}

    async create(buyerId: string, input: CreateTaskInput, actor: ActorContext) {
        const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);

        return this.dbService.transaction(async (tx) => {
            if (input.categoryId) {
                const [category] = await tx
                    .select({ id: categories.id })
                    .from(categories)
                    .where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true)))
                    .limit(1);

                if (!category) {
                    throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, { status: 404 });
                }
            }

            const [task] = await tx
                .insert(tasks)
                .values({
                    buyerId,
                    categoryId: input.categoryId ?? null,
                    title: input.title,
                    description: input.description,
                    budget: input.budgetRial,
                    currency: 'IRR',
                    estimatedMinutes: input.estimatedMinutes,
                    status: 'open',
                    expiresAt,
                })
                .returning();

            await this.audit.record(
                {
                    actor,
                    action: 'task.create',
                    entityType: 'task',
                    entityId: task.id,
                    after: {
                        title: task.title,
                        budget: task.budget.toString(),
                        estimatedMinutes: task.estimatedMinutes,
                    },
                },
                tx,
            );

            return this.serialize(task);
        });
    }

    async listOpen(limit = 30) {
        const now = new Date();

        const rows = await this.dbService.db
            .select({
                task: tasks,
                buyerUsername: profiles.username,
                buyerDisplayName: profiles.displayName,
                categoryTitle: categories.titleFa,
            })
            .from(tasks)
            .leftJoin(profiles, eq(profiles.userId, tasks.buyerId))
            .leftJoin(categories, eq(categories.id, tasks.categoryId))
            .where(
                and(
                    eq(tasks.status, 'open'),
                    or(isNull(tasks.expiresAt), gt(tasks.expiresAt, now)),
                ),
            )
            .orderBy(desc(tasks.createdAt))
            .limit(limit);

        return {
            items: rows.map((row) => ({
                ...this.serialize(row.task),
                buyer: row.buyerUsername
                    ? {
                        username: row.buyerUsername,
                        displayName: row.buyerDisplayName ?? row.buyerUsername,
                    }
                    : null,
                category: row.categoryTitle
                    ? { titleFa: row.categoryTitle }
                    : null,
            })),
        };
    }

    async detail(id: string) {
        const [row] = await this.dbService.db
            .select({
                task: tasks,
                buyerUsername: profiles.username,
                buyerDisplayName: profiles.displayName,
                categoryTitle: categories.titleFa,
            })
            .from(tasks)
            .leftJoin(profiles, eq(profiles.userId, tasks.buyerId))
            .leftJoin(categories, eq(categories.id, tasks.categoryId))
            .where(eq(tasks.id, id))
            .limit(1);

        if (!row) {
            throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });
        }

        return {
            ...this.serialize(row.task),
            buyer: row.buyerUsername
                ? {
                    username: row.buyerUsername,
                    displayName: row.buyerDisplayName ?? row.buyerUsername,
                }
                : null,
            category: row.categoryTitle
                ? { titleFa: row.categoryTitle }
                : null,
        };
    }

    async take(taskId: string, providerId: string, actor: ActorContext) {
        return this.dbService.transaction(async (tx) => {
            const [task] = await tx
                .update(tasks)
                .set({
                    providerId,
                    status: 'taken',
                    takenAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(tasks.id, taskId),
                        eq(tasks.status, 'open'),
                        or(isNull(tasks.expiresAt), gt(tasks.expiresAt, new Date())),
                    ),
                )
                .returning();

            if (!task) {
                throw conflict(ERROR_CODES.TASK_NOT_AVAILABLE);
            }

            if (task.buyerId === providerId) {
                throw conflict(ERROR_CODES.TASK_CANNOT_TAKE_OWN);
            }

            const commission = await this.commission.calculate(
                {
                    amount: task.budget,
                    categoryId: task.categoryId,
                    providerId,
                },
                tx,
            );

            const total = task.budget + commission.amount;
            const code = generateOrderCode();

            const [order] = await tx
                .insert(orders)
                .values({
                    code,
                    buyerId: task.buyerId,
                    providerId,
                    currency: task.currency,
                    subtotal: task.budget,
                    commissionAmount: commission.amount,
                    commissionSnapshot: commission.snapshot as unknown as Record<string, unknown>,
                    total,
                    status: 'pending_payment',
                    paymentStatus: 'unpaid',
                    note: `سفارش ایجادشده از تسک ${task.id}`,
                })
                .returning();

            await tx.insert(orderItems).values({
                orderId: order.id,
                serviceId: null,
                serviceSnapshot: {
                    source: 'task',
                    taskId: task.id,
                    title: task.title,
                    description: task.description,
                    price: task.budget.toString(),
                    estimatedMinutes: task.estimatedMinutes,
                },
                titleSnapshot: task.title,
                descriptionSnapshot: task.description,
                priceSnapshot: task.budget,
                deliveryDaysSnapshot: 1,
                quantity: 1,
                total: task.budget,
            });

            await tx.insert(orderStatusHistory).values({
                orderId: order.id,
                fromStatus: null,
                toStatus: 'pending_payment',
                actorUserId: providerId,
                actorRole: 'provider',
                reason: 'قبول سریع تسک',
            });

            await tx.insert(conversations).values({
                orderId: order.id,
                participantA: task.buyerId,
                participantB: providerId,
            });

            await tx
                .update(tasks)
                .set({
                    orderId: order.id,
                    updatedAt: new Date(),
                })
                .where(eq(tasks.id, task.id));

            await this.outbox.publish(tx, {
                type: 'order.created',
                aggregateType: 'order',
                aggregateId: order.id,
                payload: {
                    orderCode: order.code,
                    buyerId: task.buyerId,
                    providerId,
                    taskId: task.id,
                },
            });

            await this.notifications.notify(tx, {
                userId: task.buyerId,
                type: 'order.created',
                payload: {
                    orderCode: order.code,
                    taskId: task.id,
                },
                entityType: 'order',
                entityId: order.id,
            });

            await this.audit.record(
                {
                    actor,
                    action: 'task.take',
                    entityType: 'task',
                    entityId: task.id,
                    after: {
                        providerId,
                        orderId: order.id,
                        orderCode: order.code,
                    },
                },
                tx,
            );

            return {
                task: this.serialize({
                    ...task,
                    orderId: order.id,
                }),
                order: {
                    id: order.id,
                    code: order.code,
                    status: order.status,
                    paymentStatus: order.paymentStatus,
                    subtotal: order.subtotal.toString(),
                    subtotalToman: formatToman(order.subtotal),
                    commission: order.commissionAmount.toString(),
                    commissionToman: formatToman(order.commissionAmount),
                    total: order.total.toString(),
                    totalToman: formatToman(order.total),
                },
            };
        });
    }

    async cancel(taskId: string, buyerId: string, actor: ActorContext) {
        return this.dbService.transaction(async (tx) => {
            const [task] = await tx
                .update(tasks)
                .set({
                    status: 'cancelled',
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(tasks.id, taskId),
                        eq(tasks.buyerId, buyerId),
                        eq(tasks.status, 'open'),
                    ),
                )
                .returning();

            if (!task) {
                throw conflict(ERROR_CODES.TASK_NOT_CANCELLABLE);
            }

            await this.audit.record(
                {
                    actor,
                    action: 'task.cancel',
                    entityType: 'task',
                    entityId: task.id,
                    after: { status: 'cancelled' },
                },
                tx,
            );

            return this.serialize(task);
        });
    }

    private serialize(task: typeof tasks.$inferSelect) {
        return {
            id: task.id,
            title: task.title,
            description: task.description,
            budget: task.budget.toString(),
            budgetToman: formatToman(task.budget),
            currency: task.currency,
            estimatedMinutes: task.estimatedMinutes,
            status: task.status,
            buyerId: task.buyerId,
            providerId: task.providerId,
            categoryId: task.categoryId,
            orderId: task.orderId,
            expiresAt: task.expiresAt,
            takenAt: task.takenAt,
            completedAt: task.completedAt,
            createdAt: task.createdAt,
        };
    }
}