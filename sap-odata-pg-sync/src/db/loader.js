//loader.js
import { Pool } from 'pg';
import { baseConfig } from '../util/config.js';
import { log } from '../util/logging.js';

const pool = new Pool({
  host: baseConfig.pg.host,
  port: baseConfig.pg.port,
  database: baseConfig.pg.database,
  user: baseConfig.pg.user,
  password: baseConfig.pg.password,
  ssl: baseConfig.pg.ssl ? { rejectUnauthorized: true } : false
});

const q = (id) => `"${String(id).replace(/"/g, '""')}"`;

const clip = (s, n) => {
  const t = typeof s === 'string' ? s : JSON.stringify(s);
  return t.length > n ? t.slice(0, n) + '...[truncated]' : t;
};

// build full snapshot object (no local clipping; logging.js handles pretty/clip)
const buildRowSnapshot = (columns, row) => {
  try {
    const obj = {};
    for (let i = 0; i < columns.length; i++) obj[columns[i]] = row[i];
    return obj;
  } catch {
    return undefined;
  }
};

// ======================== BULK ========================
export async function replaceAll(rows, { schema, table, batchSize, columns }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${q(schema)}.${q(table)};`);
    log.info('Existing data deleted', `${schema}.${table}`);

    if (!rows || rows.length === 0) {
      await client.query('COMMIT');
      log.info('No new data, commit complete', `${schema}.${table}`);
      return;
    }

    const colList = columns.map(q).join(',');
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const params = [];
      const valuesSql = batch
        .map((row, rIdx) => {
          const ph = row.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`);
          params.push(...row);
          return `(${ph.join(',')})`;
        })
        .join(',');
      const sql = `INSERT INTO ${q(schema)}.${q(table)} (${colList}) VALUES ${valuesSql};`;
      await client.query(sql, params);
      log.info('Batch insert', `${schema}.${table}`, `batch=${Math.floor(i / batchSize) + 1}`, `rows=${batch.length}`);
    }

    await client.query('COMMIT');
    log.info('Commit complete', `${schema}.${table}`, `total=${rows.length}`);
  } catch (e) {
    await client.query('ROLLBACK');
    log.errorEx('Rollback on replaceAll', e, { schema, table, op: 'replaceAll' });
    throw e;
  } finally {
    client.release();
  }
}

// ======================== ROW INSERT ========================
export async function insertRowWise(
  rows,
  { schema, table, columns, batchSize = 1, onError = 'continue', deleteFirst = true }
) {
  const client = await pool.connect();
  const colList = columns.map(q).join(',');
  let ok = 0, fail = 0;

  try {
    await client.query('BEGIN');

    if (deleteFirst) {
      await client.query(`DELETE FROM ${q(schema)}.${q(table)};`);
      log.info('Pre-delete complete', `${schema}.${table}`);
    }

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await client.query('SAVEPOINT sp_ins;');
      try {
        const params = [];
        const valuesSql = batch
          .map((row, rIdx) => {
            const ph = row.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`);
            params.push(...row);
            return `(${ph.join(',')})`;
          })
          .join(',');
        const sql = `INSERT INTO ${q(schema)}.${q(table)} (${colList}) VALUES ${valuesSql};`;
        await client.query(sql, params);
        ok += batch.length;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_ins;');
        if (onError !== 'continue') throw e;
        log.warn('Batch insert failed, falling back to single rows', `${schema}.${table}`, e.message);

        for (let bi = 0; bi < batch.length; bi++) {
          const r = batch[bi];
          const rowIndex = i + bi;
          await client.query('SAVEPOINT sp_one;');
          try {
            const ph = r.map((_, idx) => `$${idx + 1}`).join(',');
            const sql = `INSERT INTO ${q(schema)}.${q(table)} (${colList}) VALUES (${ph});`;
            await client.query(sql, r);
            ok += 1;
          } catch (ee) {
            await client.query('ROLLBACK TO SAVEPOINT sp_one;');
            fail += 1;
            const ph = r.map((_, idx) => `$${idx + 1}`).join(',');
            const sql = `INSERT INTO ${q(schema)}.${q(table)} (${colList}) VALUES (${ph});`;

            log.errorEx('Row insert failed', ee, {
              schema,
              table,
              op: 'insert',
              rowIndex,
              rowSnapshot: buildRowSnapshot(columns, r),
              sqlFrag: clip(sql, 200),
              inlineSep: true,
              inlineSepAfter: true
            });
          }
        }
      }
    }

    await client.query('COMMIT');
    log.info('Insert row-wise complete', `${schema}.${table}`, `row_ok=${ok}`, `row_fail=${fail}`);
    return { ok, fail };
  } catch (e) {
    await client.query('ROLLBACK');
    log.errorEx('Rollback on insertRowWise', e, { schema, table, op: 'insertRowWise' });
    throw e;
  } finally {
    client.release();
  }
}

// ======================== ROW UPSERT ========================
async function getPrimaryKey(client, schema, table) {
  const sql = `
    SELECT a.attname AS col
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indisprimary
      AND n.nspname = $1
      AND c.relname = $2
    ORDER BY array_position(i.indkey, a.attnum);
  `;
  const { rows } = await client.query(sql, [schema, table]);
  return rows.map(r => r.col);
}

export async function upsertRowWise(
  rows,
  { schema, table, columns, batchSize = 1, onError = 'continue' }
) {
  const client = await pool.connect();
  let ok = 0, fail = 0;

  try {
    await client.query('BEGIN');

    const pkCols = await getPrimaryKey(client, schema, table);
    if (!pkCols.length) throw new Error(`PK not found for ${schema}.${table}`);

    const pkSet = new Set(pkCols);
    const nonPk = columns.filter(c => !pkSet.has(c));
    const colList = columns.map(q).join(',');
    const conflictList = pkCols.map(q).join(',');
    const setList = nonPk.length
      ? nonPk.map(c => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')
      : null;
    const changeCond = nonPk.length
      ? nonPk.map(c => `(EXCLUDED.${q(c)} IS DISTINCT FROM t.${q(c)})`).join(' OR ')
      : null;

    const colIndex = Object.fromEntries(columns.map((c, idx) => [c, idx]));

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await client.query('SAVEPOINT sp_up;');
      try {
        const params = [];
        const valuesSql = batch
          .map((row, rIdx) => {
            const ph = row.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`);
            params.push(...row);
            return `(${ph.join(',')})`;
          })
          .join(',');

        let sql =
          `INSERT INTO ${q(schema)}.${q(table)} AS t (${colList}) ` +
          `VALUES ${valuesSql} ` +
          `ON CONFLICT (${conflictList}) `;

        if (setList) {
          sql += `DO UPDATE SET ${setList}`;
          if (changeCond) sql += ` WHERE ${changeCond}`;
          sql += ';';
        } else {
          sql += 'DO NOTHING;';
        }

        await client.query(sql, params);
        ok += batch.length;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT sp_up;');
        if (onError !== 'continue') throw e;
        log.warn('Batch upsert failed, falling back to single rows', `${schema}.${table}`, e.message);

        for (let bi = 0; bi < batch.length; bi++) {
          const r = batch[bi];
          const rowIndex = i + bi;
          await client.query('SAVEPOINT sp_one;');
          try {
            const ph = r.map((_, idx) => `$${idx + 1}`).join(',');
            let sql =
              `INSERT INTO ${q(schema)}.${q(table)} AS t (${columns.map(q).join(',')}) ` +
              `VALUES (${ph}) ` +
              `ON CONFLICT (${conflictList}) `;
            if (setList) {
              sql += `DO UPDATE SET ${setList}`;
              if (changeCond) sql += ` WHERE ${changeCond}`;
              sql += ';';
            } else {
              sql += 'DO NOTHING;';
            }
            await client.query(sql, r);
            ok += 1;
          } catch (ee) {
            await client.query('ROLLBACK TO SAVEPOINT sp_one;');
            fail += 1;

            const pkValues = {};
            for (const k of pkCols) {
              const idx = colIndex[k];
              if (idx != null) pkValues[k] = r[idx];
            }

            let sqlSingle =
              `INSERT INTO ${q(schema)}.${q(table)} AS t (${columns.map(q).join(',')}) VALUES (${r.map((_, idx) => `$${idx + 1}`).join(',')}) ON CONFLICT (${conflictList}) `;
            if (setList) {
              sqlSingle += `DO UPDATE SET ${setList}`;
              if (changeCond) sqlSingle += ` WHERE ${changeCond}`;
              sqlSingle += ';';
            } else {
              sqlSingle += 'DO NOTHING;';
            }

            log.errorEx('Row upsert failed', ee, {
              schema,
              table,
              op: 'upsert',
              rowIndex,
              pkValues,
              rowSnapshot: buildRowSnapshot(columns, r),
              sqlFrag: clip(sqlSingle, 200),
              inlineSep: true,
              inlineSepAfter: true
            });
          }
        }
      }
    }

    await client.query('COMMIT');
    log.info('Upsert row-wise complete', `${schema}.${table}`, `row_ok=${ok}`, `row_fail=${fail}`);
    return { ok, fail };
  } catch (e) {
    await client.query('ROLLBACK');
    log.errorEx('Rollback on upsertRowWise', e, { schema, table, op: 'upsertRowWise' });
    throw e;
  } finally {
    client.release();
  }
}

export async function endPool() {
  await pool.end();
}
