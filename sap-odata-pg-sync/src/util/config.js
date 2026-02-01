import dotenv from 'dotenv';
dotenv.config();

const bool = (v, d=false) => v === undefined ? d : String(v).toLowerCase() === 'true';

export const baseConfig = {
  odataAuth: { user: process.env.ODATA_USER, pass: process.env.ODATA_PASS },
  pg: {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: bool(process.env.PGSSL, false)
  },
  defaults: {
    pageSize: Number(process.env.PAGE_SIZE || 5000),
    batchSize: Number(process.env.BATCH_SIZE || 1000),
    nullIfEmpty: bool(process.env.NULL_IF_EMPTY, true)
  }
};
