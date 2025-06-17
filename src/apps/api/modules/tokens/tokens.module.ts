import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { DexScreenerModule } from '../dex-screener/dex-screener.module';
import { BinanceService } from '../binance/binance.service';
import { ViemModule } from '../viem/viem.module';
import { TokensService } from './tokens.service';
import { DeFiService } from './defi.service';
import { CoingeckoTokenIdService } from './coingecko-token-id.service';

@Module({
  imports: [CacheModule, DexScreenerModule, ViemModule],
  providers: [
    TokensService,
    BinanceService,
    DeFiService,
    CoingeckoTokenIdService,
  ],
  exports: [TokensService],
})
export class TokensModule {}
