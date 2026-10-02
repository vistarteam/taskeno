import { Injectable } from '@nestjs/common';
import type { Database } from '../db/client';
import { auditLogs } from '../db/schema';
import { DbService } from '../db/db.service';
import { logger } from './logger';
import type { ActorContext } from './types';

export type AuditInput = {
  actor: ActorContext;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/**
 * Records privileged and financial actions.
 *
 * Pass the surrounding transaction whenever the action changes data: an audit
 * row that survives a rollback would be a lie, and one that is missing after a
 * commit would be a compliance hole.
 */
@Injectable()
export class AuditService {
  constructor(private readonly dbService: DbService) {}

  async record(input: AuditInput, tx?: Database): Promise<void> {
    const db = tx ?? this.dbService.db;
    try {
      await db.insert(auditLogs).values({
        actorUserId: input.actor.userId,
        actorRole: input.actor.roles[0] ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before ?? null,
        after: input.after ?? null,
        ip: input.actor.ip ?? null,
        requestId: input.actor.requestId,
      });
    } catch (error) {
      // Auditing must never break the business operation, but a failure here is
      // always investigated.
      logger.error({ err: error, action: input.action }, 'failed to write audit log');
    }
  }
}
