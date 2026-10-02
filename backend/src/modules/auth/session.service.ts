import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { RoleKey } from '@taskeno/contracts';
import { env, isProduction } from '../../config/env';
import { generateToken, sha256 } from '../../common/crypto';
import type { AuthenticatedUser } from '../../common/types';
import type { Database } from '../../db/client';
import { profiles, sessions, users } from '../../db/schema';
import { DbService } from '../../db/db.service';
import { RolesService } from './roles.service';

export type SessionRequestMeta = { ip?: string; userAgent?: string };

/** Only touch `last_used_at` every few minutes: one write per request is waste. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sessions are opaque random tokens stored hashed in the database.
 *
 * Compared with stateless JWTs this gives instant revocation, no token leakage
 * through `localStorage`, and an auditable list of devices. The cookie is set
 * by the controller; only the token digest ever touches the database.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly dbService: DbService,
    private readonly roles: RolesService,
  ) {}

  get cookieName(): string {
    return env.SESSION_COOKIE_NAME;
  }

  cookieOptions(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: env.COOKIE_SECURE || isProduction,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: Math.floor(maxAgeMs / 1000),
    };
  }

  private get maxAgeMs(): number {
    return env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  async create(
    userId: string,
    meta: SessionRequestMeta,
    tx?: Database,
  ): Promise<{ token: string; sessionId: string; expiresAt: Date; maxAgeMs: number }> {
    const db = tx ?? this.dbService.db;
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.maxAgeMs);

    const [row] = await db
      .insert(sessions)
      .values({
        userId,
        tokenHash: sha256(token),
        userAgent: meta.userAgent?.slice(0, 400) ?? null,
        ip: meta.ip?.slice(0, 64) ?? null,
        expiresAt,
      })
      .returning({ id: sessions.id });

    return { token, sessionId: row.id, expiresAt, maxAgeMs: this.maxAgeMs };
  }

  /** Resolves a raw cookie value into the authenticated user, or null. */
  async resolve(rawToken: string, meta: SessionRequestMeta): Promise<AuthenticatedUser | null> {
    if (!rawToken || rawToken.length < 20) return null;

    const db = this.dbService.db;
    const tokenHash = sha256(rawToken);

    const [row] = await db
      .select({
        sessionId: sessions.id,
        revokedAt: sessions.revokedAt,
        expiresAt: sessions.expiresAt,
        lastUsedAt: sessions.lastUsedAt,
        userId: users.id,
        email: users.email,
        phone: users.phone,
        status: users.status,
        username: profiles.username,
        displayName: profiles.displayName,
        isProvider: profiles.isProvider,
        avatarFileId: profiles.avatarFileId,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    if (!row) return null;

    const now = Date.now();
    const expired = row.expiresAt.getTime() <= now;
    const idleTooLong = now - row.lastUsedAt.getTime() > env.SESSION_IDLE_TTL_HOURS * 60 * 60 * 1000;

    if (row.revokedAt || expired || idleTooLong || row.status !== 'active') {
      if (!row.revokedAt && (expired || idleTooLong)) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date(), revokedReason: expired ? 'expired' : 'idle_timeout' })
          .where(eq(sessions.id, row.sessionId));
      }
      return null;
    }

    if (now - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await db
        .update(sessions)
        .set({ lastUsedAt: new Date(), ip: meta.ip?.slice(0, 64) ?? null })
        .where(eq(sessions.id, row.sessionId));
    }

    const roleKeys = await this.roles.keysFor(row.userId);

    return {
      id: row.userId,
      email: row.email,
      phone: row.phone,
      status: row.status,
      roles: roleKeys as RoleKey[],
      sessionId: row.sessionId,
      profile: {
        username: row.username ?? '',
        displayName: row.displayName ?? '',
        isProvider: row.isProvider ?? false,
        avatarFileId: row.avatarFileId ?? null,
      },
    };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.dbService.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.id, sessionId)));
  }

  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    const rows = await this.dbService.db
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(sessions.userId, userId)))
      .returning({ id: sessions.id });
    return rows.filter((row) => row.id !== exceptSessionId).length;
  }

  async listForUser(userId: string) {
    return this.dbService.db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ip: sessions.ip,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.lastUsedAt))
      .limit(20);
  }

  /** Housekeeping job: drop sessions that expired (or were revoked) long ago. */
  async purgeExpired(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const rows = await this.dbService.db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, cutoff), lt(sessions.revokedAt, cutoff)))
      .returning({ id: sessions.id });
    return rows.length;
  }
}
