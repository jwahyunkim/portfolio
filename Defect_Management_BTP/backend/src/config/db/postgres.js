// src/config/db/postgres.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// backend/.env 로드
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const {
  PG_HOST,
  PG_PORT,
  PG_USER,
  PG_PASSWORD,
  PG_DATABASE,
  PG_SSL,
  PG_POOL_MAX,
  PG_IDLE_TIMEOUT,
  PG_CONN_TIMEOUT,
} = process.env;

const pgConfig = {
  host: PG_HOST,
  port: Number(PG_PORT || 5432),
  user: PG_USER,
  password: PG_PASSWORD,
  database: PG_DATABASE,
  ssl: PG_SSL === 'true',
  max: Number(PG_POOL_MAX || 10),
  idleTimeoutMillis: Number(PG_IDLE_TIMEOUT || 30000),
  connectionTimeoutMillis: Number(PG_CONN_TIMEOUT || 5000),
};

export default pgConfig;
