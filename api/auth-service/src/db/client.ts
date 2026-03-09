import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

/** PostgreSQL 接続プール */
export const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME     ?? 'mockdb',
  user:     process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
});
