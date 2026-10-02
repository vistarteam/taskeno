import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { RoleKey } from '@taskeno/contracts';
import { AppError, ERROR_CODES } from './errors';
import type { AuthenticatedUser, ActorContext } from './types';

export const IS_PUBLIC_KEY = 'taskeno:isPublic';
/** Marks a route as reachable without a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'taskeno:roles';
/** Restricts a route to the given roles (any of them). */
export const Roles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);

type RequestLike = {
  user?: AuthenticatedUser;
  id?: string;
  ip?: string;
  headers?: Record<string, unknown>;
};

const readRequest = (ctx: ExecutionContext): RequestLike => ctx.switchToHttp().getRequest<RequestLike>();

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = readRequest(ctx);
  if (!request.user) {
    throw new Error('CurrentUser used on a non authenticated route');
  }
  return request.user;
});

/** Full actor context (user, roles, request id, ip) for auditing. */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): ActorContext => {
  const request = readRequest(ctx);
  return {
    userId: request.user?.id ?? null,
    roles: request.user?.roles ?? [],
    requestId: String(request.id ?? 'unknown'),
    ip: request.ip,
    userAgent: typeof request.headers?.['user-agent'] === 'string' ? (request.headers['user-agent'] as string) : undefined,
  };
});

/**
 * Required on every endpoint that moves money or creates an order.
 *
 * A retry (double click, flaky network, mobile reconnect) must never result in
 * a second transfer, so the client generates one key per logical action and the
 * server rejects the call when it is missing.
 */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = readRequest(ctx) as RequestLike & { headers?: Record<string, unknown> };
  const raw = request.headers?.['idempotency-key'];
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (key.length < 8 || key.length > 160) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
      message: 'شناسه یکتای درخواست (Idempotency-Key) الزامی است.',
    });
  }
  return key;
});

/** Raw client ip, needed for login throttling before a user exists. */
export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return readRequest(ctx).ip ?? 'unknown';
});
