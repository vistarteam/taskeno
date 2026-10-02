import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { depositSchema, type DepositInput } from '@taskeno/contracts';
import { Actor, CurrentUser, IdempotencyKey, Public } from '../../common/decorators';
import { RateLimiter } from '../../common/rate-limit';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { ActorContext, AuthenticatedUser } from '../../common/types';
import { env } from '../../config/env';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Charges the caller's account, funding their wallet through the gateway. */
  @Post('wallet/deposits')
  async createDeposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(depositSchema)) body: DepositInput,
    @IdempotencyKey() idempotencyKey: string,
    @Actor() actor: ActorContext,
  ) {
    this.limiter.consume(`deposit:user:${user.id}`, 10, 60 * 60 * 1000);

    return this.payments.createIntent(
      user.id,
      {
        purpose: 'deposit',
        amount: body.amountRial,
        idempotencyKey: `deposit:${user.id}:${idempotencyKey}`,
        description: 'شارژ کیف پول Taskeno',
      },
      actor,
    );
  }

  /** Gateway payment for an order; the money lands in escrow on settlement. */
  @Post('orders/:id/pay-gateway')
  async payOrderWithGateway(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @IdempotencyKey() idempotencyKey: string,
    @Actor() actor: ActorContext,
  ) {
    this.limiter.consume(`order-payment:user:${user.id}`, 20, 60 * 60 * 1000);
    return this.payments.createOrderPayment(user.id, id, `order-pay:${user.id}:${idempotencyKey}`, actor);
  }

  @Get('payments')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.listForUser(user.id);
  }

  @Get('payments/:id')
  status(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payments.statusForUser(user.id, id);
  }

  @Public()
  @Get('payments/meta/provider')
  providerMeta() {
    return { provider: this.payments.providerKey, name: this.payments.providerName, currency: env.CURRENCY };
  }

  /**
   * Gateway redirect target.
   *
   * The browser lands here with untrusted query parameters; the service verifies
   * server-to-server before anything is settled, then the user is sent back to
   * the app with the outcome.
   */
  @Public()
  @Get('payments/callback/:provider')
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const result = await this.payments.handleCallback(
      {
        authority: query.Authority ?? query.authority ?? query.token,
        status: query.Status ?? query.status,
        ip: request.ip,
        raw: query as Record<string, unknown>,
      },
      provider,
    );

    const status = result.ok ? 'success' : 'failed';
    const target = new URL('/pay/result', env.APP_URL);
    target.searchParams.set('status', status);
    if (result.paymentId) target.searchParams.set('paymentId', result.paymentId);
    if (result.orderId) target.searchParams.set('orderId', result.orderId);
    if (!result.ok) target.searchParams.set('code', String(result.code));

    void reply.redirect(target.toString(), 302);
  }

  /** Sandbox gateway page: it renders the amount and lets you pick an outcome. */
  @Public()
  @Get('payments/sandbox/:authority')
  sandboxIntent(@Param('authority') authority: string) {
    return this.payments.intentByAuthority(authority);
  }

  @Public()
  @Post('payments/sandbox/:authority/complete')
  @HttpCode(200)
  async sandboxComplete(@Param('authority') authority: string, @Body() body: { outcome?: string }) {
    const outcome = body?.outcome === 'failure' ? 'failure' : 'success';
    await this.payments.sandboxComplete(authority, outcome);
    return { ok: true, redirectTo: `/api/v1/payments/callback/${this.payments.providerKey}?Authority=${authority}&Status=${outcome === 'success' ? 'OK' : 'NOK'}` };
  }
}
