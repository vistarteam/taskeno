import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './identity';

/**
 * Transactional outbox.
 *
 * A business change and its side effects (notifications, ledger follow-ups)
 * are written in the same transaction. The worker picks up pending rows and
 * dispatches them, so a crash can never lose an event or send one twice
 * silently.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: varchar('event_type', { length: 60 }).notNull(),
    aggregateType: varchar('aggregate_type', { length: 40 }).notNull(),
    aggregateId: uuid('aggregate_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastError: varchar('last_error', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [index('outbox_events_status_idx').on(t.status, t.availableAt), index('outbox_events_aggregate_idx').on(t.aggregateId)],
);

/**
 * Postgres-backed job queue. Deliberately avoids Redis for the MVP: fewer
 * moving parts, one datastore, and `FOR UPDATE SKIP LOCKED` gives us safe
 * multi-worker consumption when we scale horizontally.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 60 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAt: timestamp('run_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    lockedBy: varchar('locked_by', { length: 60 }),
    /** Set for recurring jobs: identifies the singleton job per type. */
    uniqueKey: varchar('unique_key', { length: 80 }),
    lastError: varchar('last_error', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('jobs_poll_idx').on(t.status, t.runAt),
    uniqueIndex('jobs_unique_key_idx').on(t.uniqueKey),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 60 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: varchar('body', { length: 600 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    entityType: varchar('entity_type', { length: 40 }),
    entityId: uuid('entity_id'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt),
    index('notifications_unread_idx').on(t.userId, t.createdAt),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    /** Empty array means "all types enabled". */
    disabledTypes: jsonb('disabled_types').$type<string[]>().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_preferences_key').on(t.userId, t.channel)],
);

/** Typed key/value settings managed by admins (commission defaults, flags...). */
export const settings = pgTable(
  'settings',
  {
    key: varchar('key', { length: 80 }).primaryKey(),
    value: jsonb('value').$type<unknown>().notNull(),
    description: varchar('description', { length: 300 }),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    providerMessageId: varchar('provider_message_id', { length: 120 }),
    lastError: varchar('last_error', { length: 300 }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('notification_deliveries_notification_idx').on(t.notificationId)],
);

export const paymentCallbackLog = pgTable(
  'payment_callback_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: varchar('provider', { length: 32 }).notNull(),
    rawQuery: text('raw_query'),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('payment_callback_log_created_idx').on(t.createdAt)],
);
