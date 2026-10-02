import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { logger } from './common/logger';

/**
 * Worker entrypoint: `pnpm dev:worker` (development) / `pnpm start:worker`
 * (production). It shares the codebase with the API but runs as its own process
 * so background work can never slow down (or crash) request handling.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  app.enableShutdownHooks();
  logger.info('Taskeno worker ready');
  // eslint-disable-next-line no-console
  console.log('Taskeno worker running');
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'failed to start worker');
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
