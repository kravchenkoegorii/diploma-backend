import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AerodromeModule } from '../aerodrome/aerodrome.module';
import { ViemModule } from '../viem/viem.module';
import { TransactionHistoryService } from './transaction-history.service';
import { TransactionHistoryController } from './transaction-history.controller';
import { AlchemyService } from './alchemy.service';
import { FormatTransactions } from './utils/format-transactions';

@Module({
  imports: [AuthModule, UsersModule, AerodromeModule, ViemModule],
  providers: [TransactionHistoryService, AlchemyService, FormatTransactions],
  controllers: [TransactionHistoryController],
})
export class TransactionHistoryModule {}
