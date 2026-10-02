import { Injectable } from '@nestjs/common';
import { and, eq, isNull, or, gt } from 'drizzle-orm';
import type { RoleKey } from '@taskeno/contracts';
import type { Database } from '../../db/client';
import { roles, userRoles } from '../../db/schema';
import { DbService } from '../../db/db.service';

/**
 * Role storage is a table (not an enum on the user) so new roles and
 * time-boxed grants can be added without a migration.
 */
@Injectable()
export class RolesService {
  private readonly cache = new Map<RoleKey, string>();

  constructor(private readonly dbService: DbService) {}

  async idFor(key: RoleKey, tx?: Database): Promise<string> {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const db = tx ?? this.dbService.db;
    const [row] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key)).limit(1);
    if (!row) {
      throw new Error(`Role "${key}" is missing. Run the seed script (pnpm db:seed).`);
    }
    this.cache.set(key, row.id);
    return row.id;
  }

  async assign(userId: string, key: RoleKey, grantedBy?: string | null, tx?: Database): Promise<void> {
    const db = tx ?? this.dbService.db;
    const roleId = await this.idFor(key, tx);
    await db
      .insert(userRoles)
      .values({ userId, roleId, grantedBy: grantedBy ?? null })
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
  }

  async keysFor(userId: string, tx?: Database): Promise<RoleKey[]> {
    const db = tx ?? this.dbService.db;
    const rows = await db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(userRoles.userId, userId),
          or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date())),
        ),
      );
    return rows.map((row) => row.key as RoleKey);
  }

  async hasRole(userId: string, key: RoleKey): Promise<boolean> {
    return (await this.keysFor(userId)).includes(key);
  }
}
