import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { DeFiLlamaService } from './defillama.service';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [CacheModule, TokensModule],
  providers: [DeFiLlamaService],
  exports: [DeFiLlamaService],
})
export class DeFiLlamaModule {}
