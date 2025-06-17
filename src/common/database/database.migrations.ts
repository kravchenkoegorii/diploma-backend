import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseConfig } from '../configs/database.config';

export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host: databaseConfig.host,
  port: databaseConfig.port,
  username: databaseConfig.userName,
  password: databaseConfig.password,
  database: databaseConfig.dbName,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/**/*.js'],
  migrationsRun: false,
  synchronize: false,
  logging: databaseConfig.isActiveLogger,
  ssl: databaseConfig.isSSL
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
  poolSize: databaseConfig.poolSize,
  extra: {
    connectionTimeoutMillis: 3000, // Timeout after 3 seconds if a connection isn't available
    idleTimeoutMillis: 5000, // Close idle connections after 5 seconds
  },
};

const AppSource = new DataSource(typeOrmConfig);

export default AppSource;
