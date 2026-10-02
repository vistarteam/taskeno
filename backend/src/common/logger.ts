import pino, { type Logger } from 'pino';
import { env, isProduction } from '../config/env';

/**
 * Structured logging with aggressive redaction.
 *
 * Nothing sensitive may ever reach the logs: no passwords, tokens, session
 * cookies, gateway authorities or national identifiers. The redaction list is
 * deliberately broad because a leaked log file is a data breach.
 */
export const REDACT_PATHS = [
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'token',
  'tokens',
  'tokenHash',
  'cookie',
  'cookies',
  'authorization',
  'req.headers.cookie',
  'req.headers.authorization',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'providerAuthority',
  'provider_authority',
  'nationalId',
  'cardNumber',
  'iban',
];

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  base: { service: 'taskeno-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction ? {} : { transport: undefined }),
});

export const createChildLogger = (context: Record<string, unknown>): Logger => logger.child(context);
