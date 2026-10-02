import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_CODES, ERROR_MESSAGES_FA, type ErrorCode } from '@taskeno/contracts';
import { AppError } from './errors';
import { logger } from './logger';

/**
 * Converts every failure into one envelope:
 * `{ error: { code, message, details?, requestId } }`.
 *
 * Known failures surface their code and Persian message. Anything unexpected is
 * logged with full detail and reported as a generic 500, so stack traces and
 * database messages never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = String((request as { id?: string })?.id ?? 'unknown');
    const path = (request as { url?: string })?.url ?? '';

    if (exception instanceof AppError) {
      // Expected, already-curated failure.
      logger.info({ code: exception.code, requestId, path }, 'request failed');
      void reply.status(exception.status).send({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details ?? undefined,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 404
          ? ERROR_CODES.NOT_FOUND
          : status === 403
            ? ERROR_CODES.FORBIDDEN_RESOURCE
            : status === 413
              ? ERROR_CODES.UPLOAD_TOO_LARGE
              : status === 415
                ? ERROR_CODES.UPLOAD_INVALID_TYPE
                : ERROR_CODES.VALIDATION_FAILED;
      void reply.status(status).send({
        error: { code, message: ERROR_MESSAGES_FA[code], requestId },
      });
      return;
    }

    logger.error({ err: exception, requestId, path }, 'unhandled error');
    void reply.status(500).send({
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: ERROR_MESSAGES_FA.INTERNAL_ERROR, requestId },
    });
  }
}
