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
import {
  COMMISSION_CALC_TYPES,
  COMMISSION_SCOPES,
  JOURNAL_KINDS,
  LEDGER_DIRECTIONS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  WALLET_OWNER_TYPES,
} from '@taskeno/contracts';
import { orders } from './commerce';
import { users } from './identity';
import { money, nullableMoney } from './types';

export const walletOwnerTypeEnum = pgEnum('wallet_owner_type', WALLET_OWNER_TYPES);
export const journalKindEnum = pgEnum('journal_kind', JOURNAL_KINDS);
export const ledgerDirectionEnum = pgEnum('ledger_direction', LEDGER_DIRECTIONS);
export const paymentPurposeEnum = pgEnum('payment_purpose', PAYMENT_PURPOSES);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const commissionScopeEnum = pgEnum('commission_scope', COMMISSION_SCOPES);
export const commissionCalcTypeEnum = pgEnum('commission_calc_type', COMMISSION_CALC_TYPES);

/**
 * A wallet is a named bucket of money. Users own exactly one wallet per
 * currency; the platform owns the system wallets that make double-entry
 * bookkeeping possible (escrow, revenue, gateway clearing, ...).
 *
 * `balance` is a cached projection of the ledger, updated inside the same
 * transaction as the ledger entries and verified by the nightly reconciliation
 * job. The ledger is always the source of truth.
 */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerType: walletOwnerTypeEnum('owner_type').notNull().default('user'),
    ownerId: uuid('owner_id'),
    /** Set only for platform wallets: ESCROW, REVENUE, GATEWAY_CLEARING, ... */
    code: varchar('code', { length: 32 }),
    currency: varchar('currency', { length: 3 }).notNull().default('IRR'),
    balance: money('balance').notNull().default(sql`0`),
    version: integer('version').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wallets_owner_key').on(t.ownerType, t.ownerId, t.currency),
    uniqueIndex('wallets_code_key').on(t.code),
    index('wallets_owner_id_idx').on(t.ownerId),
  ],
);

/**
 * A journal is one financial event. It groups 2+ ledger entries whose debits
 * and credits must sum to zero — enforced by a deferred constraint trigger in
 * the database, so an unbalanced posting can never be committed.
 * Journals are append-only: corrections are made with a compensating journal.
 */
export const journals = pgTable(
  'journals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: journalKindEnum('kind').notNull(),
    referenceType: varchar('reference_type', { length: 32 }),
    referenceId: uuid('reference_id'),
    /** Guarantees a retried request can never post the same money twice. */
    idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
    memo: varchar('memo', { length: 300 }),
    createdBy: uuid('created_by'),
    requestId: varchar('request_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('journals_idempotency_key_key').on(t.idempotencyKey),
    index('journals_reference_idx').on(t.referenceType, t.referenceId),
    index('journals_kind_idx').on(t.kind, t.createdAt),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journals.id, { onDelete: 'restrict' }),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    direction: ledgerDirectionEnum('direction').notNull(),
    amount: money('amount').notNull(),
    balanceBefore: money('balance_before').notNull(),
    balanceAfter: money('balance_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_entries_journal_wallet_key').on(t.journalId, t.walletId, t.direction),
    index('ledger_entries_wallet_idx').on(t.walletId, t.createdAt),
    index('ledger_entries_journal_idx').on(t.journalId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    purpose: paymentPurposeEnum('purpose').notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    amount: money('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('IRR'),
    status: paymentStatusEnum('status').notNull().default('created'),
    /** Authority/reference issued by the gateway; unique per provider. */
    providerAuthority: varchar('provider_authority', { length: 120 }),
    providerReference: varchar('provider_reference', { length: 120 }),
    redirectUrl: text('redirect_url'),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    failureCode: varchar('failure_code', { length: 60 }),
    failureMessage: varchar('failure_message', { length: 300 }),
    requestPayload: jsonb('request_payload').$type<Record<string, unknown> | null>(),
    verifyPayload: jsonb('verify_payload').$type<Record<string, unknown> | null>(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_provider_authority_key').on(t.provider, t.providerAuthority),
    uniqueIndex('payments_idempotency_key').on(t.userId, t.idempotencyKey),
    index('payments_user_idx').on(t.userId, t.createdAt),
    index('payments_status_idx').on(t.status, t.expiresAt),
    index('payments_order_idx').on(t.orderId),
  ],
);

/** Raw record of every gateway callback/webhook: never trust, always verify. */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 20 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    signatureValid: boolean('signature_valid'),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('payment_events_payment_idx').on(t.paymentId, t.createdAt)],
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    amount: money('amount').notNull(),
    reason: varchar('reason', { length: 300 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('succeeded'),
    providerReference: varchar('provider_reference', { length: 120 }),
    journalId: uuid('journal_id').references(() => journals.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('refunds_order_idx').on(t.orderId)],
);

/**
 * Idempotency keys make every unsafe financial endpoint safely retryable.
 * A repeated key with a different body is rejected; a repeated key with the
 * same body replays the stored response.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: varchar('scope', { length: 60 }).notNull(),
    key: varchar('key', { length: 160 }).notNull(),
    userId: uuid('user_id'),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('in_progress'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [uniqueIndex('idempotency_keys_scope_key_key').on(t.scope, t.key, t.userId)],
);

/**
 * Commission is data, never hard-coded. The most specific matching active rule
 * wins (service > category > global). `percentBps` is basis points (1000 = 10%)
 * so that no floating point math is ever involved.
 */
export const commissionRules = pgTable(
  'commission_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: commissionScopeEnum('scope').notNull(),
    scopeRef: uuid('scope_ref'),
    calcType: commissionCalcTypeEnum('calc_type').notNull().default('percent'),
    percentBps: integer('percent_bps').notNull().default(0),
    fixedAmount: money('fixed_amount').notNull().default(sql`0`),
    minCommission: nullableMoney('min_commission'),
    maxCommission: nullableMoney('max_commission'),
    priority: smallint('priority').notNull().default(100),
    isActive: boolean('is_active').notNull().default(true),
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true, mode: 'date' }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('commission_rules_scope_idx').on(t.scope, t.scopeRef, t.isActive),
    index('commission_rules_priority_idx').on(t.priority),
  ],
);

export const walletsRelations = relations(wallets, ({ many }) => ({
  entries: many(ledgerEntries),
}));

export const journalsRelations = relations(journals, ({ many }) => ({
  entries: many(ledgerEntries),
}));
