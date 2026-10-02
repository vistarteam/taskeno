import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/decorators';
import { DbService } from '../../db/db.service';
import { env } from '../../config/env';

@Controller('health')
export class HealthController {
  constructor(private readonly dbService: DbService) {}

  /** Process is up. Deliberately does not touch dependencies. */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Process can serve traffic: database reachable and migrations applied. */
  @Public()
  @Get('ready')
  async ready() {
    await this.dbService.db.execute(sql`select 1`);
    return {
      status: 'ok',
      driver: this.dbService.driver,
      environment: env.NODE_ENV,
      time: new Date().toISOString(),
    };
  }
}
