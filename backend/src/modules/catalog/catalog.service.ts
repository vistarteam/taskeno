import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import {
  ERROR_CODES,
  type CreateCategoryInput,
  type CreateServiceInput,
  type ServiceQuery,
  type UpdateServiceInput,
} from '@taskeno/contracts';
import { AppError, conflict } from '../../common/errors';
import { sha256, uniqueSlug } from '../../common/crypto';
import { AuditService } from '../../common/audit.service';
import { OutboxService } from '../../common/outbox.service';
import { buildPage, cursorCondition, decodeCursor, resolveLimit } from '../../common/pagination';
import type { ActorContext } from '../../common/types';
import type { Database } from '../../db/client';
import { categories, files, profiles, reviews, serviceImages, serviceTags, services, users } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { env } from '../../config/env';
import { ALLOWED_IMAGE_MIMES, StorageService, detectImageMime } from '../storage/storage.service';

export type ServiceCard = {
  id: string;
  slug: string;
  title: string;
  price: string;
  priceToman: string;
  deliveryDays: number;
  rating: number;
  ratingCount: number;
  ordersCount: number;
  status: string;
  category: { id: string; titleFa: string; slug: string } | null;
  provider: { userId: string; username: string; displayName: string; isProvider: boolean } | null;
  imageFileId: string | null;
  createdAt: Date;
};

/**
 * Catalog: categories, the service lifecycle and search.
 *
 * Publication rules are enforced here (not in the UI) and every transition is
 * audited. Search uses PostgreSQL full-text search over an indexed expression
 * with a `simple` configuration, which handles Persian text without a
 * dedicated search service; `SearchService` can be swapped later behind this
 * same method.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly dbService: DbService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Categories                                                          */
  /* ------------------------------------------------------------------ */

  async categoryTree() {
    const rows = await this.dbService.db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.titleFa));

    const parents = rows.filter((row) => row.parentId === null);
    return parents.map((parent) => ({
      id: parent.id,
      slug: parent.slug,
      titleFa: parent.titleFa,
      icon: parent.icon,
      children: rows
        .filter((row) => row.parentId === parent.id)
        .map((child) => ({ id: child.id, slug: child.slug, titleFa: child.titleFa, icon: child.icon })),
    }));
  }

  async categoryBySlug(slug: string) {
    const [category] = await this.dbService.db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!category) throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, { status: 404 });
    const children = await this.dbService.db
      .select()
      .from(categories)
      .where(eq(categories.parentId, category.id))
      .orderBy(asc(categories.sortOrder));
    return { ...category, children };
  }

  async createCategory(input: CreateCategoryInput, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      if (input.parentId) {
        const [parent] = await tx.select().from(categories).where(eq(categories.id, input.parentId)).limit(1);
        if (!parent) throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, { status: 404 });
        // Two levels keep navigation shallow and comprehensible.
        if (parent.parentId) {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: 'دسته‌بندی فقط دو سطح می‌تواند داشته باشد.' });
        }
      }

      const [created] = await tx
        .insert(categories)
        .values({
          parentId: input.parentId ?? null,
          slug: input.slug,
          titleFa: input.titleFa,
          description: input.description ?? null,
          icon: input.icon ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        })
        .returning();

      await this.audit.record(
        { actor, action: 'category.create', entityType: 'category', entityId: created.id, after: { slug: created.slug } },
        tx,
      );
      return created;
    });
  }

  async updateCategory(id: string, input: Partial<CreateCategoryInput>, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const [before] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1);
      if (!before) throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, { status: 404 });

      const [updated] = await tx
        .update(categories)
        .set({
          ...(input.titleFa ? { titleFa: input.titleFa } : {}),
          ...(input.slug ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.icon !== undefined ? { icon: input.icon ?? null } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        })
        .where(eq(categories.id, id))
        .returning();

      await this.audit.record(
        {
          actor,
          action: 'category.update',
          entityType: 'category',
          entityId: id,
          before: { titleFa: before.titleFa, isActive: before.isActive },
          after: { titleFa: updated.titleFa, isActive: updated.isActive },
        },
        tx,
      );
      return updated;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Services                                                            */
  /* ------------------------------------------------------------------ */

  async search(query: ServiceQuery, options: { includeNonPublished?: boolean; providerId?: string; statusOverride?: string } = {}) {
    const db = this.dbService.db;
    const limit = resolveLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const conditions: Array<SQL | undefined> = [isNull(services.deletedAt)];

    if (!options.includeNonPublished) {
      conditions.push(eq(services.status, 'published'));
    } else if (options.statusOverride) {
      conditions.push(eq(services.status, options.statusOverride as never));
    }
    if (options.providerId) conditions.push(eq(services.providerId, options.providerId));
    if (query.categorySlug) {
      const category = await this.categoryBySlug(query.categorySlug);
      const ids = [category.id, ...category.children.map((child) => child.id)];
      conditions.push(inArray(services.categoryId, ids));
    }
    if (query.minPriceRial !== undefined) conditions.push(gte(services.price, query.minPriceRial));
    if (query.maxPriceRial !== undefined) conditions.push(lte(services.price, query.maxPriceRial));
    if (query.maxDeliveryDays !== undefined) conditions.push(lte(services.deliveryDays, query.maxDeliveryDays));
    if (query.minRating !== undefined) {
      conditions.push(sql`case when ${services.ratingCount} = 0 then 0 else ${services.ratingSum}::numeric / ${services.ratingCount} end >= ${query.minRating}`);
    }
    if (query.q && query.q.trim().length > 0) {
      // Weighted full text search; `simple` handles Persian without a stemmer.
      conditions.push(
        sql`to_tsvector('simple', coalesce(${services.title}, '') || ' ' || coalesce(${services.description}, '')) @@ plainto_tsquery('simple', ${query.q.trim()})`,
      );
    }
    if (query.providerUsername) {
      conditions.push(
        sql`${services.providerId} in (select user_id from profiles where username = ${query.providerUsername})`,
      );
    }
    // Keyset pagination on (created_at, id). Non-newest sorts still page by
    // creation order, which keeps cursors stable and duplicate-free.
    const cursorSql = cursorCondition(services.createdAt, services.id, cursor);
    if (cursorSql) conditions.push(cursorSql);

    const orderBy = (() => {
      switch (query.sort) {
        case 'price_asc':
          return [asc(services.price), desc(services.createdAt)];
        case 'price_desc':
          return [desc(services.price), desc(services.createdAt)];
        case 'popular':
          return [desc(services.ordersCount), desc(services.createdAt)];
        case 'rating':
          return [desc(sql`case when ${services.ratingCount} = 0 then 0 else ${services.ratingSum}::numeric / ${services.ratingCount} end`), desc(services.createdAt)];
        default:
          return [desc(services.createdAt)];
      }
    })();

    const rows = await db
      .select({
        id: services.id,
        slug: services.slug,
        title: services.title,
        price: services.price,
        deliveryDays: services.deliveryDays,
        status: services.status,
        ratingSum: services.ratingSum,
        ratingCount: services.ratingCount,
        ordersCount: services.ordersCount,
        createdAt: services.createdAt,
        categoryId: categories.id,
        categoryTitle: categories.titleFa,
        categorySlug: categories.slug,
        providerUserId: users.id,
        providerUsername: profiles.username,
        providerDisplayName: profiles.displayName,
        providerIsProvider: profiles.isProvider,
        imageFileId: sql<string | null>`(
          select file_id from service_images
          where service_id = ${services.id}
          order by sort_order asc limit 1
        )`,
      })
      .from(services)
      .leftJoin(categories, eq(categories.id, services.categoryId))
      .leftJoin(users, eq(users.id, services.providerId))
      .leftJoin(profiles, eq(profiles.userId, services.providerId))
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit + 1);

    // Paginate over the raw rows (they carry the keyset columns) and shape them
    // into cards afterwards.
    const page = buildPage(rows, limit);

    return {
      items: page.items.map((row) => this.toCard(row)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async serviceBySlug(slug: string, options: { viewerId?: string | null } = {}) {
    const db = this.dbService.db;
    const [row] = await db
      .select({
        service: services,
        category: categories,
        provider: profiles,
        providerUserId: users.id,
      })
      .from(services)
      .leftJoin(categories, eq(categories.id, services.categoryId))
      .leftJoin(users, eq(users.id, services.providerId))
      .leftJoin(profiles, eq(profiles.userId, services.providerId))
      .where(and(eq(services.slug, slug), isNull(services.deletedAt)))
      .limit(1);

    if (!row) throw new AppError(ERROR_CODES.SERVICE_NOT_FOUND, { status: 404 });

    const isOwner = options.viewerId === row.service.providerId;
    if (row.service.status !== 'published' && !isOwner) {
      throw new AppError(ERROR_CODES.SERVICE_NOT_FOUND, { status: 404 });
    }

    const [images, tags] = await Promise.all([
      db
        .select({ id: serviceImages.id, fileId: serviceImages.fileId, sortOrder: serviceImages.sortOrder, alt: serviceImages.alt })
        .from(serviceImages)
        .where(eq(serviceImages.serviceId, row.service.id))
        .orderBy(asc(serviceImages.sortOrder)),
      db.select({ tag: serviceTags.tag }).from(serviceTags).where(eq(serviceTags.serviceId, row.service.id)),
    ]);

    // Fire and forget: a view counter must never slow the page down.
    void db
      .update(services)
      .set({ viewsCount: sql`${services.viewsCount} + 1` })
      .where(eq(services.id, row.service.id))
      .catch(() => undefined);

    return {
      id: row.service.id,
      slug: row.service.slug,
      title: row.service.title,
      description: row.service.description,
      price: row.service.price.toString(),
      priceToman: (row.service.price / 10n).toString(),
      currency: row.service.currency,
      deliveryDays: row.service.deliveryDays,
      revisions: row.service.revisions,
      status: row.service.status,
      rating: row.service.ratingCount > 0 ? Number((row.service.ratingSum / row.service.ratingCount).toFixed(2)) : 0,
      ratingCount: row.service.ratingCount,
      ordersCount: row.service.ordersCount,
      viewsCount: row.service.viewsCount,
      createdAt: row.service.createdAt,
      category: row.category ? { id: row.category.id, slug: row.category.slug, titleFa: row.category.titleFa } : null,
      provider: row.provider
        ? {
            userId: row.providerUserId,
            username: row.provider.username,
            displayName: row.provider.displayName,
            bio: row.provider.bio,
            isProvider: row.provider.isProvider,
            rating: row.provider.ratingCount > 0 ? Number((row.provider.ratingSum / row.provider.ratingCount).toFixed(2)) : 0,
            ratingCount: row.provider.ratingCount,
            completedOrdersCount: row.provider.completedOrdersCount,
          }
        : null,
      images: images.map((image) => ({ id: image.id, fileId: image.fileId, alt: image.alt })),
      tags: tags.map((tag) => tag.tag),
      isOwner,
    };
  }

  async createService(providerId: string, input: CreateServiceInput, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, providerId)).limit(1);
      if (!profile) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });
      if (!profile.isProvider) {
        throw new AppError(ERROR_CODES.FORBIDDEN_RESOURCE, {
          status: 403,
          message: 'برای ثبت خدمت ابتدا باید به‌عنوان ارائه‌دهنده خدمت فعال شوید.',
        });
      }

      const [category] = await tx.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
      if (!category || !category.isActive) throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, { status: 404 });

      const [created] = await tx
        .insert(services)
        .values({
          providerId,
          categoryId: input.categoryId,
          title: input.title,
          slug: uniqueSlug(input.title),
          description: input.description,
          price: input.priceRial,
          currency: env.CURRENCY,
          deliveryDays: input.deliveryDays,
          revisions: input.revisions,
          status: 'draft',
        })
        .returning();

      if (input.tags.length > 0) {
        await tx.insert(serviceTags).values(input.tags.map((tag) => ({ serviceId: created.id, tag })));
      }

      await this.audit.record(
        { actor, action: 'service.create', entityType: 'service', entityId: created.id, after: { title: created.title } },
        tx,
      );

      return created;
    });
  }

  async updateService(providerId: string, serviceId: string, input: UpdateServiceInput, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const service = await this.requireOwnedService(tx, providerId, serviceId);

      if (service.status === 'archived') {
        throw new AppError(ERROR_CODES.SERVICE_NOT_EDITABLE, { status: 409 });
      }

      if (input.categoryId) {
        const [category] = await tx.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
        if (!category || !category.isActive) throw new AppError(ERROR_CODES.CATEGORY_NOT_FOUND, { status: 404 });
      }

      const [updated] = await tx
        .update(services)
        .set({
          ...(input.title ? { title: input.title } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.priceRial !== undefined ? { price: input.priceRial } : {}),
          ...(input.deliveryDays !== undefined ? { deliveryDays: input.deliveryDays } : {}),
          ...(input.revisions !== undefined ? { revisions: input.revisions } : {}),
          ...(input.status ? { status: input.status } : {}),
          // Editing a published service sends it back to review: buyers must be
          // able to trust what they read on the listing page.
          ...(service.status === 'published' ? { status: 'pending_review' as const } : {}),
        })
        .where(eq(services.id, serviceId))
        .returning();

      if (input.tags) {
        await tx.delete(serviceTags).where(eq(serviceTags.serviceId, serviceId));
        if (input.tags.length > 0) {
          await tx.insert(serviceTags).values(input.tags.map((tag) => ({ serviceId, tag })));
        }
      }

      await this.audit.record(
        {
          actor,
          action: 'service.update',
          entityType: 'service',
          entityId: serviceId,
          before: { status: service.status, price: service.price.toString() },
          after: { status: updated.status, price: updated.price.toString() },
        },
        tx,
      );

      return updated;
    });
  }

  async submitForReview(providerId: string, serviceId: string, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const service = await this.requireOwnedService(tx, providerId, serviceId);

      if (!['draft', 'paused', 'rejected'].includes(service.status)) {
        throw conflict(ERROR_CODES.SERVICE_INVALID_TRANSITION);
      }

      const [imageCount] = await tx
        .select({ count: sql<string>`count(*)` })
        .from(serviceImages)
        .where(eq(serviceImages.serviceId, serviceId));
      if (Number(imageCount?.count ?? 0) < 1) {
        throw new AppError(ERROR_CODES.SERVICE_NOT_PUBLISHABLE, {
          status: 409,
          message: 'برای ارسال به بازبینی حداقل یک تصویر لازم است.',
        });
      }
      if (service.description.trim().length < 40) {
        throw new AppError(ERROR_CODES.SERVICE_NOT_PUBLISHABLE, {
          status: 409,
          message: 'توضیحات خدمت باید کامل‌تر باشد.',
        });
      }

      const [updated] = await tx
        .update(services)
        .set({ status: 'pending_review' })
        .where(eq(services.id, serviceId))
        .returning();

      await this.audit.record(
        { actor, action: 'service.submit', entityType: 'service', entityId: serviceId },
        tx,
      );
      return updated;
    });
  }

  async pauseService(providerId: string, serviceId: string, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const service = await this.requireOwnedService(tx, providerId, serviceId);
      if (service.status !== 'published') throw conflict(ERROR_CODES.SERVICE_INVALID_TRANSITION);

      const [updated] = await tx
        .update(services)
        .set({ status: 'paused' })
        .where(eq(services.id, serviceId))
        .returning();

      await this.audit.record({ actor, action: 'service.pause', entityType: 'service', entityId: serviceId }, tx);
      return updated;
    });
  }

  /** Admin moderation. Approval publishes immediately; rejection needs a reason. */
  async moderate(serviceId: string, decision: 'approve' | 'reject', reason: string | undefined, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      const [service] = await tx.select().from(services).where(eq(services.id, serviceId)).limit(1);
      if (!service) throw new AppError(ERROR_CODES.SERVICE_NOT_FOUND, { status: 404 });
      if (service.status !== 'pending_review') throw conflict(ERROR_CODES.SERVICE_INVALID_TRANSITION);

      if (decision === 'reject' && !reason) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: 'برای رد خدمت ذکر دلیل الزامی است.' });
      }

      const [updated] = await tx
        .update(services)
        .set(
          decision === 'approve'
            ? { status: 'published', publishedAt: new Date(), rejectionReason: null }
            : { status: 'rejected', rejectionReason: reason ?? null },
        )
        .where(eq(services.id, serviceId))
        .returning();

      await this.outbox.publish(tx, {
        type: decision === 'approve' ? 'service.published' : 'service.rejected',
        aggregateType: 'service',
        aggregateId: serviceId,
        payload: { providerId: service.providerId, reason: reason ?? null, title: service.title },
      });

      await this.audit.record(
        {
          actor,
          action: `service.${decision}`,
          entityType: 'service',
          entityId: serviceId,
          before: { status: service.status },
          after: { status: updated.status, reason: reason ?? null },
        },
        tx,
      );

      return updated;
    });
  }

  async listProviderServices(providerId: string, query: ServiceQuery) {
    return this.search(query, { includeNonPublished: true, providerId });
  }

  async moderationQueue(limit = 50) {
    const rows = await this.dbService.db
      .select({
        id: services.id,
        slug: services.slug,
        title: services.title,
        status: services.status,
        price: services.price,
        createdAt: services.createdAt,
        providerUsername: profiles.username,
        providerDisplayName: profiles.displayName,
      })
      .from(services)
      .leftJoin(profiles, eq(profiles.userId, services.providerId))
      .where(eq(services.status, 'pending_review'))
      .orderBy(asc(services.createdAt))
      .limit(limit);
    return rows;
  }

  /* ------------------------------------------------------------------ */
  /* Images                                                              */
  /* ------------------------------------------------------------------ */

  async addServiceImage(
    providerId: string,
    serviceId: string,
    upload: { buffer: Buffer; filename: string; declaredMime: string },
    actor: ActorContext,
  ) {
    const detected = detectImageMime(upload.buffer);
    if (!detected || !ALLOWED_IMAGE_MIMES.includes(detected as never)) {
      throw new AppError(ERROR_CODES.UPLOAD_INVALID_TYPE, { status: 415 });
    }
    if (upload.buffer.byteLength > this.storage.maxBytes) {
      throw new AppError(ERROR_CODES.UPLOAD_TOO_LARGE, { status: 413 });
    }

    return this.dbService.transaction(async (tx) => {
      await this.requireOwnedService(tx, providerId, serviceId);

      const [countRow] = await tx
        .select({ count: sql<string>`count(*)` })
        .from(serviceImages)
        .where(eq(serviceImages.serviceId, serviceId));
      const existing = Number(countRow?.count ?? 0);
      if (existing >= env.UPLOAD_MAX_PER_SERVICE) {
        throw conflict(ERROR_CODES.UPLOAD_LIMIT_REACHED);
      }

      const key = this.storage.buildKey(`services/${serviceId}`, detected.split('/')[1] ?? 'img');
      await this.storage.put(key, upload.buffer, detected);

      const [file] = await tx
        .insert(files)
        .values({
          ownerUserId: providerId,
          storageProvider: env.STORAGE_DRIVER,
          storageKey: key,
          originalName: upload.filename.slice(0, 255),
          mime: detected,
          sizeBytes: upload.buffer.byteLength,
          checksum: sha256(upload.buffer.toString('base64')).slice(0, 64),
          status: 'ready',
        })
        .returning();

      const [image] = await tx
        .insert(serviceImages)
        .values({ serviceId, fileId: file.id, sortOrder: existing })
        .returning();

      await this.audit.record(
        { actor, action: 'service.image_added', entityType: 'service', entityId: serviceId, after: { fileId: file.id } },
        tx,
      );

      return { imageId: image.id, fileId: file.id, sortOrder: image.sortOrder };
    });
  }

  async removeServiceImage(providerId: string, serviceId: string, imageId: string, actor: ActorContext) {
    return this.dbService.transaction(async (tx) => {
      await this.requireOwnedService(tx, providerId, serviceId);
      const [image] = await tx
        .select()
        .from(serviceImages)
        .where(and(eq(serviceImages.id, imageId), eq(serviceImages.serviceId, serviceId)))
        .limit(1);
      if (!image) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });

      await tx.delete(serviceImages).where(eq(serviceImages.id, imageId));
      await tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, image.fileId));

      await this.audit.record(
        { actor, action: 'service.image_removed', entityType: 'service', entityId: serviceId, before: { fileId: image.fileId } },
        tx,
      );
      return { ok: true };
    });
  }

  /** Public provider profile with their published services. */
  async publicProfile(username: string) {
    const db = this.dbService.db;
    const [profile] = await db.select().from(profiles).where(eq(profiles.username, username)).limit(1);
    if (!profile) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });

    const publishedServices = await db
      .select({
        id: services.id,
        slug: services.slug,
        title: services.title,
        price: services.price,
        deliveryDays: services.deliveryDays,
        ratingSum: services.ratingSum,
        ratingCount: services.ratingCount,
        ordersCount: services.ordersCount,
        createdAt: services.createdAt,
        imageFileId: sql<string | null>`(select file_id from service_images where service_id = ${services.id} order by sort_order asc limit 1)`,
      })
      .from(services)
      .where(and(eq(services.providerId, profile.userId), eq(services.status, 'published'), isNull(services.deletedAt)))
      .orderBy(desc(services.createdAt))
      .limit(24);

    return {
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      city: profile.city,
      province: profile.province,
      skills: profile.skills,
      isProvider: profile.isProvider,
      rating: profile.ratingCount > 0 ? Number((profile.ratingSum / profile.ratingCount).toFixed(2)) : 0,
      ratingCount: profile.ratingCount,
      completedOrdersCount: profile.completedOrdersCount,
      memberSince: profile.createdAt,
      services: publishedServices.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        price: row.price.toString(),
        priceToman: (row.price / 10n).toString(),
        deliveryDays: row.deliveryDays,
        rating: row.ratingCount > 0 ? Number((row.ratingSum / row.ratingCount).toFixed(2)) : 0,
        ratingCount: row.ratingCount,
        ordersCount: row.ordersCount,
        imageFileId: row.imageFileId,
      })),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  private toCard(row: {
    id: string;
    slug: string;
    title: string;
    price: bigint;
    deliveryDays: number;
    status: string;
    ratingSum: number;
    ratingCount: number;
    ordersCount: number;
    createdAt: Date;
    categoryId: string | null;
    categoryTitle: string | null;
    categorySlug: string | null;
    providerUserId: string | null;
    providerUsername: string | null;
    providerDisplayName: string | null;
    providerIsProvider: boolean | null;
    imageFileId: string | null;
  }): ServiceCard {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      price: row.price.toString(),
      priceToman: (row.price / 10n).toString(),
      deliveryDays: row.deliveryDays,
      rating: row.ratingCount > 0 ? Number((row.ratingSum / row.ratingCount).toFixed(2)) : 0,
      ratingCount: row.ratingCount,
      ordersCount: row.ordersCount,
      status: row.status,
      category:
        row.categoryId && row.categoryTitle && row.categorySlug
          ? { id: row.categoryId, titleFa: row.categoryTitle, slug: row.categorySlug }
          : null,
      provider:
        row.providerUserId && row.providerUsername
          ? {
              userId: row.providerUserId,
              username: row.providerUsername,
              displayName: row.providerDisplayName ?? '',
              isProvider: Boolean(row.providerIsProvider),
            }
          : null,
      imageFileId: row.imageFileId,
      createdAt: row.createdAt,
    };
  }

  private async requireOwnedService(tx: Database, providerId: string, serviceId: string) {
    const [service] = await tx.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (!service) throw new AppError(ERROR_CODES.SERVICE_NOT_FOUND, { status: 404 });
    if (service.providerId !== providerId) throw new AppError(ERROR_CODES.FORBIDDEN_RESOURCE, { status: 403 });
    return service;
  }

  /** Recommends a verified file row for the public image route. */
  async fileIsPubliclyVisible(fileId: string): Promise<boolean> {
    const [row] = await this.dbService.db
      .select({ id: serviceImages.id })
      .from(serviceImages)
      .where(eq(serviceImages.fileId, fileId))
      .limit(1);
    return Boolean(row);
  }

  async findFile(fileId: string) {
    const [file] = await this.dbService.db.select().from(files).where(eq(files.id, fileId)).limit(1);
    return file ?? null;
  }

  /** Used by the order flows to validate a service is currently purchasable. */
  async loadPurchasableService(serviceId: string) {
    const [service] = await this.dbService.db
      .select()
      .from(services)
      .where(and(eq(services.id, serviceId), isNull(services.deletedAt)))
      .limit(1);
    if (!service) throw new AppError(ERROR_CODES.SERVICE_NOT_FOUND, { status: 404 });
    if (service.status !== 'published') throw conflict(ERROR_CODES.SERVICE_NOT_PURCHASABLE);
    return service;
  }

  async categoryIdOf(serviceId: string): Promise<string | null> {
    const [service] = await this.dbService.db
      .select({ categoryId: services.categoryId })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    return service?.categoryId ?? null;
  }

  async incrementOrdersCount(tx: Database, serviceId: string): Promise<void> {
    await tx
      .update(services)
      .set({ ordersCount: sql`${services.ordersCount} + 1` })
      .where(eq(services.id, serviceId));
  }

  /**
   * Recomputes rating aggregates from visible reviews.
   *
   * Kept as a cached projection instead of an aggregate query on every listing:
   * reading a service page must not scan the reviews table.
   */
  async refreshRating(tx: Database, serviceId: string | null, providerId: string): Promise<void> {
    if (serviceId) {
      const [row] = await tx
        .select({
          sum: sql<string>`coalesce(sum(${reviews.rating}), 0)`,
          count: sql<string>`count(*)`,
        })
        .from(reviews)
        .where(and(eq(reviews.serviceId, serviceId), eq(reviews.isVisible, true)));
      await tx
        .update(services)
        .set({ ratingSum: Number(row?.sum ?? 0), ratingCount: Number(row?.count ?? 0) })
        .where(eq(services.id, serviceId));
    }

    const [providerRow] = await tx
      .select({
        sum: sql<string>`coalesce(sum(${reviews.rating}), 0)`,
        count: sql<string>`count(*)`,
      })
      .from(reviews)
      .where(and(eq(reviews.targetUserId, providerId), eq(reviews.isVisible, true)));
    await tx
      .update(profiles)
      .set({ ratingSum: Number(providerRow?.sum ?? 0), ratingCount: Number(providerRow?.count ?? 0) })
      .where(eq(profiles.userId, providerId));
  }
}
