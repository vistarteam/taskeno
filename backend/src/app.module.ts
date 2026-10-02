import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { RolesGuard, SessionAuthGuard } from './common/guards';
import { AdminModule } from './modules/admin/admin.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CoreModule } from './modules/core.module';
import { HealthController } from './modules/health/health.controller';
import { NotificationsModule } from './modules/notifications/notifications.service';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReviewsModule } from './modules/reviews/reviews.service';
import { SettingsModule } from './modules/settings/settings.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
  imports: [
    CoreModule,
    SettingsModule,
    NotificationsModule,
    AuthModule,
    CatalogModule,
    WalletModule,
    OrdersModule,
    TasksModule,
    PaymentsModule,
    ReviewsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}