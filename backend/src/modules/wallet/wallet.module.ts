import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.service';
import { CommissionService } from './commission.service';
import { LedgerService } from './ledger.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * Money module: the ledger is the only writer of balances, the wallet service
 * exposes the business use cases, and commission resolves pricing rules.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [WalletController],
  providers: [LedgerService, WalletService, CommissionService],
  exports: [LedgerService, WalletService, CommissionService],
})
export class WalletModule {}
