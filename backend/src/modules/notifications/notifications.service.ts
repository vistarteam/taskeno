import { Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { paginationQuerySchema, type NotificationType } from '@taskeno/contracts';
import { CurrentUser } from '../../common/decorators';
import { AppError, ERROR_CODES } from '../../common/errors';
import { buildPage, decodeCursor, resolveLimit } from '../../common/pagination';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import type { Database } from '../../db/client';
import { notifications } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { renderNotification } from './notification-templates';

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  payload?: Record<string, unknown>;
  entityType?: string;
  entityId?: string | null;
  title?: string;
  body?: string;
};

/**
 * In-app notifications are written inside the caller's transaction, so a
 * notification can never describe a change that was rolled back. Other channels
 * (email, SMS, Telegram, push) plug in later through the same call site.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly dbService: DbService) {}

  async notify(tx: Database, input: NotifyInput): Promise<void> {
    const content = renderNotification(input.type, input.payload ?? {});
    await tx.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title ?? content.title,
      body: input.body ?? content.body,
      payload: input.payload ?? {},
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });
  }

  async list(userId: string, query: { limit?: number; cursor?: string }) {
    const limit = resolveLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const rows = await this.dbService.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          cursor ? sql`(${notifications.createdAt}, ${notifications.id}) < (${new Date(cursor.t)}, ${cursor.i})` : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);

    const page = buildPage(rows, limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        payload: row.payload,
        entityType: row.entityType,
        entityId: row.entityId,
        read: Boolean(row.readAt),
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.dbService.db
      .select({ count: sql<string>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return Number(row?.count ?? 0);
  }

  async markRead(userId: string, id: string): Promise<void> {
    const rows = await this.dbService.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });
    if (rows.length === 0) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await this.dbService.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return rows.length;
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: { limit?: number; cursor?: string },
  ) {
    return this.service.list(user.id, query);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.service.unreadCount(user.id) };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    return { updated: await this.service.markAllRead(user.id) };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.service.markRead(user.id, id);
    return { ok: true };
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
