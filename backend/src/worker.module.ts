import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CoreModule } from './modules/core.module';
import { JobsWorker } from './modules/jobs/jobs.worker';
import { NotificationsModule } from './modules/notifications/notifications.service';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SettingsModule } from './modules/settings/settings.module';
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
    PaymentsModule,
  ],
  providers: [JobsWorker],
})
export class WorkerModule {}
