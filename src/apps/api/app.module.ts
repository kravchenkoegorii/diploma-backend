import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { IRedisConfig, redisConfig } from '../../common/configs/redis.config';
import appConfig from '../../common/configs/app.config';
import { ConfigNames } from '../../common/types/enums/config-names.enum';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from '../../common/database/database.migrations';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from './modules/cache/cache.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChatsModule } from './modules/chats/chats.module';
import { MessagesModule } from './modules/messages/messages.module';
import { OpenAiModule } from './modules/openai/openai.module';
import { DexScreenerModule } from './modules/dex-screener/dex-screener.module';
import { AerodromeModule } from './modules/aerodrome/aerodrome.module';
import { PrivyModule } from './modules/privy/privy.module';
import { AppController } from './app.controller';
import { BalancesModule } from './modules/balances/balances.module';
import alchemyConfig from 'src/common/configs/alchemy.config';
import { VelodromeModule } from './modules/velodrome/velodrome.module';
import { DexModule } from './modules/dex/dex.module';
import { ViemModule } from './modules/viem/viem.module';
import { TransactionHistoryModule } from './modules/transaction-history/transaction-history.module';
import { TokensModule } from './modules/tokens/tokens.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig, redisConfig, alchemyConfig],
      isGlobal: true,
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const cfg = configService.getOrThrow<IRedisConfig>(ConfigNames.REDIS);

        return {
          throttlers: [
            {
              ttl: seconds(1),
              limit: 15,
            },
          ],
          storage: new ThrottlerStorageRedisService({
            ...cfg,
            db: cfg.cacheDb,
          }),
        };
      },
    }),

    TypeOrmModule.forRoot(typeOrmConfig),
    ScheduleModule.forRoot(),
    CacheModule,
    ViemModule,

    AuthModule,
    UsersModule,
    ChatsModule,
    MessagesModule,
    DexModule,

    OpenAiModule,
    DexScreenerModule,
    AerodromeModule,
    VelodromeModule,
    PrivyModule,
    BalancesModule,

    TokensModule,

    TransactionHistoryModule,
  ],
  providers: [],
  controllers: [AppController],
})
export class AppModule {}
