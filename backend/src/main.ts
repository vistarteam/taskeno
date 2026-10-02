import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { env, isProduction } from './config/env';
import { logger } from './common/logger';

/**
 * Money values are `bigint` in application code. JSON has no bigint, and
 * `JSON.stringify` throws on one, so the API serializes them as decimal strings
 * (exact, no precision loss) and the website parses them back to bigint.
 */
const bigintSafeReplacer = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? value.toString() : value;

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    genReqId: () => randomUUID(),
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: false,
    // Without this Nest calls `process.exit(1)` on initialization failure.
    // Combined with `logger: false` that produces a silent death with no clue.
    abortOnError: false,
  });

  const fastify = app.getHttpAdapter().getInstance();

  await app.register(cookie, {
    // The cookie is signed by the session token itself; no extra secret needed.
    parseOptions: {},
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // the API serves no HTML; the website owns CSP
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  // Service images arrive as multipart/form-data. Without this the content type
  // has no parser and every upload fails with 415 before it reaches the handler.
  await app.register(multipart, {
    limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 5 },
  });

  fastify.setReplySerializer((payload: unknown): string => {
    if (typeof payload === 'string') return payload;
    return JSON.stringify(payload, bigintSafeReplacer);
  });

  // Correlation id is echoed back so a user can quote it in support requests.
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', String(request.id));
  });

  app.enableCors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  app.enableShutdownHooks();

  const host = isProduction ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ port: env.PORT, host });

  logger.info({ port: env.PORT, host, env: env.NODE_ENV }, 'Taskeno API listening');
  // eslint-disable-next-line no-console
  console.log(`Taskeno API → http://${host === '0.0.0.0' ? 'localhost' : host}:${env.PORT}`);
}

/**
 * Fatal startup failure.
 *
 * `process.exit` truncates buffered stdout/stderr, so the reason is written
 * synchronously before the process is allowed to die (otherwise a boot failure
 * looks like a silent exit with no output at all).
 */
const fatalStartup = (error: unknown): void => {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  logger.fatal({ err: error }, 'failed to start API');
  logger.flush();
  process.stderr.write(`[taskeno] API failed to start:\n${detail}\n`);
  setTimeout(() => process.exit(1), 50);
};

bootstrap().catch(fatalStartup);
