import { Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  createReportSchema,
  createReviewSchema,
  ERROR_CODES,
  paginationQuerySchema,
  UUID_RE,
  type CreateReportInput,
  type CreateReviewInput,
} from '@taskeno/contracts';
import { Actor, CurrentUser, Public } from '../../common/decorators';
import { AppError, conflict } from '../../common/errors';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AuditService } from '../../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OutboxService } from '../../common/outbox.service';
import { buildPage, cursorCondition, decodeCursor, resolveLimit } from '../../common/pagination';
import type { ActorContext, AuthenticatedUser } from '../../common/types';
import { orderItems, orders, profiles, reports, reviews } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { NotificationsModule } from '../notifications/notifications.service';

/**
 * Reviews.
 *
 * A review is only possible after a completed order, exactly once per order and
 * author, and always targets the counterparty. Aggregates are recomputed inside
 * the same transaction so a listing can never show a stale rating.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly dbService: DbService,
    private readonly catalog: CatalogService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async create(authorId: string, orderIdOrCode: string, input: CreateReviewInput, actor: ActorContext) {
    const db = this.dbService.db;
    // Accept either the uuid or the short human readable code, but only ever
    // compare like with like (Postgres would reject a non-uuid id).
    const [orderRow] = UUID_RE.test(orderIdOrCode)
      ? await db.select().from(orders).where(eq(orders.id, orderIdOrCode)).limit(1)
      : await db.select().from(orders).where(eq(orders.code, orderIdOrCode.toUpperCase())).limit(1);

    if (!orderRow) throw new AppError(ERROR_CODES.ORDER_NOT_FOUND, { status: 404 });

    const isBuyer = orderRow.buyerId === authorId;
    const isProvider = orderRow.providerId === authorId;
    if (!isBuyer && !isProvider) throw new AppError(ERROR_CODES.ORDER_NOT_PARTICIPANT, { status: 403 });

    if (orderRow.status !== 'completed' && orderRow.status !== 'partially_refunded') {
      throw conflict(ERROR_CODES.REVIEW_NOT_ELIGIBLE);
    }

    const [existing] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.orderId, orderRow.id), eq(reviews.authorId, authorId)))
      .limit(1);
    if (existing) throw conflict(ERROR_CODES.REVIEW_ALREADY_SUBMITTED);

    const targetUserId = isBuyer ? orderRow.providerId : orderRow.buyerId;

    return this.dbService.transaction(async (tx) => {
      const [item] = await tx
        .select({ serviceId: orderItems.serviceId })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderRow.id))
        .limit(1);

      const [review] = await tx
        .insert(reviews)
        .values({
          orderId: orderRow.id,
          serviceId: item?.serviceId ?? null,
          authorId,
          targetUserId,
          rating: input.rating,
          comment: input.comment ?? null,
        })
        .returning();

      await this.catalog.refreshRating(tx, item?.serviceId ?? null, targetUserId);

      await this.notifications.notify(tx, {
        userId: targetUserId,
        type: 'review.received',
        payload: { rating: input.rating, orderCode: orderRow.code },
        entityType: 'order',
        entityId: orderRow.id,
      });

      await this.outbox.publish(tx, {
        type: 'review.created',
        aggregateType: 'order',
        aggregateId: orderRow.id,
        payload: { rating: input.rating, targetUserId },
      });

      await this.audit.record(
        { actor, action: 'review.create', entityType: 'order', entityId: orderRow.id, after: { rating: input.rating } },
        tx,
      );

      return { id: review.id, rating: review.rating, createdAt: review.createdAt };
    });
  }

  async listForService(serviceId: string, query: { limit?: number; cursor?: string }) {
    const limit = resolveLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const rows = await this.dbService.db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        authorUsername: profiles.username,
        authorDisplayName: profiles.displayName,
      })
      .from(reviews)
      .leftJoin(profiles, eq(profiles.userId, reviews.authorId))
      .where(
        and(
          eq(reviews.serviceId, serviceId),
          eq(reviews.isVisible, true),
          cursorCondition(reviews.createdAt, reviews.id, cursor),
        ),
      )
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(limit + 1);

    const page = buildPage(
      rows.map((row) => ({ ...row, id: row.id, createdAt: row.createdAt })),
      limit,
    );

    return {
      items: page.items.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.createdAt,
        author: { username: row.authorUsername ?? '', displayName: row.authorDisplayName ?? '' },
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async listForUser(userId: string, limit = 20) {
    const rows = await this.dbService.db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        authorUsername: profiles.username,
        authorDisplayName: profiles.displayName,
      })
      .from(reviews)
      .leftJoin(profiles, eq(profiles.userId, reviews.authorId))
      .where(and(eq(reviews.targetUserId, userId), eq(reviews.isVisible, true)))
      .orderBy(desc(reviews.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt,
      author: { username: row.authorUsername ?? '', displayName: row.authorDisplayName ?? '' },
    }));
  }

  /** Admin moderation: hiding a review also refreshes the aggregates. */
  async setVisibility(reviewId: string, visible: boolean, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const [review] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
      if (!review) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });

      await tx.update(reviews).set({ isVisible: visible }).where(eq(reviews.id, reviewId));
      await this.catalog.refreshRating(tx, review.serviceId, review.targetUserId);

      await this.audit.record(
        {
          actor,
          action: visible ? 'review.show' : 'review.hide',
          entityType: 'review',
          entityId: reviewId,
        },
        tx,
      );

      return { ok: true };
    });
  }

  async createReport(reporterId: string, input: CreateReportInput, actor: ActorContext) {
    const [report] = await this.dbService.db
      .insert(reports)
      .values({
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        description: input.description ?? null,
      })
      .returning();

    await this.audit.record(
      { actor, action: 'report.create', entityType: 'report', entityId: report.id, after: { reason: input.reason } },
    );

    return { id: report.id };
  }

  async listReviewsForOrder(orderId: string) {
    return this.dbService.db.select().from(reviews).where(eq(reviews.orderId, orderId));
  }
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('orders/:id/review')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewInput,
    @Actor() actor: ActorContext,
  ) {
    return this.reviews.create(user.id, id, body, actor);
  }

  @Public()
  @Get('services/:id/reviews')
  forService(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: { limit?: number; cursor?: string },
  ) {
    return this.reviews.listForService(id, query);
  }

  @Public()
  @Get('users/:id/reviews')
  forUser(@Param('id') id: string) {
    return this.reviews.listForUser(id);
  }

  @Post('reports')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReportSchema)) body: CreateReportInput,
    @Actor() actor: ActorContext,
  ) {
    return this.reviews.createReport(user.id, body, actor);
  }
}

@Module({
  imports: [CatalogModule, NotificationsModule],
  providers: [ReviewsService],
  controllers: [ReviewsController],
  exports: [ReviewsService],
})
export class ReviewsModule {}
