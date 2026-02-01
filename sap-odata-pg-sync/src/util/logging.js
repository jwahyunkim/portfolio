// util/logging.js
import dotenv from 'dotenv';
dotenv.config();

import { mkdir, appendFile } from 'fs/promises';
import { resolve, dirname, parse, format } from 'path';
import crypto from 'crypto';

// ----- env helpers -----
const env = (k, d) => (process.env[k] ?? d);
const envInt = (k, d) => {
  const v = parseInt(process.env[k] ?? '', 10);
  return Number.isFinite(v) ? v : d;
};

// base options
const LOG_FORMAT = String(env('LOG_FORMAT', 'human')).toLowerCase(); // 'human' | 'json'
const STACK_LEN  = envInt('LOG_STACK_LEN', 2000);
const RESP_LEN   = envInt('LOG_RESP_LEN', 500);
const SQL_LEN    = envInt('LOG_SQL_LEN', 200);
const SNAP_LEN   = envInt('LOG_SNAPSHOT_LEN', 800);

// inline separator for row-level errors (human only)
const INLINE_SEP_WIDTH = envInt('LOG_INLINE_SEP_WIDTH', 25);
const INLINE_SEP_CHAR  = String(env('LOG_INLINE_SEP_CHAR', '-'));

// pretty flags (human mode)
const PRETTY_JSON        = String(env('LOG_PRETTY_JSON', 'true')).toLowerCase() === 'true';
const PRETTY_JSON_INDENT = envInt('LOG_PRETTY_JSON_INDENT', 2);

// file sink flags
const ERROR_TO_FILE           = String(env('LOG_ERROR_TO_FILE', 'false')).toLowerCase() === 'true';
const ERROR_FILE_RAW          = String(env('LOG_ERROR_FILE', './logs/error.log'));
const ERROR_FILE_ROLL         = String(env('LOG_ERROR_FILE_ROLL', 'false')).toLowerCase() === 'true';
const ERROR_FILE_ROLL_ADD_PID = String(env('LOG_ERROR_FILE_ROLL_ADD_PID', 'true')).toLowerCase() === 'true';

// dedup flags
const ERROR_DEDUP              = String(env('LOG_ERROR_DEDUP', 'true')).toLowerCase() === 'true';
const ERROR_DEDUP_TTL_MS       = envInt('LOG_ERROR_DEDUP_TTL_MS', 0);
const ERROR_DEDUP_STRIP_QUERY  = String(env('LOG_ERROR_DEDUP_STRIP_QUERY', 'true')).toLowerCase() === 'true';

// ----- utils -----
const nowIso = () => new Date().toISOString();

const clip = (s, n) => {
  if (s == null) return s;
  const t = typeof s === 'string' ? s : JSON.stringify(s);
  return t.length > n ? t.slice(0, n) + '...[truncated]' : t;
};

const prettyMaybe = (v) => {
  if (!PRETTY_JSON || v == null) return v;
  try {
    const obj = typeof v === 'string' ? JSON.parse(v) : v;
    return JSON.stringify(obj, null, PRETTY_JSON_INDENT);
  } catch {
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
};

function pretyToString(v) {
  return typeof v === 'string' ? v : JSON.stringify(v, null, PRETTY_JSON ? PRETTY_JSON_INDENT : 0);
}

// normalize url for fingerprint
function normalizeUrlForFingerprint(u) {
  if (!u) return '';
  if (!ERROR_DEDUP_STRIP_QUERY) return String(u);
  try {
    const url = new URL(String(u));
    return `${url.origin}${url.pathname}`;
  } catch {
    const s = String(u);
    const i = s.indexOf('?');
    return i >= 0 ? s.slice(0, i) : s;
  }
}

// stable stringify for dedup
function sortDeep(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sortDeep);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
  return out;
}
function stableStringify(obj) {
  try { return JSON.stringify(sortDeep(obj)); }
  catch { return String(obj); }
}
function hashSha256(s) {
  try { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
  catch { return String(s).slice(0, 128); }
}

// dequote .env path values
function dequote(s) {
  const t = String(s).trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) return t.slice(1, -1);
  return t;
}

// local-time stamp for rolled filename
function localStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${HH}${MM}${SS}`;
}

// compute effective error log file path
const _BASE_FILE_RESOLVED = resolve(dequote(ERROR_FILE_RAW));
const _BASE_PARSED = parse(_BASE_FILE_RESOLVED);
const _STAMP = localStamp();
const _PID_SUFFIX = ERROR_FILE_ROLL_ADD_PID ? `-p${process.pid}` : '';
const _ROLLED_BASENAME = `${_BASE_PARSED.name}-${_STAMP}${_PID_SUFFIX}${_BASE_PARSED.ext}`;
const ERROR_FILE = ERROR_FILE_ROLL
  ? format({ dir: _BASE_PARSED.dir, base: _ROLLED_BASENAME })
  : _BASE_FILE_RESOLVED;

// announce effective file path once
if (ERROR_TO_FILE) {
  console.log(nowIso(), 'INFO', 'Error log path', ERROR_FILE);
}

// ----- JSON formatter (machine-friendly) -----
function formatErrorJSON(err, extra = {}) {
  const obj = {
    name: err?.name,
    message: err?.message,
    stack: typeof err?.stack === 'string' ? clip(err.stack, STACK_LEN) : undefined,
    code: err?.code,
    detail: err?.detail,
    hint: err?.hint,
    position: err?.position,
    schema: err?.schema,
    table: err?.table,
    column: err?.column,
    constraint: err?.constraint,
    httpStatus: err?.status ?? err?.httpStatus,
    url: err?.url,
    responseBody: err?.responseBody ? clip(String(err.responseBody), RESP_LEN) : undefined,
    sqlFrag: extra?.sqlFrag ? clip(String(extra.sqlFrag), SQL_LEN) : undefined,
    ...extra
  };

  // normalize/clip rowSnapshot in JSON mode
  if (obj.rowSnapshot !== undefined) {
    const rs = obj.rowSnapshot;
    const s = typeof rs === 'string' ? rs : JSON.stringify(rs);
    obj.rowSnapshot = clip(s, SNAP_LEN);
  }

  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === '') delete obj[k];
  }
  // remove control flags
  delete obj.inlineSep;
  delete obj.inlineSepWidth;
  delete obj.inlineSepAfter;

  return JSON.stringify(obj);
}

// ----- Human formatter (human-friendly) -----
function formatErrorHuman(err, extra = {}) {
  const fields = [];
  const push = (k, v) => {
    if (v === undefined || v === null || v === '') return;
    fields.push([k, String(v)]);
  };

  push('message', err?.message);
  push('httpStatus', err?.status ?? err?.httpStatus);
  push('url', err?.url);
  push('code', err?.code);
  push('detail', err?.detail);
  push('hint', err?.hint);

  const schemaTable = [extra.schema ?? err?.schema, extra.table ?? err?.table].filter(Boolean).join('.');
  push('schema.table', schemaTable || undefined);
  push('column', err?.column);
  push('constraint', err?.constraint);
  push('sqlFrag', extra?.sqlFrag ? clip(String(extra.sqlFrag), SQL_LEN) : undefined);

  if (err?.responseBody) {
    const pretty = prettyMaybe(err.responseBody);
    push('responseBody', clip(pretty, RESP_LEN));
  }

  if (extra?.rowSnapshot !== undefined) {
    const pretty = prettyMaybe(extra.rowSnapshot);
    push('rowSnapshot', clip(pretyToString(pretty), SNAP_LEN));
  }

  const skip = new Set(['schema', 'table', 'sqlFrag', 'inlineSep', 'inlineSepWidth', 'inlineSepAfter', 'rowSnapshot']);
  for (const [k, v] of Object.entries(extra || {})) {
    if (skip.has(k)) continue;
    if (v === undefined || v === null || v === '') continue;
    fields.push([k, String(v)]);
  }

  const keyWidth = Math.max(10, ...fields.map(([k]) => k.length));
  const lines = fields.map(([k, v]) => `  ${k.padEnd(keyWidth)} : ${v}`);

  const stack = typeof err?.stack === 'string' ? clip(err.stack, STACK_LEN) : undefined;
  if (stack) {
    lines.push(`  ${'stack'.padEnd(keyWidth)} : ` + stack.split('\n')[0]);
    const rest = stack.split('\n').slice(1).map(s => '    ' + s);
    lines.push(...rest);
  }

  return lines.join('\n');
}

// ----- file sink helpers -----
let _errorPathReady = false;
async function _ensureErrorPath() {
  if (_errorPathReady) return;
  try {
    await mkdir(dirname(ERROR_FILE), { recursive: true });
    _errorPathReady = true;
  } catch (e) {
    console.error(nowIso(), 'ERROR', 'Failed to ensure log directory', String(e?.message || e));
    throw e;
  }
}

function _buildErrorRecord(msg, err, extra = {}) {
  const error = {
    name: err?.name,
    message: err?.message,
    stack: typeof err?.stack === 'string' ? clip(err.stack, STACK_LEN) : undefined,
    code: err?.code,
    detail: err?.detail,
    hint: err?.hint,
    position: err?.position,
    schema: err?.schema,
    table: err?.table,
    column: err?.column,
    constraint: err?.constraint,
    httpStatus: err?.status ?? err?.httpStatus,
    url: err?.url,
    responseBody: err?.responseBody ? clip(String(err.responseBody), RESP_LEN) : undefined
  };
  for (const k of Object.keys(error)) {
    if (error[k] === undefined || error[k] === null || error[k] === '') delete error[k];
  }

  const ex = { ...extra };
  delete ex.inlineSep;
  delete ex.inlineSepWidth;
  delete ex.inlineSepAfter;

  return {
    ts: nowIso(),
    level: 'ERROR',
    msg,
    error,
    extra: ex
  };
}

// in-memory dedup cache
const _dedupMap = new Map(); // fp -> lastTs

function _buildErrorFingerprint(msg, err, extra = {}) {
  const schema = extra?.schema ?? err?.schema;
  const table  = extra?.table  ?? err?.table;
  const pkPart = extra?.pkValues ? stableStringify(extra.pkValues) : '';
  const rowPart = !pkPart && extra?.rowSnapshot !== undefined ? stableStringify(extra.rowSnapshot) : '';
  const urlPart = normalizeUrlForFingerprint(err?.url ?? extra?.url ?? '');
  const parts = [
    msg || '',
    err?.message || '',
    err?.code || '',
    String(err?.status ?? err?.httpStatus ?? ''),
    urlPart,
    schema || '',
    table || '',
    extra?.op || '',
    extra?.jobId || '',
    pkPart,
    rowPart
  ];
  return hashSha256(parts.join('|'));
}

function _writeErrorLine(obj, fp) {
  if (!ERROR_TO_FILE) return;
  if (ERROR_DEDUP) {
    const last = _dedupMap.get(fp);
    if (last !== undefined) {
      if (ERROR_DEDUP_TTL_MS === 0) return;
      const now = Date.now();
      if (now - last < ERROR_DEDUP_TTL_MS) return;
    }
    _dedupMap.set(fp, Date.now());
  }
  const line = JSON.stringify(obj);
  _ensureErrorPath()
    .then(() => appendFile(ERROR_FILE, line + '\n').catch((e) => {
      console.error(nowIso(), 'ERROR', 'Failed to append error log', String(e?.message || e));
    }))
    .catch((e) => {
      console.error(nowIso(), 'ERROR', 'Failed to ensure log path', String(e?.message || e));
    });
}

// ----- Logger -----
export const log = {
  info: (...a) => console.log(nowIso(), 'INFO', ...a),
  warn: (...a) => console.warn(nowIso(), 'WARN', ...a),
  error: (...a) => console.error(nowIso(), 'ERROR', ...a),

  /**
   * INFO with pretty extras (success logs)
   * @param {string} msg
   * @param {object} extra - { responseBody?, requestBody?, rowSnapshot?, ... }
   */
  infoEx: (msg, extra = {}) => {
    if (LOG_FORMAT === 'json') {
      const obj = { ...extra };
      if (obj.responseBody !== undefined) obj.responseBody = clip(String(obj.responseBody), RESP_LEN);
      if (obj.requestBody  !== undefined) obj.requestBody  = clip(pretyToString(obj.requestBody), SNAP_LEN);
      if (obj.rowSnapshot  !== undefined) obj.rowSnapshot  = clip(pretyToString(obj.rowSnapshot), SNAP_LEN);
      console.log(nowIso(), 'INFO', msg, JSON.stringify(obj));
      return;
    }
    // human mode
    console.log(nowIso(), 'INFO', msg);
    const fields = [];
    const push = (k, v) => {
      if (v === undefined || v === null || v === '') return;
      fields.push([k, String(v)]);
    };

    for (const [k, v] of Object.entries(extra)) {
      if (k === 'responseBody') {
        const pretty = prettyMaybe(v);
        push('responseBody', clip(pretty, RESP_LEN));
      } else if (k === 'requestBody') {
        const pretty = prettyMaybe(v);
        push('requestBody', clip(pretyToString(pretty), SNAP_LEN));
      } else if (k === 'rowSnapshot') {
        const pretty = prettyMaybe(v);
        push('rowSnapshot', clip(pretyToString(pretty), SNAP_LEN));
      } else {
        push(k, v);
      }
    }

    if (fields.length) {
      const keyWidth = Math.max(10, ...fields.map(([k]) => k.length));
      const lines = fields.map(([k, v]) => `  ${k.padEnd(keyWidth)} : ${v}`);
      console.log(lines.join('\n'));
    }
  },

  /**
   * @param {string} msg
   * @param {Error}  err
   * @param {object} extra - { schema, table, sqlFrag, rowSnapshot, inlineSep?: true, inlineSepAfter?: true, inlineSepWidth?: number, ... }
   */
  errorEx: (msg, err, extra = {}) => {
    if (LOG_FORMAT === 'json') {
      const info = formatErrorJSON(err, extra);
      console.error(nowIso(), 'ERROR', msg, info);
      const fp = _buildErrorFingerprint(msg, err, extra);
      _writeErrorLine(_buildErrorRecord(msg, err, extra), fp);
      return;
    }
    // human mode with optional inline separator for row-level only
    const useInline = extra.inlineSep === true;
    const width = Number.isFinite(extra.inlineSepWidth) ? extra.inlineSepWidth : INLINE_SEP_WIDTH;
    const inline = useInline ? ' ' + INLINE_SEP_CHAR.repeat(width) : '';
    console.error(nowIso(), 'ERROR', `${msg}${inline}`);
    const human = formatErrorHuman(err, extra);
    if (human) console.error(human);
    if (extra.inlineSepAfter === true && useInline) {
      console.error(nowIso(), 'ERROR', INLINE_SEP_CHAR.repeat(width) + '--------log finish');
    }
    const fp = _buildErrorFingerprint(msg, err, extra);
    _writeErrorLine(_buildErrorRecord(msg, err, extra), fp);
  }
};

export default log;
