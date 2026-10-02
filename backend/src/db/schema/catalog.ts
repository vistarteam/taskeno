import { relations } from 'drizzle-orm';
import {
  AnyPgColumn,
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
import { FILE_STATUSES, SERVICE_STATUSES } from '@taskeno/contracts';
import { users } from './identity';
import { money } from './types';

export const serviceStatusEnum = pgEnum('service_status', SERVICE_STATUSES);
export const fileStatusEnum = pgEnum('file_status', FILE_STATUSES);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'restrict' }),
    slug: varchar('slug', { length: 60 }).notNull(),
    titleFa: varchar('title_fa', { length: 80 }).notNull(),
    description: varchar('description', { length: 300 }),
    icon: varchar('icon', { length: 40 }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug), index('categories_parent_idx').on(t.parentId, t.sortOrder)],
);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageProvider: varchar('storage_provider', { length: 20 }).notNull().default('local'),
    storageKey: text('storage_key').notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mime: varchar('mime', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    checksum: varchar('checksum', { length: 64 }).notNull(),
    variants: jsonb('variants').$type<Record<string, string>>().notNull().default({}),
    status: fileStatusEnum('status').notNull().default('ready'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('files_owner_idx').on(t.ownerUserId),
    uniqueIndex('files_checksum_owner_key').on(t.ownerUserId, t.checksum),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    description: text('description').notNull(),
    price: money('price').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('IRR'),
    deliveryDays: smallint('delivery_days').notNull(),
    revisions: smallint('revisions').notNull().default(0),
    status: serviceStatusEnum('status').notNull().default('draft'),
    rejectionReason: varchar('rejection_reason', { length: 300 }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    ordersCount: integer('orders_count').notNull().default(0),
    viewsCount: integer('views_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('services_slug_key').on(t.slug),
    index('services_browse_idx').on(t.status, t.categoryId, t.createdAt),
    index('services_provider_idx').on(t.providerId, t.status),
    index('services_price_idx').on(t.price),
  ],
);

export const serviceImages = pgTable(
  'service_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    alt: varchar('alt', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('service_images_order_key').on(t.serviceId, t.sortOrder),
    index('service_images_service_idx').on(t.serviceId),
  ],
);

export const serviceTags = pgTable(
  'service_tags',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 30 }).notNull(),
  },
  (t) => [uniqueIndex('service_tags_key').on(t.serviceId, t.tag), index('service_tags_tag_idx').on(t.tag)],
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  services: many(services),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  category: one(categories, { fields: [services.categoryId], references: [categories.id] }),
  provider: one(users, { fields: [services.providerId], references: [users.id] }),
  images: many(serviceImages),
  tags: many(serviceTags),
}));

export const filesRelations = relations(files, ({ one }) => ({
  owner: one(users, { fields: [files.ownerUserId], references: [users.id] }),
}));
