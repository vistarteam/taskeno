import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { DISPUTE_STATUSES, ORDER_PAYMENT_STATUSES, ORDER_STATUSES, REPORT_STATUSES } from '@taskeno/contracts';
import { categories, services } from './catalog';
import { users } from './identity';
import { money } from './types';

export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const orderPaymentStatusEnum = pgEnum('order_payment_status', ORDER_PAYMENT_STATUSES);
export const disputeStatusEnum = pgEnum('dispute_status', DISPUTE_STATUSES);
export const reportStatusEnum = pgEnum('report_status', REPORT_STATUSES);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Short human readable reference shown to users, e.g. TK-8F3K2M. */
    code: varchar('code', { length: 16 }).notNull(),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    currency: varchar('currency', { length: 3 }).notNull().default('IRR'),
    subtotal: money('subtotal').notNull(),
    /** Commission frozen at payment time so history never changes retroactively. */
    commissionAmount: money('commission_amount').notNull().default(sql`0`),
    commissionSnapshot: jsonb('commission_snapshot').$type<Record<string, unknown> | null>(),
    total: money('total').notNull(),
    status: orderStatusEnum('status').notNull().default('pending_payment'),
    paymentStatus: orderPaymentStatusEnum('payment_status').notNull().default('unpaid'),
    note: varchar('note', { length: 1000 }),
    idempotencyKey: varchar('idempotency_key', { length: 120 }),
    acceptDeadlineAt: timestamp('accept_deadline_at', { withTimezone: true, mode: 'date' }),
    autoCompleteAt: timestamp('auto_complete_at', { withTimezone: true, mode: 'date' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancellationReason: varchar('cancellation_reason', { length: 300 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_code_key').on(t.code),
    uniqueIndex('orders_idempotency_key').on(t.buyerId, t.idempotencyKey),
    index('orders_buyer_idx').on(t.buyerId, t.status, t.createdAt),
    index('orders_provider_idx').on(t.providerId, t.status, t.createdAt),
    index('orders_auto_complete_idx').on(t.status, t.autoCompleteAt),
    index('orders_accept_deadline_idx').on(t.status, t.acceptDeadlineAt),
  ],
);

/**
 * Immutable order line. Title/description/price/delivery are copied from the
 * service at purchase time: editing or deleting a service afterwards must never
 * rewrite history.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    serviceSnapshot: jsonb('service_snapshot').$type<Record<string, unknown>>().notNull(),
    titleSnapshot: varchar('title_snapshot', { length: 120 }).notNull(),
    descriptionSnapshot: text('description_snapshot').notNull(),
    priceSnapshot: money('price_snapshot').notNull(),
    deliveryDaysSnapshot: smallint('delivery_days_snapshot').notNull(),
    quantity: integer('quantity').notNull().default(1),
    total: money('total').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorRole: varchar('actor_role', { length: 20 }),
    reason: varchar('reason', { length: 600 }),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('order_status_history_order_idx').on(t.orderId, t.createdAt)],
);

export const orderDeliveries = pgTable(
  'order_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('order_deliveries_order_idx').on(t.orderId)],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    participantA: uuid('participant_a')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    participantB: uuid('participant_b')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_order_key').on(t.orderId),
    index('conversations_participant_a_idx').on(t.participantA, t.lastMessageAt),
    index('conversations_participant_b_idx').on(t.participantB, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: varchar('reason', { length: 120 }).notNull(),
    description: varchar('description', { length: 1000 }),
    status: disputeStatusEnum('status').notNull().default('open'),
    resolutionNote: varchar('resolution_note', { length: 600 }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('disputes_order_open_key').on(t.orderId), index('disputes_status_idx').on(t.status)],
);

/** One review per order per participant; enforced by a unique index. */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: smallint('rating').notNull(),
    comment: varchar('comment', { length: 1000 }),
    isVisible: boolean('is_visible').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reviews_order_author_key').on(t.orderId, t.authorId),
    index('reviews_service_idx').on(t.serviceId, t.createdAt),
    index('reviews_target_idx').on(t.targetUserId, t.createdAt),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: varchar('target_type', { length: 20 }).notNull(),
    targetId: uuid('target_id').notNull(),
    reason: varchar('reason', { length: 120 }).notNull(),
    description: varchar('description', { length: 1000 }),
    status: reportStatusEnum('status').notNull().default('open'),
    handledBy: uuid('handled_by').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: varchar('resolution_note', { length: 600 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt)],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  buyer: one(users, { fields: [orders.buyerId], references: [users.id] }),
  provider: one(users, { fields: [orders.providerId], references: [users.id] }),
  items: many(orderItems),
  history: many(orderStatusHistory),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  service: one(services, { fields: [orderItems.serviceId], references: [services.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
  service: one(services, { fields: [reviews.serviceId], references: [services.id] }),
  author: one(users, { fields: [reviews.authorId], references: [users.id] }),
}));

export const categoryOrdersRelations = relations(categories, () => ({}));
