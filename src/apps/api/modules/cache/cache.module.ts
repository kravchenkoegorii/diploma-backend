import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { ConfigNames } from 'src/common/types/enums/config-names.enum';
import { CacheService } from './cache.service';
import { IRedisConfig } from 'src/common/configs/redis.config';

const logger = new Logger('Redis');
const cacheModule = NestCacheModule.registerAsync({
  isGlobal: true,
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => {
    const cfg = configService.getOrThrow<IRedisConfig>(ConfigNames.REDIS);
    const store = await redisStore({
      database: cfg.cacheDb,
      username: cfg.user,
      password: cfg.password,
      socket: {
        host: cfg.host,
        port: cfg.port,
        tls: cfg.isTls,
      },
    });

    store.client.on('error', (err) => logger.error(`Redis Error: ${err}`));

    return {
      isGlobal: true,
      store: store,
    };
  },
  inject: [ConfigService],
});

@Global()
@Module({
  providers: [CacheService],
  imports: [cacheModule],
  exports: [CacheService],
})
export class CacheModule {}
