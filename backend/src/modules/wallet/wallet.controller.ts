import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { transferSchema, walletQuerySchema, type TransferInput } from '@taskeno/contracts';
import { Actor, CurrentUser, IdempotencyKey } from '../../common/decorators';
import { RateLimiter } from '../../common/rate-limit';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { ActorContext, AuthenticatedUser } from '../../common/types';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly limiter: RateLimiter,
  ) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.summary(user.id);
  }

  @Get('summary')
  async detailedSummary(@CurrentUser() user: AuthenticatedUser) {
    const [summary, overview] = await Promise.all([this.wallet.summary(user.id), this.wallet.walletOverview(user.id)]);
    return { ...summary, walletId: overview.walletId, ledgerConsistent: overview.consistent };
  }

  @Get('transactions')
  transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(walletQuerySchema)) query: { limit?: number; cursor?: string; kind?: string; direction?: string },
  ) {
    return this.wallet.transactions(user.id, query);
  }

  @Post('transfers')
  @HttpCode(200)
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(transferSchema)) body: TransferInput,
    @IdempotencyKey() idempotencyKey: string,
    @Actor() actor: ActorContext,
  ) {
    // Transfers are the highest abuse-risk endpoint on the platform.
    this.limiter.consume(`transfer:user:${user.id}`, 10, 60 * 60 * 1000);

    const result = await this.wallet.transfer(actor, {
      fromUserId: user.id,
      toUsername: body.toUsername,
      amount: body.amountRial,
      note: body.note,
      idempotencyKey: `transfer:${user.id}:${idempotencyKey}`,
    });

    return { ok: true, journalId: result.journalId, replayed: result.replayed };
  }
}
