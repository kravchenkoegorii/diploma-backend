import { Module } from '@nestjs/common';
import { VelodromeService } from './velodrome.service';
import { VelodromeStatisticsService } from './velodrome-statistics.service';
import { VelodromeDataService } from './velodrome-data.service';
import { VelodromeRoutesService } from './velodrome-routes.service';
import { PrivyModule } from '../privy/privy.module';
import { ViemModule } from '../viem/viem.module';
import { TokenPricesRepository } from '../balances/repositories/token-prices.repository';
import { VelodromeClaimerService } from './action-services/velodrome-claimer.service';
import { VelodromeDepositService } from './action-services/velodrome-deposit.service';
import { VelodromeLockerService } from './action-services/velodrome-locker.service';
import { VelodromeStakerService } from './action-services/velodrome-staker.service';
import { VelodromeSwapperService } from './action-services/velodrome-swapper.service';
import { VelodromeVoterService } from './action-services/velodrome-voter.service';
import { VelodromeWithdrawService } from './action-services/velodrome-withdraw.service';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [TokensModule, PrivyModule, ViemModule],
  providers: [
    TokenPricesRepository,
    VelodromeService,
    VelodromeStatisticsService,
    VelodromeDataService,
    VelodromeRoutesService,
    VelodromeClaimerService,
    VelodromeDepositService,
    VelodromeLockerService,
    VelodromeStakerService,
    VelodromeSwapperService,
    VelodromeVoterService,
    VelodromeWithdrawService,
  ],
  exports: [
    VelodromeService,
    VelodromeStatisticsService,
    VelodromeDataService,
    VelodromeClaimerService,
    VelodromeDepositService,
    VelodromeLockerService,
    VelodromeStakerService,
    VelodromeSwapperService,
    VelodromeVoterService,
    VelodromeWithdrawService,
  ],
  controllers: [],
})
export class VelodromeModule {}
