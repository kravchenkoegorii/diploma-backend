import { Module } from '@nestjs/common';
import { BalancesModule } from '../../api/modules/balances/balances.module';
import { CleanerService } from './cleaner.service';

@Module({
  imports: [BalancesModule],
  providers: [CleanerService],
})
export class CleanerModule {}
