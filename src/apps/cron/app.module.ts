import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import appConfig from 'src/common/configs/app.config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from 'src/common/database/database.migrations';
import { CacheModule } from '../api/modules/cache/cache.module';
import { BullModule } from '@nestjs/bull';
import { IRedisConfig, redisConfig } from 'src/common/configs/redis.config';
import { ConfigNames } from 'src/common/types/enums/config-names.enum';
import { AppController } from './app.controller';
import { DexCronModule } from './dex-cron/dex-cron.module';
import { DeFiCronModule } from './defi-cron/defi-cron.module';
import { CleanerModule } from './cleaner/cleaner.module';

@Module({
  imports: [
    CacheModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      load: [appConfig, redisConfig],
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cfg = configService.getOrThrow<IRedisConfig>(ConfigNames.REDIS);
        return {
          redis: {
            family: cfg.family,
            host: cfg.host,
            port: cfg.port,
            db: cfg.bullDb,
            username: cfg.user,
            password: cfg.password,
          },
        };
      },
    }),
    DexCronModule,
    DeFiCronModule,
    CleanerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
