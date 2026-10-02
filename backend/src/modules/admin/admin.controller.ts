import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  adminAdjustmentSchema,
  commissionRuleSchema,
  createCategorySchema,
  moderationDecisionSchema,
  settingUpdateSchema,
  suspendUserSchema,
  uuidSchema,
  type AdminAdjustmentInput,
  type CommissionRuleInput,
  type CreateCategoryInput,
  type ModerationDecisionInput,
} from '@taskeno/contracts';
import { Actor, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { ActorContext } from '../../common/types';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationsModule } from '../notifications/notifications.service';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReviewsModule } from '../reviews/reviews.service';
import { WalletModule } from '../wallet/wallet.module';
import { AdminService } from './admin.service';

/**
 * Every route here requires the `admin` role. The guard runs before the handler,
 * and each service call records an audit entry.
 */
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }

  /* Users ---------------------------------------------------------------- */

  @Get('users')
  users(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.admin.listUsers({ q, limit: limit ? Number(limit) : undefined });
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(suspendUserSchema)) body: { reason: string },
    @Actor() actor: ActorContext,
  ) {
    return this.admin.setUserStatus(id, 'suspended', body.reason, actor);
  }

  @Post('users/:id/activate')
  @HttpCode(200)
  activate(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.admin.setUserStatus(id, 'active', 'بازفعال‌سازی توسط مدیریت', actor);
  }

  @Get('users/:id/wallet')
  wallet(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.admin.userWallet(id);
  }

  /* Moderation ----------------------------------------------------------- */

  @Get('services/moderation')
  moderation() {
    return this.admin.moderationQueue();
  }

  @Post('services/:id/moderate')
  @HttpCode(200)
  moderate(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(moderationDecisionSchema)) body: ModerationDecisionInput,
    @Actor() actor: ActorContext,
  ) {
    return this.admin.moderateService(id, body, actor);
  }

  @Post('reviews/:id/visibility')
  @HttpCode(200)
  reviewVisibility(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: { visible?: boolean },
    @Actor() actor: ActorContext,
  ) {
    return this.admin.setReviewVisibility(id, body?.visible !== false, actor);
  }

  /* Orders / payments / disputes ---------------------------------------- */

  @Get('orders')
  orders(@Query('status') status?: string) {
    return this.admin.listOrders(status);
  }

  @Get('disputes')
  disputes(@Query('status') status?: string) {
    return this.admin.listDisputes(status);
  }

  @Post('orders/:id/resolve')
  @HttpCode(200)
  resolve(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: { decision: 'release_to_provider' | 'refund_buyer' | 'partial_refund'; note: string; partialAmountRial?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.admin.resolveDispute(
      id,
      {
        decision: body.decision,
        note: body.note,
        partialAmountRial: body.partialAmountRial ? BigInt(body.partialAmountRial) : undefined,
      },
      actor,
    );
  }

  @Get('payments')
  payments() {
    return this.admin.listPayments();
  }

  /* Ledger --------------------------------------------------------------- */

  @Get('ledger/journals')
  journals(@Query('limit') limit?: string) {
    return this.admin.ledgerJournals(limit ? Number(limit) : 50);
  }

  @Get('ledger/health')
  ledgerHealth() {
    return this.admin.ledgerHealth();
  }

  @Get('ledger/wallets')
  platformWallets() {
    return this.admin.platformWalletBalances();
  }

  /** Manual correction. Requires a reason and is written to the audit trail. */
  @Post('wallet/adjustments')
  @HttpCode(200)
  adjust(
    @Body(new ZodValidationPipe(adminAdjustmentSchema)) body: AdminAdjustmentInput,
    @Actor() actor: ActorContext,
  ) {
    return this.admin.adjustWallet(body, actor);
  }

  /* Configuration -------------------------------------------------------- */

  @Get('categories')
  categories() {
    return this.admin.listCategories();
  }

  @Post('categories')
  createCategory(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
    @Actor() actor: ActorContext,
  ) {
    return this.admin.createCategory(body, actor);
  }

  @Get('commission-rules')
  commissionRules() {
    return this.admin.listCommissionRules();
  }

  @Post('commission-rules')
  createCommissionRule(
    @Body(new ZodValidationPipe(commissionRuleSchema)) body: CommissionRuleInput,
    @Actor() actor: ActorContext,
  ) {
    return this.admin.createCommissionRule(body, actor);
  }

  @Get('settings')
  settings() {
    return this.admin.listSettings();
  }

  @Put('settings')
  @HttpCode(200)
  updateSetting(@Body(new ZodValidationPipe(settingUpdateSchema)) body: { key: string; value: unknown }, @Actor() actor: ActorContext) {
    return this.admin.updateSetting(body.key, body.value, actor);
  }

  /* Compliance ----------------------------------------------------------- */

  @Get('audit-logs')
  auditLogs(@Query('limit') limit?: string) {
    return this.admin.listAuditLogs(limit ? Number(limit) : 100);
  }

  @Get('reports')
  reports(@Query('status') status?: string) {
    return this.admin.listReports(status);
  }

  @Patch('reports/:id')
  @HttpCode(200)
  resolveReport(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() body: { status: 'resolved' | 'dismissed'; note?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.admin.resolveReport(id, body.status, body.note ?? '', actor);
  }
}

@Module({
  imports: [CatalogModule, WalletModule, OrdersModule, PaymentsModule, ReviewsModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
