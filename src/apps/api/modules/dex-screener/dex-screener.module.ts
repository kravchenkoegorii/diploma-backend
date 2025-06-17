import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { DexScreenerService } from './dex-screener.service';

@Module({
  imports: [CacheModule],
  providers: [DexScreenerService],
  exports: [DexScreenerService],
})
export class DexScreenerModule {}
