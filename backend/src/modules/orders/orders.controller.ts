import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  createOrderSchema,
  orderQuerySchema,
  orderTransitionSchema,
  sendMessageSchema,
  type CreateOrderInput,
  type OrderQuery,
} from '@taskeno/contracts';
import { Actor, CurrentUser, IdempotencyKey } from '../../common/decorators';
import { RateLimiter } from '../../common/rate-limit';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { ActorContext, AuthenticatedUser } from '../../common/types';
import { OrdersService } from './orders.service';

type TransitionBody = { reason?: string; message?: string };

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @IdempotencyKey() idempotencyKey: string,
    @Actor() actor: ActorContext,
  ) {
    this.limiter.consume(`order:create:${user.id}`, 30, 60 * 60 * 1000);
    return this.orders.create(user.id, body, idempotencyKey, actor);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(orderQuerySchema)) query: OrderQuery) {
    return this.orders.list(user.id, query);
  }

  @Get('unread-messages')
  async unreadMessages(@CurrentUser() user: AuthenticatedUser) {
    return { count: await this.orders.unreadMessageCount(user.id) };
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.detailForActor(id, user.id, user.roles);
  }

  @Post(':id/pay')
  @HttpCode(200)
  payWithWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.orders.payWithWallet(user.id, id, actor);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  deliver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderTransitionSchema)) body: TransitionBody,
    @Actor() actor: ActorContext,
  ) {
    return this.orders.deliver(user.id, id, body, actor);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderTransitionSchema)) body: TransitionBody,
    @Actor() actor: ActorContext,
  ) {
    return this.orders.applyAction(id, 'accept', user.id, body, actor);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderTransitionSchema)) body: TransitionBody,
    @Actor() actor: ActorContext,
  ) {
    return this.orders.applyAction(id, 'start', user.id, body, actor);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderTransitionSchema)) body: TransitionBody,
    @Actor() actor: ActorContext,
  ) {
    return this.orders.applyAction(id, 'complete', user.id, body, actor);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderTransitionSchema)) body: TransitionBody,
    @Actor() actor: ActorContext,
  ) {
    return this.orders.applyAction(id, 'cancel', user.id, body, actor);
  }

  @Post(':id/dispute')
  @HttpCode(200)
  dispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderTransitionSchema)) body: TransitionBody,
    @Actor() actor: ActorContext,
  ) {
    return this.orders.applyAction(id, 'dispute', user.id, body, actor);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.listMessages(id, user.id, user.roles);
  }

  @Post(':id/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: { body: string; fileIds?: string[] },
  ) {
    this.limiter.consume(`message:${user.id}`, 120, 60 * 60 * 1000);
    return this.orders.sendMessage(id, user.id, body);
  }
}


