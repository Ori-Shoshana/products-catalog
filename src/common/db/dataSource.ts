import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ProductEntity } from '../../product/dal/productEntity';

const host = process.env.DB_HOST ?? 'localhost';
const port = Number(process.env.DB_PORT);

const username = process.env.DB_USER ?? process.env.DB_USERNAME ?? process.env.POSTGRES_USER;

const password = process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;

const database = process.env.DB_NAME ?? process.env.DB_DATABASE ?? process.env.POSTGRES_DB;

export const appDataSource = new DataSource({
  type: 'postgres',
  host,
  port,
  username,
  password,
  database,
  entities: [ProductEntity],
  synchronize: false,
  logging: false,
});

export async function initDataSource(): Promise<DataSource> {
  if (!appDataSource.isInitialized) {
    await appDataSource.initialize();
  }
  return appDataSource;
}
