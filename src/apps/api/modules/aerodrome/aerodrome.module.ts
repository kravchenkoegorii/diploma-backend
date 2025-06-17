import { Module } from '@nestjs/common';
import { AerodromeService } from './aerodrome.service';
import { CacheModule } from '../cache/cache.module';
import { AerodromeRoutesService } from './aerodrome-routes.service';
import { AerodromeStatisticsService } from './aerodrome-statistics.service';
import { DexScreenerModule } from '../dex-screener/dex-screener.module';
import { PrivyModule } from '../privy/privy.module';
import { ViemModule } from '../viem/viem.module';
import { AerodromeDataService } from './aerodrome-data.service';
import { TokenPricesRepository } from '../balances/repositories/token-prices.repository';
import { AerodromeClaimerService } from './action-services/aerodrome-claimer.service';
import { AerodromeDepositService } from './action-services/aerodrome-deposit.service';
import { AerodromeLockerService } from './action-services/aerodrome-locker.service';
import { AerodromeStakerService } from './action-services/aerodrome-staker.service';
import { AerodromeVoterService } from './action-services/aerodrome-voter.service';
import { AerodromeWithdrawService } from './action-services/aerodrome-withdraw.service';
import { AerodromeSwapperService } from './action-services/aerodrome-swapper.service';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [
    CacheModule,
    TokensModule,
    DexScreenerModule,
    PrivyModule,
    ViemModule,
  ],
  providers: [
    TokenPricesRepository,
    AerodromeService,
    AerodromeRoutesService,
    AerodromeStatisticsService,
    AerodromeDataService,
    AerodromeClaimerService,
    AerodromeDepositService,
    AerodromeLockerService,
    AerodromeStakerService,
    AerodromeVoterService,
    AerodromeWithdrawService,
    AerodromeSwapperService,
  ],
  exports: [
    AerodromeService,
    AerodromeStatisticsService,
    AerodromeDataService,
    AerodromeClaimerService,
    AerodromeDepositService,
    AerodromeLockerService,
    AerodromeStakerService,
    AerodromeVoterService,
    AerodromeWithdrawService,
    AerodromeSwapperService,
  ],
})
export class AerodromeModule {}
