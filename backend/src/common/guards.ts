import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleKey } from '@taskeno/contracts';
import { AppError, ERROR_CODES, forbidden } from './errors';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import type { AuthenticatedUser } from './types';
import { SessionService } from '../modules/auth/session.service';

type RequestLike = {
  user?: AuthenticatedUser;
  cookies?: Record<string, string>;
  ip?: string;
  headers?: Record<string, unknown>;
};

/**
 * Resolves the session cookie (if any) into a user and enforces authentication
 * unless the route is decorated with `@Public()`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<RequestLike>();

    const rawToken = request.cookies?.[this.sessions.cookieName];
    if (rawToken) {
      const userAgent = typeof request.headers?.['user-agent'] === 'string' ? (request.headers['user-agent'] as string) : undefined;
      const user = await this.sessions.resolve(rawToken, { ip: request.ip, userAgent });
      if (user) request.user = user;
    }

    if (isPublic) return true;

    if (!request.user) {
      throw new AppError(ERROR_CODES.AUTH_UNAUTHENTICATED, { status: 401 });
    }
    return true;
  }
}

/**
 * Role check that runs after `SessionAuthGuard`. Resource-level ownership
 * checks stay in the services, where the actual row is loaded.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleKey[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestLike>();
    const user = request.user;
    if (!user) throw new AppError(ERROR_CODES.AUTH_UNAUTHENTICATED, { status: 401 });

    const allowed = required.some((role) => user.roles.includes(role));
    if (!allowed) throw forbidden();
    return true;
  }
}

export const isAdmin = (user?: AuthenticatedUser | null): boolean => Boolean(user?.roles.includes('admin'));
