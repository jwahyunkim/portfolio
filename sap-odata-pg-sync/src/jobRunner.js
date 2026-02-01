// jobRunner.js
import { fetchAllOData } from './clients/odataClient.js';
import { mapRow } from './util/transform.js';
import { replaceAll, insertRowWise, upsertRowWise } from './db/loader.js';
import { baseConfig } from './util/config.js';
import { log } from './util/logging.js';
import { getLastSuccess, setLastSuccess } from './util/jobState.js';

import { getCsrf, postJson } from './clients/odataWriter.js';
import { readPending, markSent, markError } from './db/reader.js';

// ===== helpers: date/time/strings =====
const toDateDash = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s.length === 8 && /^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.includes('-') ? s : s;
};
const toDateOnly = (v) => {
  if (v === undefined || v === null || v === '') return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const yy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};
const toTime = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mi}:${ss}`;
};
const nullOrTrimLen = (val, max) => {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '') return null;
  return Number.isFinite(max) && s.length > max ? s.slice(0, max) : s;
};
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const clip = (s, n = 2000) => {
  const t = typeof s === 'string' ? s : JSON.stringify(s);
  return t.length > n ? t.slice(0, n) + '...[truncated]' : t;
};


// ===== visual log dividers =====
const bar = (pattern = '==', width = 120) =>
  pattern.repeat(Math.ceil(width / pattern.length)).slice(0, width);
const ts = () => {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};
const logStart = (id, ...parts) => {
  log.info(bar());
  log.info('JOB START', id, ...parts);
  log.info(`timestamp=${ts()}`);
};
const logEnd = (id, ...parts) => {
  log.info('JOB END', id, ...parts);
  log.info(bar());
};

// ===== success criteria utilities =====

// split simple JSON path like "a.b.c" or "a.b[0]" or "_item"
const getByPath = (root, path) => {
  if (!path || root == null) return undefined;
  const tokens = String(path).match(/[^.\[\]]+/g) || [];
  let cur = root;
  for (const t of tokens) {
    if (cur == null) return undefined;
    cur = cur[t];
  }
  return cur;
};

// ensure array (single object -> [obj], null/undefined -> [])
const getArrayByPath = (root, path) => {
  const v = getByPath(root, path);
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
};

const norm = (v) => (v == null ? '' : String(v).trim());
const matchByKeys = (a, b, keys = []) => {
  for (const k of keys) {
    if (norm(a?.[k]) !== norm(b?.[k])) return false;
  }
  return true;
};

/**
 * Check item-level echo match.
 * @param {object} resBody
 * @param {Array<object>} sentItems - items we just posted
 * @param {{path:string, keys:string[], requireAllItems?:boolean}} cfg
 * @returns {{ok:boolean, matchedObjects:object[], matchedCount:number, total:number, notFoundIndices:number[]}}
 */
const checkEchoItemMatch = (resBody, sentItems, cfg = {}) => {
  const path = cfg.path;
  const keys = Array.isArray(cfg.keys) ? cfg.keys : [];
  const requireAllItems = cfg.requireAllItems !== false; // default true
  if (!path || !keys.length) return { ok: true, matchedObjects: [], matchedCount: 0, total: sentItems.length, notFoundIndices: [] };

  const respArr = getArrayByPath(resBody, path);
  const matched = [];
  const notFoundIndices = [];

  sentItems.forEach((s, idx) => {
    const hit = respArr.find((r) => matchByKeys(s, r, keys));
    if (hit) matched.push(hit);
    else notFoundIndices.push(idx);
  });

  const ok = requireAllItems ? notFoundIndices.length === 0 : matched.length > 0;
  return { ok, matchedObjects: matched, matchedCount: matched.length, total: sentItems.length, notFoundIndices };
};

/**
 * Header-level echo check (optional, for backward compatibility).
 * @param {object} resBody
 * @param {string[]} echoKeys
 * @param {object} expectedEcho
 * @param {boolean} requireAll
 */
const checkHeaderEcho = (resBody, echoKeys = [], expectedEcho = {}, requireAll = true) => {
  if (!Array.isArray(echoKeys) || echoKeys.length === 0) return true; // disabled
  let pass = 0;
  for (const k of echoKeys) {
    const exp = expectedEcho[k];
    const got = resBody?.[k];
    if (norm(exp) === norm(got)) pass++;
  }
  return requireAll ? pass === echoKeys.length : pass > 0;
};

/**
 * SAP__Messages severity check (optional)
 */
const checkMessagesOk = (resBody, enabled = true, itemKey) => {
  if (!enabled) return true;

  const checkArr = (msgs) => {
    if (!Array.isArray(msgs)) return true;
    for (const m of msgs) {
      const sev = (m?.['@SAP__common.Severity'] || '').toLowerCase();
      const nsev = Number(m?.['@SAP__common.numericSeverity']);
      if (sev === 'error' || (Number.isFinite(nsev) && nsev >= 4)) return false;
    }
    return true;
  };

  // 1) header-level
  if (!checkArr(resBody?.SAP__Messages)) return false;

  // 2) item-level (예: _item[] 내부)
  if (itemKey && Array.isArray(resBody?.[itemKey])) {
    for (const it of resBody[itemKey]) {
      if (!checkArr(it?.SAP__Messages)) return false;
    }
  }

  return true;
};


// ===== pull filterWindow helpers =====

/**
 * 특정 타임존에서 ms 타임스탬프를 YYYY-MM-DD, HH:mm:ss로 포맷
 */
function formatInTz(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

/**
 * (date,time) 한 쌍에 대해 [from,to] 범위 필터 문자열 생성
 * - DATS/TIMS 비교
 * - inclusive=true 이면 경계 포함: ge/le
 * - 날짜 null 가드 포함: (date ne null)
 */
function buildRangeForPair(dateField, timeField, fromObj, toObj, inclusive = true) {
  const fromDate = fromObj.date;
  const fromTime = fromObj.time;
  const toDate = toObj.date;
  const toTime = toObj.time;

  const left =
    `((${dateField} gt ${fromDate}) or (${dateField} eq ${fromDate} and ${timeField} ${inclusive ? 'ge' : 'gt'} ${fromTime}))`;
  const right =
    `((${dateField} lt ${toDate}) or (${dateField} eq ${toDate} and ${timeField} ${inclusive ? 'le' : 'lt'} ${toTime}))`;
  return `(${dateField} ne null) and (${left} and ${right})`;
}

/**
 * filterWindow 설정으로 OData $filter 문자열 생성 (상대 lookback)
 * @returns {string|null}
 */
function buildFilterWindowClause(filterWindow) {
  if (!filterWindow) return null;

  const lookbackDays = Number(filterWindow?.lookback?.days || 0);
  const lookbackHours = Number(filterWindow?.lookback?.hours || 0);
  const inclusive = filterWindow?.inclusive !== false; // default true
  const timeZone = filterWindow?.timezone || undefined; // 없으면 프로세스 로컬
  const pairs = Array.isArray(filterWindow?.pairs) ? filterWindow.pairs : [];

  if (!pairs.length) return null;

  const nowMs = Date.now();
  const fromMs = nowMs - ((lookbackDays * 24 + lookbackHours) * 60 * 60 * 1000);

  const fromObj = formatInTz(fromMs, timeZone);
  const toObj = formatInTz(nowMs, timeZone);

  const parts = [];
  for (const p of pairs) {
    if (!p?.date || !p?.time) continue;
    parts.push(`(${buildRangeForPair(p.date, p.time, fromObj, toObj, inclusive)})`);
  }
  if (!parts.length) return null;

  const combine = (filterWindow.combine || 'or').toLowerCase();
  const glue = (combine === 'and') ? ' and ' : ' or ';
  return parts.join(glue);
}

/**
 * 주어진 from/to로 $filter 문자열 생성 (커서 기반)
 */
function buildFilterWindowClauseFromRange(filterWindow, fromMs, toMs) {
  const inclusive = filterWindow?.inclusive !== false; // default true
  const timeZone = filterWindow?.timezone || undefined;
  const pairs = Array.isArray(filterWindow?.pairs) ? filterWindow.pairs : [];
  if (!pairs.length) return null;

  const fromObj = formatInTz(fromMs, timeZone);
  const toObj = formatInTz(toMs, timeZone);

  const parts = [];
  for (const p of pairs) {
    if (!p?.date || !p?.time) continue;
    parts.push(`(${buildRangeForPair(p.date, p.time, fromObj, toObj, inclusive)})`);
  }
  if (!parts.length) return null;

  const combine = (filterWindow.combine || 'or').toLowerCase();
  const glue = (combine === 'and') ? ' and ' : ' or ';
  return parts.join(glue);
}

/**
 * URL에 $filter를 안전하게 부착
 * - 기존 $filter가 있으면 and로 결합
 * - 없다면 새로 추가
 */
function appendFilter(url, filterExpr) {
  if (!filterExpr) return url;
  const hasQuery = url.includes('?');
  const hasFilter = /\$filter=/i.test(url);
  if (hasFilter) {
    return url.replace(/(\$filter=)([^&]+)/i, (m, p1, p2) => {
      const decoded = decodeURIComponent(p2);
      const combined = `(${decoded}) and (${filterExpr})`;
      return `${p1}${encodeURIComponent(combined)}`;
    });
  }
  const sep = hasQuery ? '&' : '?';
  return `${url}${sep}$filter=${encodeURIComponent(filterExpr)}`;
}

// ===== main entry =====
export async function runJob(job) {
  if (job.mode === 'push') return runPushJob(job);
  return runPullJob(job);
}

// ===================== PULL =====================
async function runPullJob(job) {
  const pullMode = job.pull?.mode || 'bulk';
  const pageSize = job.pageSize || baseConfig.defaults.pageSize;
  const nullIfEmpty = job.nullIfEmpty ?? baseConfig.defaults.nullIfEmpty;
  const runStartMs = Date.now();

  // guard: sinceLastSuccess + bulk는 금지
  const fwMode = (job.filterWindow?.mode || 'relative').toLowerCase();
  if (fwMode === 'sincelastsuccess' && pullMode === 'bulk') {
    const e = new Error('sinceLastSuccess requires pull.mode=row (deleteMode=update or insert).');
    log.errorEx('Pull job misconfiguration', e, { jobId: job.id, pullMode });
    throw e;
  }

  // filterWindow 적용
  let odataUrl = job.odataUrl;
  let sinceUsed = false;
  let cursorFromMs = null;

  if (job.filterWindow) {
    if (fwMode === 'sincelastsuccess') {
      sinceUsed = true;
      const tz = job.filterWindow.timezone || undefined;

      // 커서 로드
      let fromMs = await getLastSuccess(job.id);
      if (!Number.isFinite(fromMs)) {
        const lbDays = Number(job.filterWindow?.initial?.lookback?.days || 0);
        const lbHours = Number(job.filterWindow?.initial?.lookback?.hours || 24);
        fromMs = runStartMs - ((lbDays * 24 + lbHours) * 60 * 60 * 1000);
        log.info('sinceLastSuccess initial lookback used', job.id, `hours=${lbDays * 24 + lbHours}`);
      }
      cursorFromMs = fromMs;
      const toMs = runStartMs;

      const expr = buildFilterWindowClauseFromRange(job.filterWindow, fromMs, toMs);
      if (expr) {
        odataUrl = appendFilter(odataUrl, expr);
        const fromFmt = formatInTz(fromMs, tz);
        const toFmt = formatInTz(toMs, tz);
        log.info('동적 필터 적용(sinceLastSuccess)', job.id, `from=${fromFmt.date} ${fromFmt.time}`, `to=${toFmt.date} ${toFmt.time}`);
      }
    } else {
      const filterExpr = buildFilterWindowClause(job.filterWindow);
      if (filterExpr) {
        odataUrl = appendFilter(odataUrl, filterExpr);
        log.info('동적 필터 적용', job.id, filterExpr);
      }
    }
  }

  logStart(job.id, `mode=${pullMode}`, `pageSize=${pageSize}`);

  const rows = await fetchAllOData({
    url: odataUrl,
    user: baseConfig.odataAuth.user,
    pass: baseConfig.odataAuth.pass,
    pageSize
  });

  const mapped = rows.map((r) => mapRow(r, job.mapping, { nullIfEmpty }));

  try {
    if (pullMode === 'bulk') {
      const batchSize = job.target?.batchSize || baseConfig.defaults.batchSize;
      await replaceAll(mapped, {
        schema: job.target.schema,
        table: job.target.table,
        batchSize,
        columns: job.mapping.columns
      });
      logEnd(job.id, `rows=${rows.length}`);
      return;
    }

    const deleteMode = job.pull?.deleteMode || 'delete';
    const rowCfg = job.pull?.row || {};
    const batchSize = rowCfg.batchSize ?? 1;
    const onError = rowCfg.onError || 'continue';
    const deleteFirst = (deleteMode === 'delete') ? (job.pull?.deleteFirst ?? true) : false;

    let res;
    if (deleteMode === 'update') {
      res = await upsertRowWise(mapped, {
        schema: job.target.schema,
        table: job.target.table,
        columns: job.mapping.columns,
        batchSize,
        onError
      });
    } else {
      res = await insertRowWise(mapped, {
        schema: job.target.schema,
        table: job.target.table,
        columns: job.mapping.columns,
        batchSize,
        onError,
        deleteFirst
      });
    }

    // 커서 갱신: sinceLastSuccess 모드이며 실패가 0일 때만
    if (sinceUsed && res && Number(res.fail) === 0) {
      try {
        await setLastSuccess(job.id, runStartMs);
        log.info('sinceLastSuccess cursor saved', job.id, new Date(runStartMs).toISOString());
      } catch (e) {
        log.warn('Failed to save sinceLastSuccess cursor', job.id, e?.message || String(e));
      }
    }

    log.info('Row mode complete', job.id, `rows=${rows.length}`, `row_ok=${res.ok}`, `row_fail=${res.fail}`);
    logEnd(job.id, `rows=${rows.length}`, `row_ok=${res.ok}`, `row_fail=${res.fail}`);
  } catch (e) {
    log.errorEx('Pull job failed', e, { jobId: job.id, table: job.target?.table });
    throw e;
  }
}

// ===================== PUSH =====================

// ---- policy helpers (push 공용) ----
const applyNullByPolicy = (v, policy) => {
  // "값이 없음"을 통일: null/undefined/빈문자열/공백문자열
  const isEmptyString = (typeof v === 'string' && v.trim() === '');
  const isEmpty = (v === undefined || v === null || isEmptyString);

  if (isEmpty) {
    if (policy === 'empty') return '';
    if (policy === 'null') return null;
    if (policy === 'zero') return 0;
    return v;
  }
  return v;
};

const applyNumber = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const applyDate = (v, rule) => {
  if (!rule || rule === 'pass') return v;
  if (v === '' || v === null || v === undefined) return v;

  if (rule === 'YYYYMMDD->YYYY-MM-DD') {
    if (v === 0) return '0000-00-00';
    const s = String(v).trim();
    if (s === '') return null;

    // YYYYMMDD
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-');

    // YYYY-MM-DD (이미 정상)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // 그 외(예: 07-30) → SAP 에러 방지
    return null;
  }

  if (rule === 'timestamptz->YYYY-MM-DD') {
    if (v === 0) return '0000-00-00';
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return toDateOnly(d);
  }

  return v;
};

const applyTime = (v, rule) => {
  if (!rule || rule === 'pass') return v;
  if (v === '' || v === null || v === undefined) return v;

  if (rule === 'HHmmss->HH:mm:ss') {
    if (v === 0) return '00:00:00';
    const s = String(v).trim();
    if (s === '') return null;

    // 이미 HH:mm:ss
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;

    // HHmmss
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;

    // 그 외 → SAP 에러 방지
    return null;
  }

  if (rule === 'timestamptz->HH:mm:ss') {
    if (v === 0) return '00:00:00';
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mi}:${ss}`;
  }

  return v;
};

const applyLength = (v, maxLenMap, dst) => {
  const max = Number.isFinite(maxLenMap[dst]) ? maxLenMap[dst] : null;
  if (max && typeof v === 'string' && v.length > max) return v.slice(0, max);
  return v;
};

// ---- 공통 push 본체 (rows만 다름: 단일 SQL / dual 조인 결과) ----
async function pushRows(job, rows, auth, csrf) {
  const mapping = job.mapping || {};
  const hasHeader = !!mapping.header;
  const hasItem = !!(mapping.item && mapping.item.fields);

  const fieldsMap = hasItem ? mapping.item.fields : (mapping.fields || {});
  const headerMap = mapping.header || {};
  const itemKey = (mapping.item && (mapping.item.key || mapping.itemKey)) || mapping.itemKey || '_item';

  // ===== config resolve helpers =====
  const pickDefined = (...vals) => {
    for (const v of vals) if (v !== undefined) return v;
    return undefined;
  };
  const isPlainObject = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const mergeObj = (...objs) => {
    const out = {};
    for (const o of objs) {
      if (!isPlainObject(o)) continue;
      Object.assign(out, o);
    }
    return out;
  };
  const uniqArr = (...lists) => {
    const set = new Set();
    for (const l of lists) {
      if (!Array.isArray(l)) continue;
      for (const x of l) {
        if (x == null || x === '') continue;
        set.add(String(x));
      }
    }
    return Array.from(set);
  };

  /**
   * 전용 > job > 공통
   * - 공통: mapping.nullPolicy / mapping.fieldNullPolicy / mapping.numberFields / mapping.dateRules / mapping.timeRules / mapping.length
   * - job: job.nullPolicy / job.fieldNullPolicy / job.numberFields / job.dateRules / job.timeRules / job.length
   * - 전용: mapping.headerNullPolicy / mapping.itemNullPolicy 등 (job에도 동일 키 허용)
   */
  const resolveSectionCfg = (section) => {
    const prefix = section === 'header' ? 'header' : 'item';

    // 전용(섹션) 키
    const secNullPolicy = pickDefined(mapping[`${prefix}NullPolicy`], job[`${prefix}NullPolicy`]);
    const secFieldNullPolicy = pickDefined(mapping[`${prefix}FieldNullPolicy`], job[`${prefix}FieldNullPolicy`]);
    const secNumberFields = pickDefined(mapping[`${prefix}NumberFields`], job[`${prefix}NumberFields`]);
    const secDateRules = pickDefined(mapping[`${prefix}DateRules`], job[`${prefix}DateRules`]);
    const secTimeRules = pickDefined(mapping[`${prefix}TimeRules`], job[`${prefix}TimeRules`]);
    const secLength = pickDefined(mapping[`${prefix}Length`], job[`${prefix}Length`]);

    // 공통(mapping)
    const commonNullPolicy = mapping.nullPolicy;
    const commonFieldNullPolicy = mapping.fieldNullPolicy;
    const commonNumberFields = mapping.numberFields;
    const commonDateRules = mapping.dateRules;
    const commonTimeRules = mapping.timeRules;
    const commonLength = mapping.length;

    // job
    const jobNullPolicy = job.nullPolicy;
    const jobFieldNullPolicy = job.fieldNullPolicy;
    const jobNumberFields = job.numberFields;
    const jobDateRules = job.dateRules;
    const jobTimeRules = job.timeRules;
    const jobLength = job.length;

    const nullPolicy = pickDefined(secNullPolicy, jobNullPolicy, commonNullPolicy, 'empty');

    // 객체는 merge: 공통 -> job -> 전용(섹션)
    const fieldNullPolicy = mergeObj(commonFieldNullPolicy, jobFieldNullPolicy, secFieldNullPolicy);
    const dateRules = mergeObj(commonDateRules, jobDateRules, secDateRules);
    const timeRules = mergeObj(commonTimeRules, jobTimeRules, secTimeRules);
    const length = mergeObj(commonLength, jobLength, secLength);

    // 배열은 union: 공통 + job + 전용(섹션)
    const numberFields = uniqArr(commonNumberFields, jobNumberFields, secNumberFields);

    return { nullPolicy, fieldNullPolicy, dateRules, timeRules, length, numberFields };
  };

  const headerCfg = resolveSectionCfg('header');
  const itemCfg = resolveSectionCfg('item');

  // dual 모드에서 header/tail 컬럼이 섞이지 않게 소스 분리
  // - header: head 테이블 값만
  // - item  : tail 테이블 값만
  const pickSrcRow = (row, section) => {
    if (!row) return row;
    if (section === 'header') return row.__hdr || row;
    if (section === 'item') return row.__itm || row;
    return row;
  };

  // headerLength 기존 키도 유지(전용 길이로 취급)
  const headerLen = mergeObj(headerCfg.length, mapping.headerLength);
  const itemLen = itemCfg.length || {};

  const failMode = job.source.failMode || 'stop';
  const postSize = Math.max(1, job.source.batchSize || 1);

  const mapFields = (srcRow) => {
    const o = {};
    const src = pickSrcRow(srcRow, 'item');
    for (const [dst, srcCol] of Object.entries(fieldsMap)) {
      let v = src[srcCol];

      const effNullPolicy = itemCfg.fieldNullPolicy?.[dst] ?? itemCfg.nullPolicy;

      // 1) NULL 정책
      v = applyNullByPolicy(v, effNullPolicy);

      // 2) 숫자 필드 (숫자 필드는 '' 금지)
      const isNumberField = Array.isArray(itemCfg.numberFields) && itemCfg.numberFields.includes(dst);
      if (isNumberField) {
        if (v === '') v = null;
        const isEmptyAfterPolicy = (v === '' || v === null || v === undefined);
        if (!isEmptyAfterPolicy) {
          v = applyNumber(v);
        }
      }

      // 3) 날짜/시간/길이
      if (itemCfg.dateRules && itemCfg.dateRules[dst]) v = applyDate(v, itemCfg.dateRules[dst]);
      if (itemCfg.timeRules && itemCfg.timeRules[dst]) v = applyTime(v, itemCfg.timeRules[dst]);
      v = applyLength(v, itemLen, dst);

      o[dst] = v;
    }
    return o;
  };

  const mapHeaderFields = (srcRow) => {
    const o = {};
    const src = pickSrcRow(srcRow, 'header');
    for (const [dst, srcCol] of Object.entries(headerMap)) {
      let v = src[srcCol];

      const effNullPolicy = headerCfg.fieldNullPolicy?.[dst] ?? headerCfg.nullPolicy;

      // 1) NULL 정책
      v = applyNullByPolicy(v, effNullPolicy);

      // 2) 숫자 필드 (숫자 필드는 '' 금지)
      const isNumberField = Array.isArray(headerCfg.numberFields) && headerCfg.numberFields.includes(dst);
      if (isNumberField) {
        if (v === '') v = null;
        const isEmptyAfterPolicy = (v === '' || v === null || v === undefined);
        if (!isEmptyAfterPolicy) {
          v = applyNumber(v);
        }
      }

      // 3) 날짜/시간/길이
      if (headerCfg.dateRules && headerCfg.dateRules[dst]) v = applyDate(v, headerCfg.dateRules[dst]);
      if (headerCfg.timeRules && headerCfg.timeRules[dst]) v = applyTime(v, headerCfg.timeRules[dst]);
      v = applyLength(v, headerLen, dst);

      o[dst] = v;
    }
    return o;
  };

  let ok = 0;
  let fail = 0;

  const sapCfg = job.sapSuccess || { checkMessages: true, echoKeys: [], requireAll: true, echoItemMatch: null };

  // ===== SENT 즉시 로그 + 중복키 SENT 처리 옵션 =====
  const pkCols = job.source?.pk;
  const dupAsSentCfg = job.source?.duplicateAsSent || {};
  const dupAsSentEnabled = dupAsSentCfg.enabled === true;
  const dupCodes = Array.isArray(dupAsSentCfg.codes) && dupAsSentCfg.codes.length
    ? dupAsSentCfg.codes
    : ['DBSQL_DUPLICATE_KEY_ERROR'];

  const buildPkSnapshot = (row) => {
    // dual({__hdr,__itm})에서도 item PK가 우선
    const src = row?.__itm || row;
    if (Array.isArray(pkCols) && pkCols.length) {
      const o = {};
      for (const c of pkCols) o[c] = src?.[c];
      return o;
    }
    if (typeof pkCols === 'string' && pkCols) return { [pkCols]: src?.[pkCols] };
    return {};
  };

  const logSentMarked = (sentRows, extra = {}) => {
    try {
      const list = Array.isArray(sentRows) ? sentRows.map(buildPkSnapshot) : [];
      log.infoEx('SENT marked', { jobId: job.id, pk: pkCols, rows: clip(list), ...extra });
    } catch (e) {
      log.warn('Failed to log SENT marked', job.id, e?.message || String(e));
    }
  };

  const parseBodyIfPossible = (b) => {
    if (b == null) return null;
    if (typeof b === 'object') return b;
    if (typeof b === 'string') {
      try { return JSON.parse(b); } catch { return null; }
    }
    return null;
  };

  const isDuplicateKeyError = (err) => {
    const bodyObj = parseBodyIfPossible(err?.responseBody);
    const code = bodyObj?.error?.code;
    if (code && dupCodes.includes(code)) return true;

    // fallback: 문자열 포함
    const hay = [
      err?.message,
      typeof err?.responseBody === 'string' ? err.responseBody : null,
      bodyObj ? JSON.stringify(bodyObj) : null
    ].filter(Boolean).join(' ');
    for (const c of dupCodes) {
      if (hay.includes(c)) return true;
    }
    return false;
  };

  const allowDupAsSentForCount = (n) => Number(n) === 1; // "1건 전송"일 때만

  // ===== grouped(header+items) push =====
  if (hasHeader && hasItem) {
    const headerSrcCols = Object.values(headerMap);
    const groups = new Map();
    for (const r of rows) {
      const hr = pickSrcRow(r, 'header');
      const keyParts = headerSrcCols.map((c) => (hr[c] == null ? '' : String(hr[c])));
      const key = keyParts.join('\u241F');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    // 중복 에러 시 분할 재시도(정합성 우선): batch에서는 절대 통째로 SENT 처리 금지
    const postPartWithSplit = async (key, headerObj, part) => {
      const items = part.map(mapFields);
      const body = { ...headerObj, [itemKey]: items };

      try {
        const resBody = await postJson(job.odataUrl, body, auth, csrf);

        // Step1: SAP__Messages check
        let okPost = checkMessagesOk(resBody, sapCfg.checkMessages !== false, itemKey);

        // Step2: optional header echo (if echoKeys provided)
        if (okPost && Array.isArray(sapCfg.echoKeys) && sapCfg.echoKeys.length > 0) {
          const expectedEcho = {};
          for (const k of sapCfg.echoKeys) expectedEcho[k] = headerObj[k];
          okPost = okPost && checkHeaderEcho(resBody, sapCfg.echoKeys, expectedEcho, sapCfg.requireAll !== false);
        }

        // Step3: item-level echo (if configured)
        let itemLog = null;
        if (okPost && sapCfg.echoItemMatch && sapCfg.echoItemMatch.path && Array.isArray(sapCfg.echoItemMatch.keys)) {
          const im = checkEchoItemMatch(resBody, items, {
            path: sapCfg.echoItemMatch.path,
            keys: sapCfg.echoItemMatch.keys,
            requireAllItems: sapCfg.echoItemMatch.requireAllItems !== false
          });
          okPost = okPost && im.ok;
          itemLog = {
            echoItemMatch: {
              path: sapCfg.echoItemMatch.path,
              keys: sapCfg.echoItemMatch.keys,
              matched: im.matchedCount,
              total: im.total
            },
            responseBody: im.matchedObjects
          };
          if (!im.ok) {
            const reason = `SAP_ECHO_ITEM_FAIL path=${sapCfg.echoItemMatch.path} keys=${JSON.stringify(sapCfg.echoItemMatch.keys)} notFoundIndices=${JSON.stringify(im.notFoundIndices)}`;
            await markError(part, reason, { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
            fail += part.length;
            log.errorEx('POST verification failed (item echo)', new Error(reason), {
              jobId: job.id,
              group: key,
              items: items.length,
              path: sapCfg.echoItemMatch.path,
              keys: JSON.stringify(sapCfg.echoItemMatch.keys),
              notFoundIndices: JSON.stringify(im.notFoundIndices)
            });
            if (failMode !== 'continue') throw new Error(reason);
            return;
          }
        }

        if (okPost) {
          await markSent(part, { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
          logSentMarked(part, { group: key, count: part.length, reason: 'success' });
          ok += part.length;

          if (itemLog) {
            log.infoEx('POST success', { jobId: job.id, group: key, items: items.length, verified: true, ...itemLog });
          } else if (Array.isArray(sapCfg.echoKeys) && sapCfg.echoKeys.length > 0) {
            const subset = {};
            for (const k of sapCfg.echoKeys) {
              if (Object.prototype.hasOwnProperty.call(resBody || {}, k)) subset[k] = resBody[k];
            }
            log.infoEx('POST success', { jobId: job.id, group: key, items: items.length, verified: true, echoKeys: sapCfg.echoKeys, responseBody: subset });
          } else {
            log.info('POST success', job.id, `group=${key}`, `items=${items.length}`, 'verified=true');
          }
        } else {
          const reason = 'SAP_MESSAGE_FAIL';
          await markError(part, reason, { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
          fail += part.length;
          log.warn('POST verification failed (messages)', job.id, `group=${key}`, `items=${items.length}`);
          if (failMode !== 'continue') throw new Error(reason);
        }
      } catch (e) {
        // 1) 배치에서 중복이면 분할 재시도
        if (part.length > 1 && isDuplicateKeyError(e)) {
          const mid = Math.floor(part.length / 2);
          const left = part.slice(0, mid);
          const right = part.slice(mid);
          await postPartWithSplit(key, headerObj, left);
          await postPartWithSplit(key, headerObj, right);
          return;
        }

        // 2) 단건 중복만 duplicateAsSent 적용
        if (dupAsSentEnabled && allowDupAsSentForCount(part.length) && isDuplicateKeyError(e)) {
          await markSent(part, { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
          logSentMarked(part, { group: key, count: part.length, reason: 'duplicateAsSent' });
          ok += part.length;
          log.warn('POST duplicate treated as sent', job.id, `group=${key}`, `items=${items.length}`);
          return;
        }

        await markError(part, e.message + (e.responseBody ? ` body=${clip(e.responseBody)}` : ''), {
          schema: job.source.schema,
          table: job.source.table,
          pk: job.source.pk
        });
        fail += part.length;
        const bodyLog = e.responseBody ? clip(e.responseBody) : '[no body]';
        log.errorEx('POST request failed', e, {
          jobId: job.id,
          group: key,
          items: items.length,
          status: e.status ?? 'n/a',
          url: job.odataUrl,
          responseBody: bodyLog
        });
        if (failMode !== 'continue') throw e;
      }
    };

    for (const [key, list] of groups.entries()) {
      const first = list[0];
      const headerObj = mapHeaderFields(first);

      for (const part of chunk(list, postSize)) {
        await postPartWithSplit(key, headerObj, part);
      }
    }
  } else {
    // ===== single(body-only) push =====

    const postSingleWithSplit = async (src) => {
      const body = mapFields(src);

      try {
        const resBody = await postJson(job.odataUrl, body, auth, csrf);

        // Step1: SAP__Messages
        let okPost = checkMessagesOk(resBody, sapCfg.checkMessages !== false, itemKey);

        // Step2: optional header echo (if echoKeys provided)
        if (okPost && Array.isArray(sapCfg.echoKeys) && sapCfg.echoKeys.length > 0) {
          const expectedEcho = {};
          for (const k of (sapCfg.echoKeys || [])) expectedEcho[k] = body[k];
          okPost = okPost && checkHeaderEcho(resBody, sapCfg.echoKeys, expectedEcho, sapCfg.requireAll !== false);
        }

        // Step3: item echo (if configured)
        let itemLog = null;
        if (okPost && sapCfg.echoItemMatch && sapCfg.echoItemMatch.path && Array.isArray(sapCfg.echoItemMatch.keys)) {
          const im = checkEchoItemMatch(resBody, [body], {
            path: sapCfg.echoItemMatch.path,
            keys: sapCfg.echoItemMatch.keys,
            requireAllItems: sapCfg.echoItemMatch.requireAllItems !== false
          });
          okPost = okPost && im.ok;
          itemLog = {
            echoItemMatch: {
              path: sapCfg.echoItemMatch.path,
              keys: sapCfg.echoItemMatch.keys,
              matched: im.matchedCount,
              total: im.total
            },
            responseBody: im.matchedObjects
          };
          if (!im.ok) {
            const reason = `SAP_ECHO_ITEM_FAIL path=${sapCfg.echoItemMatch.path} keys=${JSON.stringify(sapCfg.echoItemMatch.keys)} notFoundIndices=${JSON.stringify(im.notFoundIndices)}`;
            await markError([src], reason, { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
            fail += 1;
            log.errorEx('POST verification failed (item echo)', new Error(reason), {
              jobId: job.id,
              path: sapCfg.echoItemMatch.path,
              keys: JSON.stringify(sapCfg.echoItemMatch.keys),
              notFoundIndices: JSON.stringify(im.notFoundIndices)
            });
            if (failMode !== 'continue') throw new Error(reason);
            return;
          }
        }

        if (okPost) {
          await markSent([src], { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
          logSentMarked([src], { count: 1, reason: 'success' });
          ok += 1;

          if (itemLog) {
            log.infoEx('POST success', { jobId: job.id, verified: true, ...itemLog });
          } else if (Array.isArray(sapCfg.echoKeys) && sapCfg.echoKeys.length > 0) {
            const subset = {};
            for (const k of sapCfg.echoKeys) {
              if (Object.prototype.hasOwnProperty.call(resBody || {}, k)) subset[k] = resBody[k];
            }
            log.infoEx('POST success', { jobId: job.id, verified: true, echoKeys: sapCfg.echoKeys, responseBody: subset });
          } else {
            log.info('POST success', job.id, 'verified=true');
          }
        } else {
          const reason = 'SAP_MESSAGE_FAIL';
          await markError([src], reason, { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
          fail += 1;
          log.warn('POST verification failed (messages)', job.id);
          if (failMode !== 'continue') throw new Error(reason);
        }
      } catch (e) {
        // 단건 중복만 duplicateAsSent 적용
        if (dupAsSentEnabled && allowDupAsSentForCount(1) && isDuplicateKeyError(e)) {
          await markSent([src], { schema: job.source.schema, table: job.source.table, pk: job.source.pk });
          logSentMarked([src], { count: 1, reason: 'duplicateAsSent' });
          ok += 1;
          log.warn('POST duplicate treated as sent', job.id);
          return;
        }

        await markError([src], e.message + (e.responseBody ? ` body=${clip(e.responseBody)}` : ''), {
          schema: job.source.schema,
          table: job.source.table,
          pk: job.source.pk
        });
        fail += 1;
        const bodyLog = e.responseBody ? clip(e.responseBody) : '[no body]';
        log.errorEx('POST request failed', e, {
          jobId: job.id,
          status: e.status ?? 'n/a',
          url: job.odataUrl,
          responseBody: bodyLog
        });
        if (failMode !== 'continue') throw e;
      }
    };

    for (const part of chunk(rows, postSize)) {
      // 배치 단위로 처리
      // - single 모드에서 "진짜 batch POST"는 SAP API가 지원하는지 확인이 필요하므로 범위 밖

      // 1) 기존: 순차
      if (concurrency <= 1) {
        for (const src of part) {
          await postSingleWithSplit(src);
        }
        continue;
      }

      // 2) 동시 전송: source.concurrency 만큼 워커 실행
      let nextIdx = 0;
      let fatal = null;
      let stop = false;

      const worker = async () => {
        while (!stop) {
          const i = nextIdx++;
          if (i >= part.length) break;
          const src = part[i];
          try {
            await postSingleWithSplit(src);
          } catch (e) {
            // failMode !== 'continue'에서만 throw가 올라온다
            fatal = e;
            stop = true; // 신규 작업 시작 중단
            break;
          }
        }
      };

      const workers = [];
      const n = Math.min(concurrency, part.length);
      for (let i = 0; i < n; i++) workers.push(worker());
      await Promise.all(workers);

      if (fatal) throw fatal;
    }
  }

  return { ok, fail };
}


// ===================== PUSH (entry) =====================
async function runPushJob(job) {
  const auth = {
    user: baseConfig.odataAuth.user,
    pass: baseConfig.odataAuth.pass
  };

  logStart(job.id, `mode=push`, `sourceType=${job.source?.type || 'single'}`);

  let csrf = null;
  try {
    csrf = await getCsrf(job.odataUrl, auth);
  } catch (e) {
    log.errorEx('Failed to get CSRF token', e, { jobId: job.id, url: job.odataUrl });
    throw e;
  }

  const sourceType = job.source?.type || 'single';

  // ===== SINGLE: sql 하나로 pending 읽고 그대로 push =====
  if (sourceType !== 'dual') {
    const sql = job.source.sql;
    if (!sql) {
      const e = new Error('Missing source.sql for push job');
      log.errorEx('Push job misconfiguration', e, { jobId: job.id });
      throw e;
    }

    const rows = await readPending(sql);

    if (!rows.length) {
      log.info('No pending rows', job.id);
      logEnd(job.id, 'rows=0');
      return { ok: 0, fail: 0 };
    }

    const { ok, fail } = await pushRows(job, rows, auth, csrf);
    log.info('Push complete', job.id, `ok=${ok}`, `fail=${fail}`);
    logEnd(job.id, `ok=${ok}`, `fail=${fail}`);
    return { ok, fail };
  }

  // ===== DUAL: headerSql + itemSql 따로 읽고 조인해서 push =====
  const headerSql = job.source.headerSql;
  const itemSql = job.source.itemSql;
  const join = job.source.join;

  if (!headerSql || !itemSql || !join?.headerKey?.length || !join?.itemKey?.length) {
    const e = new Error('Missing source.headerSql/source.itemSql/source.join.* for dual push job');
    log.errorEx('Push job misconfiguration', e, { jobId: job.id });
    throw e;
  }

  // 1) item 먼저 pending만 읽는다 (속도/물량 핵심)
  const items = await readPending(itemSql);

  if (!items.length) {
    log.info('No pending items', job.id);
    logEnd(job.id, 'items=0');
    return { ok: 0, fail: 0 };
  }

  // 2) item에서 필요한 headerKey 조합만 뽑아서 header를 최소로 읽는다
  //    - headerSql이 "SELECT * FROM schema.table" 형태면 WHERE IN(튜플)로 제한
  //    - 그 외 복잡 SQL이면 안전하게 전체를 읽되, 메모리에서 필터링(느리지만 안전)
  const headerKey = join.headerKey;
  const itemKey = join.itemKey;

  // item key tuple 만들기
  const tupleKey = (r, cols) => cols.map((c) => (r[c] == null ? '' : String(r[c]))).join('\u241F');
  const needKeys = new Set(items.map((it) => tupleKey(it, itemKey)));

  const tryBuildHeaderWhereIn = () => {
    // "SELECT * FROM schema.table" 또는 "select * from schema.table"만 지원 (범용, 다른 job 영향 최소)
    const m = String(headerSql).trim().match(/^select\s+\*\s+from\s+([a-zA-Z0-9_"]+)\.([a-zA-Z0-9_"]+)\s*;?\s*$/i);
    if (!m) return null;
    const schema = m[1].replace(/"/g, '');
    const table = m[2].replace(/"/g, '');

    // Postgres row constructor: (c1,c2,c3) IN ((v1,v2,v3),(...))
    // 파라미터로 구성
    const cols = headerKey.map((c) => `"${c}"`).join(',');
    const tuples = [];
    const params = [];
    let p = 1;

    for (const it of items) {
      const vals = headerKey.map((c, idx) => it[itemKey[idx]]);
      tuples.push(`(${vals.map(() => `$${p++}`).join(',')})`);
      params.push(...vals);
    }

    // 너무 길어지는 것 방지: 5000 튜플 넘어가면 전체 읽기 fallback
    if (tuples.length > 5000) return null;

    const sql =
      `SELECT * FROM "${schema}"."${table}" WHERE (${cols}) IN (${tuples.join(',')});`;

    return { sql, params };
  };

  let headers = [];
  const hw = tryBuildHeaderWhereIn();

  if (hw) {
    // reader.readPending은 파라미터 미지원이라 여기서는 직접 pg로 실행하지 않고,
    // 기존 구조 유지 위해 "전체 읽기 + 필터" fallback을 사용
    // (파라미터 지원은 다른 파일 변경이 필요 -> 범위 밖)
    log.warn('headerSql WHERE IN optimization skipped (readPending has no params)', { jobId: job.id });
  }

  // 3) 안전 경로: header 전체 읽고, 필요한 key만 메모리에서 필터
  //    - 이미 문제 원인이 "header/tail 컬럼 덮어쓰기"였으므로 안전하게 분리/조인만 수행
  const allHeaders = await readPending(headerSql);

  // header map 만들기
  const headerMap = new Map();
  for (const h of allHeaders) {
    const k = tupleKey(h, headerKey);
    if (needKeys.has(k)) headerMap.set(k, h);
  }

  // 4) item에 header 붙이기 (중요: 섞이지 않게 __hdr/__itm로 분리)
  const joined = [];
  let missingHeader = 0;

  for (const it of items) {
    const k = tupleKey(it, itemKey);
    const hdr = headerMap.get(k);
    if (!hdr) {
      missingHeader++;
      continue;
    }
    // 여기서 컬럼명 동일해도 절대 덮어쓰기 금지
    joined.push({ __hdr: hdr, __itm: it });
  }

  if (!joined.length) {
    log.warn('All pending items missing headers', { jobId: job.id, items: items.length, missingHeader });
    logEnd(job.id, `items=${items.length}`, `joined=0`);
    return { ok: 0, fail: items.length };
  }

  if (missingHeader > 0) {
    log.warn('Some pending items missing headers', { jobId: job.id, items: items.length, missingHeader, joined: joined.length });
  }

  // 5) push
  const { ok, fail } = await pushRows(job, joined, auth, csrf);

  log.info('Dual push complete', job.id, `ok=${ok}`, `fail=${fail}`, `items=${items.length}`, `joined=${joined.length}`, `missingHeader=${missingHeader}`);
  logEnd(job.id, `ok=${ok}`, `fail=${fail}`);
  return { ok, fail };
}

// ===================== exports for legacy runner =====================
export async function runPushJobSingle(job) {
  return runPushJob(job);
}

export async function runPushJobDual(job) {
  return runPushJob(job);
}
