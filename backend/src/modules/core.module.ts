import { Global, Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { JobsService, OutboxService } from '../common/outbox.service';
import { PasswordService } from '../common/password';
import { RateLimiter } from '../common/rate-limit';
import { DbService } from '../db/db.service';

/**
 * Cross-cutting infrastructure. Global so feature modules do not have to
 * re-import plumbing they all need.
 */
@Global()
@Module({
  providers: [DbService, AuditService, OutboxService, JobsService, RateLimiter, PasswordService],
  exports: [DbService, AuditService, OutboxService, JobsService, RateLimiter, PasswordService],
})
export class CoreModule {}
