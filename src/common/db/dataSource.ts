import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigType } from '@common/config';
import { DbConfig } from '@common/interfaces';
import { ProductEntity } from '../../product/dal/productEntity';

let appDataSource: DataSource | undefined;

const createOptions = (dbConfig: DbConfig): DataSourceOptions => {
  return {
    type: 'postgres',
    host: dbConfig.host,
    port: Number(dbConfig.port),
    username: String(dbConfig.username),
    password: String(dbConfig.password),
    database: String(dbConfig.database),
    entities: [ProductEntity],
    migrationsTableName: 'custom_migration_table',
    migrations: ['db/migration/*.ts'],
    synchronize: true,
    logging: false,
  };
};

export const dataSourceFactory = (config: ConfigType): DataSource => {
  const dbConfig = config.get('db') as DbConfig;

  return new DataSource(createOptions(dbConfig));
};

export async function initDataSource(config: ConfigType): Promise<DataSource> {
  if (appDataSource?.isInitialized ?? false) {
    return appDataSource as DataSource;
  }

  appDataSource = dataSourceFactory(config);
  await appDataSource.initialize();

  return appDataSource;
}

export function getDataSource(): DataSource {
  if (!(appDataSource?.isInitialized ?? false)) {
    throw new Error('DataSource is not initialized. Make sure initDataSource was awaited.');
  }
  return appDataSource as DataSource;
}
