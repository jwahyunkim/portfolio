// reader.js

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

// ===== PK 타입 캐시 (schema.table 단위) =====
const _pkCastCache = new Map();

/**
 * PK 컬럼 타입을 보고 필요한 캐스팅(date/time/timestamp/timestamptz)만 적용하기 위한 맵을 만든다.
 * - 컬럼명이 work_date여도 실제 타입이 date가 아니면 캐스팅하지 않음(다른 JOB 영향 방지)
 */
async function getPkCastMap(client, schema, table, pk) {
  const cacheKey = `${schema}.${table}`;
  if (_pkCastCache.has(cacheKey)) return _pkCastCache.get(cacheKey);

  const out = new Map(); // col -> castType | null
  try {
    const q = `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = ANY($3);
    `;
    const res = await client.query(q, [schema, table, pk]);

    for (const r of (res?.rows || [])) {
      const col = r.column_name;
      const dt = String(r.data_type || '').toLowerCase();
      const udt = String(r.udt_name || '').toLowerCase();

      let castType = null;

      // date
      if (dt === 'date' || udt === 'date') castType = 'date';

      // time (time without time zone / time with time zone)
      else if (dt.startsWith('time')) castType = 'time';

      // timestamp
      else if (dt === 'timestamp without time zone' || udt === 'timestamp') castType = 'timestamp';

      // timestamptz
      else if (dt === 'timestamp with time zone' || udt === 'timestamptz') castType = 'timestamptz';

      out.set(col, castType);
    }

    // 조회 안 된 컬럼은 캐스팅 없음으로 둔다
    for (const c of pk) {
      if (!out.has(c)) out.set(c, null);
    }
  } catch (e) {
    // 타입 조회 실패 시: 안전하게 "캐스팅 없음"으로 fallback (기존 동작 유지)
    log.warn('Failed to load PK column types (fallback to no-cast)', { schema, table, err: e?.message || String(e) });
    for (const c of pk) out.set(c, null);
  }

  _pkCastCache.set(cacheKey, out);
  return out;
}

export async function readPending(sql) {
  const client = await pool.connect();
  try {
    await client.query('SET LOCAL statement_timeout = 30000;');
    const { rows } = await client.query(sql);
    log.info('Pending rows loaded', `rows=${rows.length}`);
    return rows;
  } catch (e) {
    log.errorEx('Error reading pending rows', e, { op: 'readPending' });
    throw e;
  } finally {
    client.release();
  }
}

export async function markSent(rows, { schema, table, pk }) {
  if (!rows.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // PK 값 추출: dual({__hdr,__itm})도 안전하게 처리
    const pickPkVal = (r, c) => {
      const v = r?.[c];
      if (v !== undefined) return v;
      if (r?.__itm && r.__itm[c] !== undefined) return r.__itm[c];
      if (r?.__hdr && r.__hdr[c] !== undefined) return r.__hdr[c];
      return undefined;
    };

    // PK 타입 기반 캐스팅 결정
    const castMap = await getPkCastMap(client, schema, table, pk);

    // 너무 큰 VALUES 방지 (안전 상수)
    const CHUNK = 500;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);

      const tuples = [];
      const params = ['SENT', null];
      let p = 3;

      for (const r of part) {
        const keyVals = pk.map((c) => pickPkVal(r, c));

        // PK가 전부 undefined면 스킵 + 로그
        if (keyVals.every((x) => x === undefined)) {
          log.warn('markSent skipped (pk undefined)', { schema, table, pk, row: Object.keys(r || {}) });
          continue;
        }

        tuples.push(`(${keyVals.map(() => `$${p++}`).join(',')})`);
        params.push(...keyVals);
      }

      if (!tuples.length) continue;

      const pkCols = pk.map((c) => `"${c}"`).join(',');

      // 조인 조건: 실제 컬럼 타입이 date/time/timestamp/timestamptz 인 경우에만 v쪽에 캐스팅 적용
      const joinCond = pk.map((c) => {
        const castType = castMap.get(c);
        const rhs = castType ? `v."${c}"::${castType}` : `v."${c}"`;
        return `t."${c}" = ${rhs}`;
      }).join(' AND ');

      const sql = `
        UPDATE "${schema}"."${table}" t
        SET ifstatus = $1, sent_at = NOW(), last_error = $2
        FROM (VALUES ${tuples.join(',')}) AS v(${pkCols})
        WHERE ${joinCond};
      `;

      const res = await client.query(sql, params);

      // [추가] 실제로 안 바뀌는 케이스 추적
      if ((res?.rowCount ?? 0) === 0) {
        log.warn('markSent updated 0 rows (batch)', { schema, table, pk, count: tuples.length });
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    log.errorEx('Error marking sent', e, { schema, table, op: 'markSent' });
    throw e;
  } finally {
    client.release();
  }
}

export async function markError(rows, msg, { schema, table, pk }) {
  if (!rows.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pickPkVal = (r, c) => {
      const v = r?.[c];
      if (v !== undefined) return v;
      if (r?.__itm && r.__itm[c] !== undefined) return r.__itm[c];
      if (r?.__hdr && r.__hdr[c] !== undefined) return r.__hdr[c];
      return undefined;
    };

    // PK 타입 기반 캐스팅 결정
    const castMap = await getPkCastMap(client, schema, table, pk);

    const CHUNK = 500;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);

      const tuples = [];
      const params = [msg];
      let p = 2;

      for (const r of part) {
        const keyVals = pk.map((c) => pickPkVal(r, c));

        if (keyVals.every((x) => x === undefined)) {
          log.warn('markError skipped (pk undefined)', { schema, table, pk, row: Object.keys(r || {}) });
          continue;
        }

        tuples.push(`(${keyVals.map(() => `$${p++}`).join(',')})`);
        params.push(...keyVals);
      }

      if (!tuples.length) continue;

      const pkCols = pk.map((c) => `"${c}"`).join(',');

      // 조인 조건: 실제 컬럼 타입이 date/time/timestamp/timestamptz 인 경우에만 v쪽에 캐스팅 적용
      const joinCond = pk.map((c) => {
        const castType = castMap.get(c);
        const rhs = castType ? `v."${c}"::${castType}` : `v."${c}"`;
        return `t."${c}" = ${rhs}`;
      }).join(' AND ');

      const sql = `
        UPDATE "${schema}"."${table}" t
        SET last_error = $1
        FROM (VALUES ${tuples.join(',')}) AS v(${pkCols})
        WHERE ${joinCond};
      `;

      await client.query(sql, params);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    log.errorEx('Error marking error', e, { schema, table, op: 'markError' });
    throw e;
  } finally {
    client.release();
  }
}
