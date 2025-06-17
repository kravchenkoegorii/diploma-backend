import { registerAs } from '@nestjs/config';
import { config } from 'dotenv';
import { ConfigNames } from 'src/common/types/enums/config-names.enum';
import {
  booleanStringToBoolean,
  TBooleanString,
} from '../utils/boolean-string-to-boolean';

config();

export interface IRedisConfig {
  host: string;
  port: number;
  bullDb: number;
  cacheDb: number;
  pubSubDb: number;
  user: string;
  password: string;
  isTls: boolean;
  family?: number;
}

const getRedisConfig = () => {
  const host = process.env.REDIS_HOST as string;
  const port = +process.env.REDIS_PORT! as number;
  const bullDb = +process.env.REDIS_BULL_DB! as number;
  const cacheDb = +process.env.REDIS_CACHE_DB! as number;
  const pubSubDb = +(process.env.REDIS_PUB_SUB_DB || 5) as number;
  const user = process.env.REDIS_USER! as string;
  const password = process.env.REDIS_PASSWORD! as string;
  const isTls = booleanStringToBoolean(
    (process.env.REDIS_IS_TLS_ENABLED as TBooleanString | undefined) || 'false',
  );

  const config: IRedisConfig = {
    host,
    port,
    bullDb,
    user,
    password,
    cacheDb,
    pubSubDb,
    isTls,
    family: 0,
  };

  return config;
};

export const redisConfig = registerAs(ConfigNames.REDIS, getRedisConfig);
