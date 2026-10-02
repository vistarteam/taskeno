import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { ROLE_KEYS, USER_STATUSES } from '@taskeno/contracts';

export const userStatusEnum = pgEnum('user_status', USER_STATUSES);
export const roleKeyEnum = pgEnum('role_key', ROLE_KEYS);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }),
    phone: varchar('phone', { length: 20 }),
    passwordHash: text('password_hash').notNull(),
    status: userStatusEnum('status').notNull().default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true, mode: 'date' }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_phone_key').on(t.phone),
    index('users_status_idx').on(t.status),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque token. The raw token is never stored. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    userAgent: varchar('user_agent', { length: 400 }),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedReason: varchar('revoked_reason', { length: 120 }),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId, t.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    requestedIp: varchar('requested_ip', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('password_reset_tokens_hash_key').on(t.tokenHash), index('password_reset_user_idx').on(t.userId)],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 16 }).notNull(), // email | phone
    purpose: varchar('purpose', { length: 32 }).notNull(), // verify_email | verify_phone
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('verification_tokens_user_idx').on(t.userId, t.purpose)],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: roleKeyEnum('key').notNull(),
    titleFa: varchar('title_fa', { length: 60 }).notNull(),
    description: varchar('description', { length: 240 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('roles_key_key').on(t.key)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    grantedBy: uuid('granted_by'),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    username: varchar('username', { length: 30 }).notNull(),
    displayName: varchar('display_name', { length: 60 }).notNull(),
    avatarFileId: uuid('avatar_file_id'),
    bio: varchar('bio', { length: 600 }),
    province: varchar('province', { length: 60 }),
    city: varchar('city', { length: 60 }),
    skills: jsonb('skills').$type<string[]>().notNull().default([]),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    completedOrdersCount: integer('completed_orders_count').notNull().default(0),
    isProvider: boolean('is_provider').notNull().default(false),
    providerVerifiedAt: timestamp('provider_verified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('profiles_username_key').on(t.username), index('profiles_provider_idx').on(t.isProvider)],
);

/**
 * Append-only audit trail. Every privileged or financial action is recorded
 * here with before/after snapshots. Rows are never updated or deleted.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id'),
    actorRole: varchar('actor_role', { length: 20 }),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    ip: varchar('ip', { length: 64 }),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorUserId, t.createdAt),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  sessions: many(sessions),
  roles: many(userRoles),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));
