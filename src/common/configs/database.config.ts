import { Logger } from '@nestjs/common';
import { config } from 'dotenv';
import {
  booleanStringToBoolean,
  TBooleanString,
} from '../utils/boolean-string-to-boolean';

config();

export interface IDatabaseConfig {
  host: string;
  userName: string;
  password: string;
  port: number;
  dbName: string;
  poolSize?: number;
  isActiveLogger: boolean;
  isSSL: boolean;
}

const logger = new Logger('DBConfig');

const getDatabaseConfig = () => {
  const props = ['PGHOST', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGPORT'];

  for (const prop of props) {
    if (!process.env[prop]) {
      throw new Error(`[DbConfig]: variable ${prop} is not configured`);
    }
  }

  const host = process.env.PGHOST!;
  const login = process.env.PGUSER!;
  const password = process.env.PGPASSWORD!;
  const dbName = process.env.PGDATABASE!;
  const port = process.env.PGPORT!;

  const isActiveLogger = booleanStringToBoolean(
    (process.env.DB_IS_LOGGER_ENABLED as TBooleanString | undefined) || 'false',
  );

  const isSSL = booleanStringToBoolean(
    (process.env.DB_IS_SSL_ENABLED as TBooleanString | undefined) || 'false',
  );

  const poolSize = process.env.DB_POOL_SIZE
    ? +process.env.DB_POOL_SIZE
    : undefined;

  if (!poolSize) {
    logger.warn(`Pool size is not configured. Using default value`);
  }

  if (!isSSL) {
    logger.warn(`Running without ssl`);
  }

  if (!isActiveLogger) {
    logger.warn(`Running without active logger`);
  }

  const config: IDatabaseConfig = {
    host: host,
    port: +port,
    userName: login,
    password: password,
    dbName: dbName,
    isActiveLogger: isActiveLogger,
    poolSize,
    isSSL,
  };

  return config;
};

export const databaseConfig: IDatabaseConfig = getDatabaseConfig();
