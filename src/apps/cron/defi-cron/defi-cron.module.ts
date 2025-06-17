import { Module } from '@nestjs/common';
import { AuthModule } from 'src/apps/api/modules/auth/auth.module';
import { DexScreenerModule } from 'src/apps/api/modules/dex-screener/dex-screener.module';
import { PrivyModule } from 'src/apps/api/modules/privy/privy.module';
import { UsersModule } from 'src/apps/api/modules/users/users.module';
import { CacheModule } from 'src/apps/api/modules/cache/cache.module';
import { DeFiCronService } from './defi-cron.service';
import { TokensModule } from 'src/apps/api/modules/tokens/tokens.module';

@Module({
  imports: [
    CacheModule,
    TokensModule,
    DexScreenerModule,
    PrivyModule,
    AuthModule,
    UsersModule,
  ],
  providers: [DeFiCronService],
  exports: [DeFiCronService],
})
export class DeFiCronModule {}
