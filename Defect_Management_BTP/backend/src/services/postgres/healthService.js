// src/services/postgres/healthService.js
import { Pool } from 'pg';
import pgConfig from '../../config/db/postgres.js';

const pool = new Pool(pgConfig);

export async function ping() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

function isValidIdentifier(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export async function checkTable(schema, table) {
  if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
    const err = new Error('Invalid schema or table name');
    err.code = 'BAD_IDENTIFIER';
    throw err;
  }

  const sql = `SELECT 1 AS ok FROM "${schema}"."${table}" LIMIT 1`;
  const client = await pool.connect();
  try {
    const res = await client.query(sql);
    return { ok: true, rowCount: res.rowCount };
  } finally {
    client.release();
  }
}

export { pool };
