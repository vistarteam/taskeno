import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyCodeSchema,
  type RegisterInput,
} from '@taskeno/contracts';
import { Actor, ClientIp, CurrentUser, Public } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { RateLimiter } from '../../common/rate-limit';
import { AppError, ERROR_CODES } from '../../common/errors';
import type { ActorContext, AuthenticatedUser } from '../../common/types';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

type RequestWithCookies = FastifyRequest & { cookies?: Record<string, string> };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly limiter: RateLimiter,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Actor() actor: ActorContext,
  ) {
    this.limiter.consume(`register:ip:${actor.ip ?? 'unknown'}`, 10, 60 * 60 * 1000);

    const result = await this.auth.register(body, {
      ip: actor.ip,
      userAgent: actor.userAgent,
      actor,
    });

    this.setSessionCookie(reply, result.token, result.maxAgeMs);
    return { user: result.user };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string },
    @Res({ passthrough: true }) reply: FastifyReply,
    @Actor() actor: ActorContext,
  ) {
    const result = await this.auth.login(body, { ip: actor.ip, userAgent: actor.userAgent, actor });
    this.setSessionCookie(reply, result.token, result.maxAgeMs);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Actor() actor: ActorContext,
  ) {
    await this.auth.logout(request.cookies?.[this.sessions.cookieName], actor);
    reply.clearCookie(this.sessions.cookieName, { path: '/' });
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Actor() actor: ActorContext,
  ) {
    const revoked = await this.sessions.revokeAllForUser(user.id, 'logout_all');
    reply.clearCookie(this.sessions.cookieName, { path: '/' });
    return { ok: true, revoked };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return { user: await this.auth.buildPublicUser(user.id) };
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.sessions.listForUser(user.id);
    return {
      items: rows.map((row) => ({
        id: row.id,
        current: row.id === user.sessionId,
        userAgent: row.userAgent,
        ip: row.ip,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      })),
    };
  }

  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const rows = await this.sessions.listForUser(user.id);
    if (!rows.some((row) => row.id === id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, { status: 404 });
    }
    await this.sessions.revoke(id, 'revoked_by_user');
    return { ok: true };
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string },
    @ClientIp() ip: string,
    @Actor() actor: ActorContext,
  ) {
    this.limiter.consume(`forgot:ip:${ip}`, 20, 60 * 60 * 1000);
    return this.auth.requestPasswordReset(body.email, actor);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string },
    @Actor() actor: ActorContext,
  ) {
    await this.auth.resetPassword(body.token, body.password, actor);
    return { ok: true };
  }

  @Post('password/change')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
    @Actor() actor: ActorContext,
  ) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword, actor);
    return { ok: true };
  }

  @Post('email/verify/request')
  @HttpCode(200)
  async requestEmailVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.requestEmailVerification(user.id);
  }

  @Post('email/verify/confirm')
  @HttpCode(200)
  async confirmEmailVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(verifyCodeSchema)) body: { code: string },
  ) {
    await this.auth.confirmEmailVerification(user.id, body.code);
    return { ok: true };
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: Record<string, unknown>,
  ) {
    return { user: await this.auth.updateProfile(user.id, body as never) };
  }

  @Post('become-provider')
  @HttpCode(200)
  async becomeProvider(@CurrentUser() user: AuthenticatedUser, @Actor() actor: ActorContext) {
    await this.auth.becomeProvider(user.id, actor);
    return { user: await this.auth.buildPublicUser(user.id) };
  }

  private setSessionCookie(reply: FastifyReply, token: string, maxAgeMs: number): void {
    reply.setCookie(this.sessions.cookieName, token, this.sessions.cookieOptions(maxAgeMs));
  }
}
