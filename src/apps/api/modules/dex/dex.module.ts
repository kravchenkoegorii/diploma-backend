import { Module } from '@nestjs/common';
import { DexService } from './dex.service';
import { AerodromeModule } from '../aerodrome/aerodrome.module';
import { VelodromeModule } from '../velodrome/velodrome.module';
import { CacheModule } from '../cache/cache.module';
import { DexController } from './dex.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { TokensModule } from '../tokens/tokens.module';

@Module({
  imports: [
    CacheModule,
    UsersModule,
    AuthModule,
    AerodromeModule,
    VelodromeModule,
    TokensModule,
  ],
  providers: [DexService],
  exports: [DexService],
  controllers: [DexController],
})
export class DexModule {}
