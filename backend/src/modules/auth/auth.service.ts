import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  type LoginInput,
  type RegisterInput,
  type UpdateProfileInput,
  USER_STATUSES,
} from '@taskeno/contracts';
import { AppError, ERROR_CODES, conflict, isUniqueViolation } from '../../common/errors';
import { generateNumericCode, generateToken, sha256, uniqueSlug } from '../../common/crypto';
import { PasswordService } from '../../common/password';
import { RateLimiter } from '../../common/rate-limit';
import { AuditService } from '../../common/audit.service';
import type { ActorContext } from '../../common/types';
import { env, isProduction } from '../../config/env';
import { DbService } from '../../db/db.service';
import { passwordResetTokens, profiles, sessions, users, verificationTokens, wallets } from '../../db/schema';
import { OutboxService } from '../../common/outbox.service';
import { RolesService } from './roles.service';
import { SessionService, type SessionRequestMeta } from './session.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_TTL_MS = 30 * 60 * 1000;

export type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  roles: string[];
  profile: {
    username: string;
    displayName: string;
    bio: string | null;
    avatarFileId: string | null;
    isProvider: boolean;
    ratingAverage: number;
    ratingCount: number;
    completedOrdersCount: number;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly dbService: DbService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly roles: RolesService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Registration / login                                                */
  /* ------------------------------------------------------------------ */

  async register(input: RegisterInput, meta: SessionRequestMeta & { actor: ActorContext }) {
    const passwordHash = await this.passwords.hash(input.password);

    const result = await this.dbService.transaction(async (tx) => {
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (existing.length > 0) throw conflict(ERROR_CODES.AUTH_EMAIL_TAKEN);

      if (input.phone) {
        const phoneTaken = await tx.select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1);
        if (phoneTaken.length > 0) throw conflict(ERROR_CODES.AUTH_PHONE_TAKEN);
      }

      const username = await this.reserveUsername(tx, input.username ?? input.email.split('@')[0]);

      const [user] = await tx
        .insert(users)
        .values({ email: input.email, phone: input.phone ?? null, passwordHash })
        .returning();

      const [profile] = await tx
        .insert(profiles)
        .values({ userId: user.id, username, displayName: input.displayName })
        .returning();

      await this.roles.assign(user.id, 'user', null, tx);

      // Every account starts with a wallet so payments never hit a missing row.
      await tx
        .insert(wallets)
        .values({ ownerType: 'user', ownerId: user.id, currency: env.CURRENCY, balance: 0n })
        .onConflictDoNothing();

      await this.outbox.publish(tx, {
        type: 'user.registered',
        aggregateType: 'user',
        aggregateId: user.id,
        payload: { email: user.email },
      });

      await this.audit.record(
        { actor: meta.actor, action: 'auth.register', entityType: 'user', entityId: user.id },
        tx,
      );

      return { user, profile };
    });

    const session = await this.sessions.create(result.user.id, meta);

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      maxAgeMs: session.maxAgeMs,
      user: await this.buildPublicUser(result.user.id),
    };
  }

  async login(input: LoginInput, meta: SessionRequestMeta & { actor: ActorContext }) {
    // Throttle by both ip and identifier to slow credential stuffing down.
    this.limiter.consume(`login:ip:${meta.ip ?? 'unknown'}`, 20, 15 * 60 * 1000);
    this.limiter.consume(`login:email:${input.email}`, 10, 15 * 60 * 1000);

    const db = this.dbService.db;
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1);

    // Uniform failure: never reveal whether the address exists.
    if (!user) {
      await this.audit.record({
        actor: meta.actor,
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: null,
        after: { reason: 'unknown_email' },
      });
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, { status: 401 });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError(ERROR_CODES.AUTH_ACCOUNT_LOCKED, { status: 423 });
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, input.password);

    if (!passwordOk) {
      const failed = user.failedLoginCount + 1;
      await db
        .update(users)
        .set({
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_DURATION_MS) : null,
        })
        .where(eq(users.id, user.id));

      await this.audit.record({
        actor: { ...meta.actor, userId: user.id },
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        after: { attempts: failed },
      });

      if (failed >= MAX_FAILED_LOGINS) {
        throw new AppError(ERROR_CODES.AUTH_ACCOUNT_LOCKED, { status: 423 });
      }
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, { status: 401 });
    }

    if (user.status === 'suspended') {
      throw new AppError(ERROR_CODES.AUTH_ACCOUNT_SUSPENDED, { status: 403 });
    }
    if (user.status === 'deleted') {
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, { status: 401 });
    }

    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    this.limiter.reset(`login:email:${input.email}`);

    const session = await this.sessions.create(user.id, meta);

    await this.dbService.transaction(async (tx) => {
      await this.outbox.publish(tx, {
        type: 'auth.login_succeeded',
        aggregateType: 'user',
        aggregateId: user.id,
        payload: { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null },
      });
      await this.audit.record(
        { actor: { ...meta.actor, userId: user.id }, action: 'auth.login', entityType: 'user', entityId: user.id },
        tx,
      );
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      maxAgeMs: session.maxAgeMs,
      user: await this.buildPublicUser(user.id),
    };
  }

  async logout(rawToken: string | undefined, actor: ActorContext): Promise<void> {
    if (!rawToken) return;
    const db = this.dbService.db;

    // The session is looked up by token hash so a cookie can only ever revoke
    // the session that owns it.
    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.tokenHash, sha256(rawToken)))
      .limit(1);

    if (session) {
      await this.sessions.revoke(session.id, 'logout');
    }
    await this.audit.record({ actor, action: 'auth.logout', entityType: 'user', entityId: actor.userId });
  }

  /* ------------------------------------------------------------------ */
  /* Account recovery                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Always reports success, whether or not the address exists, to avoid
   * account enumeration. In development the link is returned so the flow is
   * testable without an email provider.
   */
  async requestPasswordReset(email: string, actor: ActorContext): Promise<{ devLink?: string }> {
    this.limiter.consume(`reset:${email}`, 5, 60 * 60 * 1000);

    const db = this.dbService.db;
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!user) return {};

    const token = generateToken();
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      requestedIp: actor.ip ?? null,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    await this.dbService.transaction(async (tx) => {
      await this.outbox.publish(tx, {
        type: 'auth.password_reset_requested',
        aggregateType: 'user',
        aggregateId: user.id,
        payload: { email },
      });
      await this.audit.record(
        { actor, action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id },
        tx,
      );
    });

    if (isProduction) return {};
    return { devLink: `${env.APP_URL}/reset-password?token=${token}` };
  }

  async resetPassword(token: string, newPassword: string, actor: ActorContext): Promise<void> {
    const db = this.dbService.db;
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt)))
      .limit(1);

    if (!row) throw new AppError(ERROR_CODES.AUTH_INVALID_TOKEN, { status: 400 });
    if (row.expiresAt.getTime() < Date.now()) throw new AppError(ERROR_CODES.AUTH_TOKEN_EXPIRED, { status: 400 });

    const passwordHash = await this.passwords.hash(newPassword);

    await this.dbService.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, row.userId));
      await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
      await this.audit.record(
        { actor, action: 'auth.password_reset', entityType: 'user', entityId: row.userId },
        tx,
      );
    });

    // A password change invalidates every existing session.
    await this.sessions.revokeAllForUser(row.userId, 'password_reset');
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    actor: ActorContext,
  ): Promise<void> {
    const db = this.dbService.db;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new AppError(ERROR_CODES.AUTH_UNAUTHENTICATED, { status: 401 });

    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, { status: 400 });

    const passwordHash = await this.passwords.hash(newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await this.sessions.revokeAllForUser(userId, 'password_changed');
    await this.audit.record({ actor, action: 'auth.password_changed', entityType: 'user', entityId: userId });
  }

  /* ------------------------------------------------------------------ */
  /* Email / phone verification                                          */
  /* ------------------------------------------------------------------ */

  async requestEmailVerification(userId: string): Promise<{ devCode?: string }> {
    const code = generateNumericCode();
    await this.dbService.db.insert(verificationTokens).values({
      userId,
      channel: 'email',
      purpose: 'verify_email',
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });
    return isProduction ? {} : { devCode: code };
  }

  async confirmEmailVerification(userId: string, code: string): Promise<void> {
    const db = this.dbService.db;
    const [row] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.userId, userId),
          eq(verificationTokens.purpose, 'verify_email'),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) throw new AppError(ERROR_CODES.AUTH_INVALID_TOKEN, { status: 400 });

    if (row.codeHash !== sha256(code)) {
      await db
        .update(verificationTokens)
        .set({ attempts: row.attempts + 1 })
        .where(eq(verificationTokens.id, row.id));
      throw new AppError(ERROR_CODES.AUTH_INVALID_TOKEN, { status: 400 });
    }

    await this.dbService.transaction(async (tx) => {
      await tx.update(verificationTokens).set({ consumedAt: new Date() }).where(eq(verificationTokens.id, row.id));
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Profile                                                             */
  /* ------------------------------------------------------------------ */

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const db = this.dbService.db;

    if (input.username) {
      const taken = await db
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(eq(profiles.username, input.username))
        .limit(1);
      if (taken.length > 0 && taken[0].userId !== userId) throw conflict(ERROR_CODES.AUTH_USERNAME_TAKEN);
    }

    await db
      .update(profiles)
      .set({
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.username ? { username: input.username } : {}),
        ...(input.bio !== undefined ? { bio: input.bio ?? null } : {}),
        ...(input.province !== undefined ? { province: input.province ?? null } : {}),
        ...(input.city !== undefined ? { city: input.city ?? null } : {}),
        ...(input.skills ? { skills: input.skills } : {}),
        ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
      })
      .where(eq(profiles.userId, userId));

    return this.buildPublicUser(userId);
  }

  /** Upgrades a regular account to a provider so it can publish services. */
  async becomeProvider(userId: string, actor: ActorContext, bio?: string): Promise<void> {
    await this.dbService.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({ isProvider: true, providerVerifiedAt: new Date(), ...(bio ? { bio } : {}) })
        .where(eq(profiles.userId, userId));
      await this.roles.assign(userId, 'provider', userId, tx);
      await this.outbox.publish(tx, {
        type: 'user.became_provider',
        aggregateType: 'user',
        aggregateId: userId,
      });
      await this.audit.record({ actor, action: 'user.become_provider', entityType: 'user', entityId: userId }, tx);
    });
  }

  async buildPublicUser(userId: string): Promise<PublicUser> {
    const db = this.dbService.db;
    const [row] = await db
      .select({ user: users, profile: profiles })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });

    const roleKeys = await this.roles.keysFor(userId);
    const ratingCount = row.profile?.ratingCount ?? 0;
    const ratingSum = row.profile?.ratingSum ?? 0;

    return {
      id: row.user.id,
      email: row.user.email,
      phone: row.user.phone,
      status: row.user.status,
      emailVerified: Boolean(row.user.emailVerifiedAt),
      roles: roleKeys,
      profile: {
        username: row.profile?.username ?? '',
        displayName: row.profile?.displayName ?? '',
        bio: row.profile?.bio ?? null,
        avatarFileId: row.profile?.avatarFileId ?? null,
        isProvider: row.profile?.isProvider ?? false,
        ratingAverage: ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : 0,
        ratingCount,
        completedOrdersCount: row.profile?.completedOrdersCount ?? 0,
      },
    };
  }

  /** Picks a free username, falling back to a random suffix. */
  private async reserveUsername(tx: Parameters<Parameters<DbService['transaction']>[0]>[0], preferred: string): Promise<string> {
    const candidate = uniqueSlug(preferred).replace(/[^a-z0-9_]/g, '').slice(0, 26) || `user${Date.now().toString(36)}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const username = attempt === 0 ? candidate : `${candidate.slice(0, 20)}${Math.floor(Math.random() * 10_000)}`;
      const taken = await tx.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.username, username)).limit(1);
      if (taken.length === 0) return username;
    }
    return `user${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  }
}

export const isKnownUserStatus = (value: string): value is (typeof USER_STATUSES)[number] =>
  (USER_STATUSES as readonly string[]).includes(value);

/** Exposed for tests: duplicate email detection relies on this helper. */
export const isDuplicateEmailError = isUniqueViolation;
