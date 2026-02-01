// epcardPrint.ts — FAST PATH (final)
// - 프린터 조회 캐시(TTL)
// - 정적 프레임 + 섹션만 교체
// - PDF 백엔드 keep-alive ping
// - 전송 즉시 성공 처리 (스풀 검증 없음)
// C:\Changshin\test\electron-app_final\src\main\epcardPrint.ts

import { BrowserWindow, ipcMain, webContents } from "electron";
import fs from "fs";
import path from "path";

/* ===================== 유틸/타입 ===================== */
type PageSizeMM = { widthMM: number; heightMM: number };
type PrintArgs = { deviceName?: string; pageSize?: PageSizeMM; url?: string; preview?: boolean };

const mmToMicrons = (mm: number) => Math.round(mm * 1000);

const CHANNEL_JOB = "passcard:job-result";
const CHANNEL_DONE = "passcard:batch-done";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const HOLD = new Set<Electron.BrowserWindow>();
const esc = (s: any) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]!)
  );

type PrintOptions = any;

/* ===================== 컨피그 ===================== */
type VerifyMode = "usb" | "spool" | "none";

type PasscardCfg = {
  deviceName?: string;
  preview?: boolean;
  previewCountAsPrint?: boolean;
  widthMM: number;
  heightMM: number;
  previewZoom?: number;

  padLeftCM?: number;
  padRightCM?: number;
  rightInsetCM?: number;
  lineWCm?: number;
  feedCompMM?: number;
  qrMargin?: number;
  qrScale?: number;
  qrEcLevel?: "L" | "M" | "Q" | "H";

  topPadDeltaCM?: number;
  topShiftCM?: number;

  verifyMode?: VerifyMode;
  preflightStrict?: boolean;

  apiBase?: string;

  anyOnDevice?: boolean;
  presentTooLongOkMs?: number;

  // 성능 튜닝
  labelsPerJob?: number;
  jobGapMs?: number;
  printerCacheTtlMs?: number;
};

const DEFAULT_CFG: PasscardCfg = {
  deviceName: undefined,
  preview: false,
  previewCountAsPrint: true,
  widthMM: 79,
  heightMM: 54,
  previewZoom: 1.0,
  padLeftCM: 0.2,
  padRightCM: 0.2,
  rightInsetCM: 0.15,
  lineWCm: 0.03,
  feedCompMM: 0,
  qrMargin: 2,
  qrScale: 10,
  qrEcLevel: "M",
  topPadDeltaCM: 0,
  topShiftCM: 0,
  verifyMode: "none",
  preflightStrict: false,
  anyOnDevice: false,
  presentTooLongOkMs: 0,
  labelsPerJob: 1,
  jobGapMs: 6,
  printerCacheTtlMs: 10 * 60 * 1000,
};

const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
function resolveCfgCandidates() {
  const cwd = process.cwd();
  const resPub = process.resourcesPath ? path.join(process.resourcesPath, "public") : "";
  const herePub = path.resolve(__dirname, "../../public");
  return uniq([
    path.resolve(cwd, "Config.xml"),
    path.resolve(cwd, "SETTING.xml"),
    path.resolve(cwd, "setting.xml"),
    path.resolve(cwd, "epcard-print.config.xml"),
    resPub && path.join(resPub, "Config.xml"),
    path.join(herePub, "Config.xml"),
  ]);
}

/* ====== 인쇄 전용 창 재사용 ====== */
let PRINT_WIN: Electron.BrowserWindow | null = null;
async function getPrintWin(): Promise<Electron.BrowserWindow> {
  if (PRINT_WIN && !PRINT_WIN.isDestroyed()) return PRINT_WIN;
  PRINT_WIN = new BrowserWindow({
    width: 520,
    height: 420,
    show: false,
    alwaysOnTop: false,
    focusable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      backgroundThrottling: false,
      webgl: false,
      images: true,
      javascript: true,
      spellcheck: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  try {
    PRINT_WIN.webContents.setVisualZoomLevelLimits(1, 1);
  } catch {}
  HOLD.add(PRINT_WIN);
  PRINT_WIN.on("closed", () => {
    HOLD.delete(PRINT_WIN!);
    PRINT_WIN = null;
  });
  await PRINT_WIN.loadURL("about:blank");
  return PRINT_WIN;
}

let CURRENT_CFG: PasscardCfg = { ...DEFAULT_CFG };
let CONFIG_SRC: string | null = null;

/* ===================== 로그 브릿지 ===================== */
function relayPasscardLog(tag: string, payload: any, level: "info" | "warn" | "error" = "info") {
  const msg = { tag, payload, level, ts: new Date().toISOString() };
  try {
    (console as any)[level]?.(`[PASSCARD][MAIN][${tag}]`, payload);
  } catch {}
  for (const wc of webContents.getAllWebContents()) {
    try {
      queueMicrotask(() => {
        try {
          wc.send("passcard:log", msg);
        } catch {}
      });
    } catch {}
  }
}

/* ===================== API_BASE (요청 무시 가능) ===================== */
const _fetch: any = (globalThis as any).fetch;
async function postJson(url: string, body: any) {
  if (!_fetch) throw new Error("fetch not available");
  const res = await _fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let t = "";
    try {
      t = await res.text();
    } catch {}
    throw new Error(`${url} ${res.status} ${t}`);
  }
  try {
    return await res.json();
  } catch {
    return {};
  }
}
let API_BASE = "http://127.0.0.1:4000/api/mssql";

/* ===================== 설정 파서 ===================== */
function parseBoolLike(v: string | undefined, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "y" || s === "yes";
}
function pickTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<\\s*${tag}\\s*>\\s*([^<]+)\\s*<\\s*/\\s*${tag}\\s*>`, "i"));
  return m ? m[1].trim() : undefined;
}

function parseSettingXml(xml: string): PasscardCfg | null {
  const device = pickTag(xml, "DEVICE_NAME");
  const preview = pickTag(xml, "PREVIEW");
  const previewCnt = pickTag(xml, "PREVIEW_COUNT_AS_PRINT");
  const w = Number(pickTag(xml, "WIDTH_MM"));
  const h = Number(pickTag(xml, "HEIGHT_MM"));
  const zoomRaw = pickTag(xml, "PREVIEW_ZOOM") ?? pickTag(xml, "PREVIEW_SCALE_PCT");

  const padLeft = Number(pickTag(xml, "PAD_LEFT_CM"));
  const padRight = Number(pickTag(xml, "PAD_RIGHT_CM"));
  const rightInset = Number(pickTag(xml, "RIGHT_INSET_CM"));
  const lineWcm = Number(pickTag(xml, "LINE_W_CM"));
  const feedComp = Number(pickTag(xml, "FEED_COMP_MM"));
  const qrMargin = Number(pickTag(xml, "QR_MARGIN"));
  const qrScale = Number(pickTag(xml, "QR_SCALE"));
  const qrEc = (pickTag(xml, "QR_EC_LEVEL") || "").toUpperCase();

  const topPadDelta = Number(pickTag(xml, "TOP_PAD_DELTA_CM") ?? pickTag(xml, "TOP_PAD_CM_DELTA"));
  const topShift = Number(pickTag(xml, "TOP_SHIFT_CM") ?? pickTag(xml, "TOP_OFFSET_CM"));

  const labelsPerJob = Number(pickTag(xml, "LABELS_PER_JOB"));
  const jobGapMs = Number(pickTag(xml, "JOB_GAP_MS"));
  const ttlMs = Number(pickTag(xml, "PRINTER_CACHE_TTL_MS"));

  let previewZoom: number | undefined;
  if (zoomRaw) {
    const z = Number(String(zoomRaw).replace(/[^\d.]/g, ""));
    if (isFinite(z) && z > 0) previewZoom = z > 5 ? z / 100 : z;
  }

  const cfg: PasscardCfg = {
    deviceName: device || undefined,
    preview: parseBoolLike(preview, DEFAULT_CFG.preview),
    previewCountAsPrint: parseBoolLike(previewCnt, DEFAULT_CFG.previewCountAsPrint),
    widthMM: isFinite(w) && w > 0 ? w : DEFAULT_CFG.widthMM,
    heightMM: isFinite(h) && h > 0 ? h : DEFAULT_CFG.heightMM,
    previewZoom: previewZoom ?? DEFAULT_CFG.previewZoom,

    padLeftCM: isFinite(padLeft) ? padLeft : DEFAULT_CFG.padLeftCM,
    padRightCM: isFinite(padRight) ? padRight : DEFAULT_CFG.padRightCM,
    rightInsetCM: isFinite(rightInset) ? rightInset : DEFAULT_CFG.rightInsetCM,
    lineWCm: isFinite(lineWcm) ? lineWcm : DEFAULT_CFG.lineWCm,
    feedCompMM: isFinite(feedComp) && feedComp >= 0 ? feedComp : DEFAULT_CFG.feedCompMM,
    qrMargin: isFinite(qrMargin) && qrMargin >= 0 ? qrMargin : DEFAULT_CFG.qrMargin,
    qrScale: isFinite(qrScale) && qrScale > 0 ? qrScale : DEFAULT_CFG.qrScale,
    qrEcLevel: (["L", "M", "Q", "H"] as const).includes(qrEc as any) ? (qrEc as any) : DEFAULT_CFG.qrEcLevel,

    topPadDeltaCM: isFinite(topPadDelta) ? topPadDelta : DEFAULT_CFG.topPadDeltaCM,
    topShiftCM: isFinite(topShift) ? topShift : DEFAULT_CFG.topShiftCM,

    labelsPerJob: isFinite(labelsPerJob) && labelsPerJob >= 1 ? labelsPerJob : DEFAULT_CFG.labelsPerJob,
    jobGapMs: isFinite(jobGapMs) ? (jobGapMs | 0) : DEFAULT_CFG.jobGapMs,
    printerCacheTtlMs: isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_CFG.printerCacheTtlMs,
  };

  return cfg;
}

function loadSpecific(file: string): PasscardCfg | null {
  try {
    const xml = fs.readFileSync(file, "utf8");
    const cfg = parseSettingXml(xml);
    if (cfg) {
      CONFIG_SRC = file;
      return cfg;
    }
  } catch (e) {
    console.warn("[print:config] failed to parse", file, e);
  }
  return null;
}
function resolveCfg(): PasscardCfg {
  const files = resolveCfgCandidates();
  for (const f of files) {
    if (fs.existsSync(f)) {
      const cfg = loadSpecific(f);
      if (cfg) return cfg;
    }
  }
  return { ...DEFAULT_CFG };
}
function initConfig() {
  CURRENT_CFG = resolveCfg();
  console.info("[PASSCARD][CONFIG] loaded", { from: CONFIG_SRC ?? "(default)", cfg: CURRENT_CFG });
}
initConfig();

/* ===================== 키/마킹 ===================== */
function keyOf(job: any) {
  const rawSeq = job.PCARD_SEQ ?? job.SEQ ?? "1";
  const seq3 = String(rawSeq).toString().trim().padStart(3, "0");
  const orderNo = (job.ORDER_NUMBER ?? job.WO ?? "").toString().trim();

  // ✅ MATERIAL_CODE 우선
  const material = (job.MATERIAL_CODE ?? job.MATERIAL ?? "").toString().trim();

  const qty = (job.PCARD_QTY ?? job.QTY ?? "").toString().trim();
  const computedBarKey = [orderNo, seq3, material, qty].filter(Boolean).join("_");

  const pick = (...c: any[]) => c.map((v) => (v ?? "").toString().trim()).find((v) => v.length > 0) || "";
  const fromSteps = (() => {
    try {
      if (Array.isArray(job.steps) && job.steps.length) {
        return pick(job.steps[0]?.plannedWorkCenter, job.steps[0]?.resource);
      }
      return "";
    } catch {
      return "";
    }
  })();

  const workCenter = pick(
    job.WORK_CENTER,
    job.center,
    job.CENTER,
    job.plannedWorkCenter,
    job.resource,
    job.RESOURCE,
    job.RESOURCE_CD,
    job.NEXT_RESOURCE_CD,
    fromSteps
  ).slice(0, 50) || "UNKNOWN";

  return {
    PLANT_CD: String(job.PLANT_CD ?? job.PLANT ?? "C200").slice(0, 4),
    SFC_CD: String(job.SFC_CD ?? job.SFC ?? "").slice(0, 128),
    ORDER_NUMBER: orderNo.slice(0, 10),
    BAR_KEY: computedBarKey.slice(0, 100),
    PCARD_SEQ: String(seq3).slice(0, 20),
    DAY_SEQ: String(job.DAY_SEQ ?? "1H").toUpperCase().endsWith("H")
      ? String(job.DAY_SEQ).toUpperCase()
      : `${job.DAY_SEQ ?? "1"}H`,
    WORK_CENTER: workCenter,
  };
}

async function markPrintResult(
  job: any,
  ok: boolean,
  errCode?: string,
  errMsg?: string,
  opts?: { stateHint?: "SUCCESS" | "SPOOLED" | "ERROR"; deviceName?: string; cntInc?: number }
) {
  const k = keyOf(job);
  try {
    await postJson(`${API_BASE}/epcard/print-result`, {
      ...k,
      OK: ok ? 1 : 0,
      ERR_CODE: errCode,
      ERR_MSG: errMsg,
      STATE: opts?.stateHint,
      DEVICE: opts?.deviceName,
      PRINT_LAST_TRY_AT: new Date().toISOString(),
      CNT_INC: opts?.cntInc ?? (ok && opts?.stateHint === "SUCCESS" ? 1 : 0),
    });
  } catch (e) {
    relayPasscardLog("PRINT_RESULT_FAIL", { ...k, err: String(e) }, "error");
  }
}

/* ===================== 프린터 캐시 ===================== */
let PRINTERS_CACHE: Electron.PrinterInfo[] | null = null;
let PRINTERS_CACHE_AT = 0;
let RESOLVED_DEVICE_NAME: string | undefined;
const PRINTERS_TTL_MS = 10 * 60 * 1000;

async function getPrintersOnce(win?: BrowserWindow): Promise<Electron.PrinterInfo[]> {
  const now = Date.now();
  if (PRINTERS_CACHE && now - PRINTERS_CACHE_AT < PRINTERS_TTL_MS) return PRINTERS_CACHE;
  let anyWin = win || BrowserWindow.getAllWindows()[0];
  let temp = false;
  if (!anyWin) {
    anyWin = new BrowserWindow({ show: false });
    temp = true;
  }
  try {
    const list = await (anyWin.webContents.getPrintersAsync?.() ?? Promise.resolve([]));
    PRINTERS_CACHE = list ?? [];
    PRINTERS_CACHE_AT = Date.now();
    return PRINTERS_CACHE;
  } catch {
    return [];
  } finally {
    if (temp && anyWin && !anyWin.isDestroyed())
      try {
        anyWin.close();
      } catch {}
  }
}

async function resolvePrinterNameCached(requested?: string) {
  if (RESOLVED_DEVICE_NAME && (!requested || requested === RESOLVED_DEVICE_NAME)) return RESOLVED_DEVICE_NAME;
  const list = await getPrintersOnce();
  if (!requested) {
    RESOLVED_DEVICE_NAME = undefined;
    return RESOLVED_DEVICE_NAME;
  }
  const exact = list.find((p) => p.name === requested);
  if (exact) {
    RESOLVED_DEVICE_NAME = exact.name;
    return RESOLVED_DEVICE_NAME;
  }
  const lc = requested.toLowerCase();
  const ci = list.find((p) => p.name.toLowerCase() === lc) || list.find((p) => p.name.toLowerCase().includes(lc));
  if (ci) {
    RESOLVED_DEVICE_NAME = ci.name;
    return RESOLVED_DEVICE_NAME;
  }
  RESOLVED_DEVICE_NAME = undefined;
  return RESOLVED_DEVICE_NAME;
}

/* ===================== 라벨 모델/섹션 ===================== */
const GEOM = {
  PAD_X_CM: 0.26,
  PAD_LEFT_CM: 0.2,
  PAD_Y_CM: 0.2,
  BORDER_PT: 1.2,
  LEFT_W_CM: 7.1,
  RIGHT_X_CM: 5.0,
  HEADER_H_CM: 0.6,
  META_H_CM: 0.6,
  BIG_H_CM: 0.8,
  STYLE_H_CM: 0.5,
  PROC_H_CM: 0.65,
  FOOT_H_CM: 0.65,
  TIME_H_CM: 0.6,
  META_K1_CM: 1.2,
  META_V1_CM: 2.65,
  META_K2_CM: 1.0,
  RIGHT_R1_CM: 0.65,
  RIGHT_R2_CM: 0.65,
  RIGHT_R3_CM: 1.7,
};
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
const ymdhms = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(
    d.getSeconds()
  )}`;

function formatPrintDt(raw: any): string {
  const s = (raw ?? "").toString().trim();
  if (!s) return ""; // ✅ 없으면 빈값

  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;

  const d = new Date(s);
  if (!isNaN(d as any)) return ymdhms(d);

  return s.slice(0, 19);
}

const clip = (s: string, max: number) => {
  const t = (s ?? "").toString();
  return t.length <= max ? t : t.slice(0, max);
};

// ✅ To-Be: CREATE_DATE(YYYYMMDD) → DD-MMM-YYYY (MMM=JAN..DEC)
function formatDDMMMYYYYFromYmd8(ymd8: string): string {
  const s = (ymd8 ?? "").toString().replace(/[^\d]/g, "").slice(0, 8);
  if (s.length !== 8) return "";
  const y = s.slice(0, 4);
  const m = Number(s.slice(4, 6));
  const d = s.slice(6, 8);
  const MMM = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1] ?? "";
  if (!MMM) return "";
  return `${d}-${MMM}-${y}`;
}

// ✅ To-Be: “시간(생산)” = 기존 TZ/로컬 판단 로직 유지(여긴 src 값만 쓰고 포맷만 HH)
function pickHourHHFromDateTimeLike(dt: any): string {
  const s = formatPrintDt(dt);
  if (!s) return "";
  // "YYYY-MM-DD HH:mm:ss"
  const hh = s.slice(11, 13);
  return /^\d{2}$/.test(hh) ? hh : "";
}

// ✅ PCARD_SEQ 표시 규칙: 01~99(2자리), 100~(3자리)
function formatSeqForHeader(seqRaw: any): string {
  const s = (seqRaw ?? "").toString().trim();
  if (!s) return "";
  const n = Number(s);
  if (Number.isFinite(n)) {
    if (n < 100) return String(n).padStart(2, "0");
    return String(n).padStart(3, "0");
  }
  // 숫자 아니면 원본
  return s;
}

function makeLabelModel(src: any) {
  const now = new Date();

  const valOrBlank = (v: any) => {
    const s = String(v ?? "").trim();
    return s ? s : "";
  };

  const plant = String(src?.PLANT_CD ?? src?.plant_cd ?? src?.PLANT ?? "C200").trim();
  const orderNo = String(src?.ORDER_NUMBER ?? src?.order_number ?? src?.WO ?? "").trim();

  const rawSeq = src?.PCARD_SEQ ?? src?.pcard_seq ?? src?.SEQ ?? "1";
  const seq3ForQr = String(rawSeq ?? "").trim().padStart(3, "0");
  const seqForHeader = formatSeqForHeader(rawSeq);

  const qty = String(src?.PCARD_QTY ?? src?.pcard_qty ?? src?.QTY ?? "").trim();

  // ✅ 우측 박스는 UNIT_CD만 (PR/KG 등). fallback 금지
  const unitCd = String(src?.UNIT_CD ?? src?.unit_cd ?? src?.UNIT ?? "").trim();

  const createYmd8 =
    String(src?.CREATE_DATE ?? src?.create_date ?? "").replace(/[^\d]/g, "").slice(0, 8) || ymd(now);

  const createDDMMMYYYY = formatDDMMMYYYYFromYmd8(createYmd8);

  const printDtRaw = src?.PRINT_DT ?? src?.print_dt ?? "";
  const printDt = printDtRaw ? formatPrintDt(printDtRaw) : "";

  const hourHH =
    pickHourHHFromDateTimeLike(src?.PRINT_DT ?? src?.print_dt) ||
    pickHourHHFromDateTimeLike(src?.CREATE_DT ?? src?.create_dt) ||
    "";

  const bd = valOrBlank(src?.BD_CD ?? src?.bd_cd ?? src?.BD);
  const opCd = valOrBlank(src?.OP_CD ?? src?.op_cd ?? src?.OP);

  const headerRaw = [bd, createDDMMMYYYY, opCd, hourHH, seqForHeader]
    .filter((x) => (x ?? "").toString().length > 0)
    .join("-");

  const prodResRaw =
    valOrBlank(src?.RESOURCE_CD ?? src?.resource_cd) ||
    valOrBlank(src?.machine_cd ?? src?.MACHINE_CD) ||
    valOrBlank(src?.line_cd ?? src?.LINE_CD) ||
    "";

  const nextResRaw =
    valOrBlank(src?.nt_machine_cd ?? src?.NT_MACHINE_CD) ||
    valOrBlank(src?.nt_line_cd ?? src?.NT_LINE_CD) ||
    "";

  const styleCd = valOrBlank(src?.STYLE_CD ?? src?.style_cd ?? src?.ZCF_STYLE_CD);
  const styleName = valOrBlank(src?.STYLE_NAME ?? src?.style_name ?? src?.STYLE_NM ?? src?.style_nm ?? src?.ZCF_MODEL_NM);

  const opName = valOrBlank(src?.OP_NAME ?? src?.op_name ?? src?.OP_NM ?? src?.op_nm ?? src?.ZCF_OP_NM);
  const partName = valOrBlank(src?.PART_NAME ?? src?.part_name ?? src?.PART_NM ?? src?.part_nm);

  const procHtml = [opName, partName]
    .filter(Boolean)
    .map((x) => esc(clip(x, 40)))
    .join("<br/>");

  const workCenter = valOrBlank(src?.WORK_CENTER ?? src?.work_center);
  const footHtml =
    `${esc(clip(plant, 10))} - ${esc(clip(workCenter, 20))} - ${esc(clip(prodResRaw, 24))}` +
    (orderNo ? `<br/>${esc(clip(orderNo, 30))}` : "");

  const material = String(src?.MATERIAL_CODE ?? src?.material_code ?? src?.MATERIAL ?? "").trim();
  const dbBarKey = String(src?.BAR_KEY ?? src?.bar_key ?? src?.BARCODE_TEXT ?? src?.barcode_text ?? "").trim();
  const computedBarKey = [orderNo, seq3ForQr, material, qty].filter(Boolean).join("_");
  const qrText = dbBarKey || computedBarKey;

  return {
    HEADER: esc(clip(headerRaw, 40)),
    PROD: esc(clip(prodResRaw, 24)),
    NEXT: esc(clip(nextResRaw, 24)),
    BIG_STYLE: esc(clip(styleCd || "", 14)),
    BIG_GENDER: "",
    STYLE: esc(clip(styleName || "", 46)),
    PROC_HTML: procHtml || "",
    FOOT_HTML: footHtml,
    DT: esc(clip(printDt, 19)),

    // ✅ 여기만 변경됨
    SIZE: esc(clip(unitCd, 8)),

    QTY: esc(clip(qty, 5)),
    QRIMG: src?.QR_IMG ?? src?.qr_img ?? "",
    QRDATA: esc(clip(qrText, 160)),
  };
}



/** 섹션만 생성(스타일/스크립트 없음, 프레임 고정용) */
function buildPasscardSections(jobs: any[]): string {
  return jobs
    .map((raw) => {
      const j = makeLabelModel(raw);
      return `
    <section class="pc">
      <div class="zbox z-header">${j.HEADER}</div>

      <!-- ✅ To-Be: 파란영역은 Next 한 줄만 -->
      <div class="zbox z-meta">
        <div class="meta-grid meta-next-only">
          <div class="k">Next</div><div class="v">${j.NEXT}</div>
        </div>
      </div>

      <div class="zbox z-bodyL">
        <div class="left-wrap">
          <div class="big">
            <span class="big-style">${j.BIG_STYLE}</span>
            <span class="big-gender">${j.BIG_GENDER}</span>
          </div>
          <div class="style">${j.STYLE}</div>
          <div class="proc">${j.PROC_HTML}</div>
          <div class="foot">${j.FOOT_HTML}</div>
          <div class="time">${j.DT}</div>
        </div>
      </div>

      <div class="zbox z-bodyR">
        <div class="right-grid">
          <div class="cell size"><div class="v">${j.SIZE}</div></div>
          <div class="cell qty"><div class="v">${j.QTY}</div></div>
          <div class="cell qr">
            ${
              j.QRIMG
                ? `<img class="qri" src="${j.QRIMG}" alt="QR">`
                : `<div class="qri" data-qr="${j.QRDATA}"></div>`
            }
            <div class="qrtext">${j.QRDATA}</div>
          </div>
        </div>
      </div>

      <div class="zbox z-bottomline" aria-hidden="true"></div>
      <div class="z-rightline" aria-hidden="true"></div>
    </section>`;
    })
    .join("");
}



/* ===================== QR 사전생성 ===================== */
async function ensureQrImages(jobs: any[]) {
  let BWIP: any = null;
  try {
    BWIP = await import("bwip-js");
  } catch {}
  const scale = Math.max(1, Math.floor(CURRENT_CFG.qrScale ?? 5));
  const pad = Math.max(0, Math.floor(CURRENT_CFG.qrMargin ?? 0));

  const out: any[] = [];
  for (const j of jobs) {
    const model = makeLabelModel(j);
    if (!model.QRDATA) {
      out.push(j);
      continue;
    }
    if ((j && j.QR_IMG) || (j && j.QRIMG)) {
      out.push(j);
      continue;
    }
    if (BWIP && typeof BWIP.toBuffer === "function") {
      try {
        const png: Buffer = await BWIP.toBuffer({
          bcid: "datamatrix",
          text: model.QRDATA,
          scale,
          paddingwidth: pad,
          paddingheight: pad,
        });
        const dataUrl = "data:image/png;base64," + png.toString("base64");
        out.push({ ...j, QR_IMG: dataUrl });
        continue;
      } catch {
        /* inline fallback */
      }
    }
    out.push(j);
  }
  return out;
}

/* ===================== 페이지/옵션 ===================== */
function getConfiguredPageSizeUm(over?: { widthMicrons?: number; heightMicrons?: number }) {
  const size = {
    width: over?.widthMicrons ?? mmToMicrons(CURRENT_CFG.widthMM),
    height: over?.heightMicrons ?? mmToMicrons(CURRENT_CFG.heightMM),
  };
  relayPasscardLog(
    "PAGE_SIZE",
    { um: size, mm: { w: size.width / 1000, h: size.height / 1000 }, from: CONFIG_SRC ?? "(default)" },
    "info"
  );
  return size;
}
type BatchOptions = { deviceName?: string; preview?: boolean; widthMicrons?: number; heightMicrons?: number };
type MergedBatchOptions = { deviceName?: string; preview: boolean; widthMicrons: number; heightMicrons: number };

function mergeOptions(partial?: BatchOptions): MergedBatchOptions {
  const cfg = CURRENT_CFG;
  const widthMicrons = typeof partial?.widthMicrons === "number" ? partial.widthMicrons : mmToMicrons(cfg.widthMM);
  const heightMicrons =
    typeof partial?.heightMicrons === "number" ? partial.heightMicrons : mmToMicrons(cfg.heightMM);
  return {
    deviceName: partial?.deviceName ?? cfg.deviceName ?? undefined,
    preview: typeof partial?.preview === "boolean" ? partial.preview : !!cfg.preview,
    widthMicrons,
    heightMicrons,
  };
}
type PageSizeUm = { width: number; height: number };

/* ===================== 정적 프레임(CSS 1회) ===================== */
function makeSkeletonHTML(ps: PageSizeUm) {
  // 스타일은 1회만. 섹션은 루프에서 교체.
  const Wcm = (ps.width / 1000) / 10, Hcm = (ps.height / 1000) / 10;
  const PAD_L = CURRENT_CFG.padLeftCM ?? GEOM.PAD_LEFT_CM;
  const PAD_R = CURRENT_CFG.padRightCM ?? 0.20;
  const RIGHT_IN = CURRENT_CFG.rightInsetCM ?? 0.15;
  const LINE_W = CURRENT_CFG.lineWCm ?? 0.03;
  const TOP_DELTA = CURRENT_CFG.topPadDeltaCM ?? 0;
  const PAD_T = Math.max(0, GEOM.PAD_Y_CM + TOP_DELTA);
  const PAD_B = GEOM.PAD_Y_CM;
  const SHIFT_Y = CURRENT_CFG.topShiftCM ?? 0;

  const R1 = GEOM.RIGHT_R1_CM, R2 = GEOM.RIGHT_R2_CM;
  const compCm = Math.max(0, (CURRENT_CFG.feedCompMM ?? 0) / 10);
  const R3eff = Math.max(0.30, GEOM.RIGHT_R3_CM - compCm);
  const RIGHT_TOTAL = R1 + R2 + R3eff;

  const LEFT_OTHERS = GEOM.BIG_H_CM + GEOM.STYLE_H_CM + GEOM.PROC_H_CM + GEOM.FOOT_H_CM;
  const TIME_CM = Math.max(0.1, +(RIGHT_TOTAL - LEFT_OTHERS).toFixed(3));

  const META_V2_CM = Math.max(0.1, GEOM.LEFT_W_CM - (GEOM.META_K1_CM + GEOM.META_V1_CM + GEOM.META_K2_CM));

  return `<!doctype html><meta charset="utf-8">
  <style>
    @page { size:${Wcm}cm ${Hcm}cm; margin:0 }
    html, body { margin:0; padding:0 }
    :root{
      --W:${Wcm}cm; --H:${Hcm}cm;
      --pl:${PAD_L}cm; --pr:${PAD_R}cm;
      --pt:${PAD_T}cm; --pb:${PAD_B}cm;
      --shiftY:${SHIFT_Y}cm;
      --bpt:${GEOM.BORDER_PT}pt; --rx:${GEOM.RIGHT_X_CM}cm;
      --head:${GEOM.HEADER_H_CM}cm;
      --meta:${GEOM.META_H_CM}cm; --big:${GEOM.BIG_H_CM}cm; --style:${GEOM.STYLE_H_CM}cm;
      --proc:${GEOM.PROC_H_CM}cm; --foot:${GEOM.FOOT_H_CM}cm; --time:${TIME_CM}cm;
      --k1:${GEOM.META_K1_CM}cm; --v1:${GEOM.META_V1_CM}cm; --k2:${GEOM.META_K2_CM}cm; --metaV2:${META_V2_CM.toFixed(3)}cm;
      --r1:${R1}cm; --r2:${R2}cm; --r3:${R3eff}cm; --rtotal:${RIGHT_TOTAL}cm;
      --over:0.02cm; --rin:${RIGHT_IN}cm; --linew:${LINE_W}cm;

      /* ✅ style + proc를 “같은 값”으로 같이 올리는 값 (여기만 조절) */
      --midShift:-0.10cm; /* -0.06 ~ -0.10 추천 */
    }

    .pc{
      position:relative;
      width:var(--W); height:var(--H);
      box-sizing:border-box;
      border:var(--bpt) solid transparent;
      padding:var(--pt) var(--pr) var(--pb) var(--pl);
      font-family:"Arial Narrow", Arial, "Malgun Gothic","맑은 고딕",sans-serif;
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
      overflow:visible;
      break-after: page;
      page-break-after: always;
    }
    .zbox{
      position:absolute;
      left:var(--pl);
      width:calc(100% - var(--pl) - var(--pr));
      box-sizing:border-box;
    }
    .z-header{
      top:calc(var(--pt) + var(--shiftY));
      height:var(--head);
      border:var(--bpt) solid #000;
      border-right:none;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:900;
      font-size:12pt;
    }
    .z-meta{
      top:calc(var(--pt) + var(--head) + var(--shiftY));
      height:var(--meta);
      border-left:var(--bpt) solid #000;
      border-bottom:var(--bpt) solid #000;
      border-right:none;
    }
    .meta-grid{
      height:100%;
      display:grid;
      grid-template-columns: var(--k1) var(--v1) var(--k2) var(--metaV2);
    }
    .meta-grid.meta-next-only{
      grid-template-columns: var(--k1) calc(100% - var(--k1));
    }
    .meta-grid.meta-next-only .v{
      justify-content:center;
      padding:0;
    }
    .meta-grid > *{
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .meta-grid .k{
      font-size:10pt;
      font-weight:600;
    }
    .meta-grid .v{
      font-size:10pt;
      font-weight:900;
      justify-content:flex-start;
      padding:0 .12cm;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .meta-grid > :not(:first-child){
      border-left:var(--bpt) solid #000;
    }

    .z-bodyL{
      top:calc(var(--pt) + var(--head) + var(--meta) + var(--shiftY));
      left:var(--pl);
      width:calc(var(--rx) - var(--pl));
      height:calc(100% - (var(--pt) + var(--pb) + var(--head) + var(--meta)));
    }
    .z-bodyL::before{
      content:"";
      position:absolute;
      left:0;
      top:calc(0cm - var(--over));
      height:calc(var(--rtotal) + 2*var(--over));
      border-left:var(--bpt) solid #000;
      pointer-events:none;
      z-index:3;
    }

    .left-wrap{
      position:relative;
      width:100%; height:100%;
      display:grid;
      grid-template-rows: var(--big) var(--style) var(--proc) var(--foot) var(--time);
    }

    .big{
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:0 .12cm;
      font-size:15pt;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .big-style{
      font-weight:900;
      flex:1 1 auto;
      text-align:center;
      padding-right:0.1cm;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .big-gender{
      font-weight:400;
      font-size:11pt;
      flex:0 0 auto;
      text-align:right;
      padding-left:0.1cm;
      white-space:nowrap;
    }

    /* ✅ STYLE (Nike...) */
    .style{
      display:flex;
      align-items:center;
      justify-content:center;
      padding:0 .06cm;
      font-size:8.2pt;

      /* ✅ margin-top 방식 제거 → 같은 값으로 올리기 */
      position:relative;
      top:var(--midShift);
      margin:0;
    }

    /* ✅ PROC (OP_NM + PART_NM) */
    .proc{
      display:flex;
      align-items:center;
      justify-content:center;

      /* ✅ 겹침 방지용: bottom만 아주 조금 */
      padding:0 0 0.05cm 0;

      font-size:10.8pt;
      font-weight:900;
      text-align:center;

      /* ✅ 줄간격은 너무 줄이면 foot와 겹침 */
      line-height:1.04;

      /* ✅ margin-top 방식 제거 → style과 같은 값으로 올리기 */
      position:relative;
      top:var(--midShift);
      margin:0;
    }

    /* 공통 기본 */
    .foot, .time{
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:8.6pt;
      text-align:center;
      line-height:1.08;
    }

    /* 🔴 foot만 위아래 압축 */
    .foot{
      padding:0;
      line-height:1.02;
    }

    /* 🔴 time은 가로라인 + 최소 간격 */
    .time{
      padding:0 .06cm;
      border-top:var(--bpt) solid #000;
      line-height:1.0;
    }

    .z-bodyR{
      top:calc(var(--pt) + var(--head) + var(--meta) + var(--shiftY));
      left:var(--rx);
      width:calc(100% - var(--rx) - var(--pr));
      height:calc(100% - (var(--pt) + var(--pb) + var(--head) + var(--meta)));
    }
    .z-bodyR::before{
      content:"";
      position:absolute;
      left:0;
      top:calc(0cm - var(--over));
      height:calc(var(--rtotal) + 2*var(--over));
      border-left:var(--bpt) solid #000;
      pointer-events:none;
      z-index:3;
    }
    .right-grid{
      position:relative;
      width:100%; height:100%;
      display:grid;
      grid-template-rows:var(--r1) var(--r2) var(--r3);
    }
    .cell{ display:flex; align-items:center; justify-content:center; }
    .size{ border-bottom:var(--bpt) solid #000; }
    .qty{ border-bottom:var(--bpt) solid #000; }
    .size .v{ font-size:13.5pt; font-weight:800; }
    .qty .v{ font-size:13pt; font-weight:800; }

    .qr{
      display:flex;
      align-items:center;
      justify-content:center;
      width:100%; height:100%;
      padding:0;
      box-sizing:border-box;
    }
    .qri{
      width:100%; height:100%;
      object-fit:contain;
      image-rendering:pixelated;
    }
    .qrtext{ display:none; }

    @media print {
      #toolbar{ display:none !important; }
      .qrtext{ display:none !important; }
    }

    .z-bottomline{
      position:absolute;
      left:calc(var(--pl) - var(--over));
      width:calc(100% - var(--pl) - var(--pr) + 2*var(--over));
      top:calc(var(--pt) + var(--head) + var(--meta) + var(--rtotal) + var(--shiftY));
      height:0;
      border-top:var(--bpt) solid #000;
      pointer-events:none;
      z-index:10;
    }
    .z-rightline{
      position:absolute;
      right: calc(var(--pr) + var(--rin));
      top:   calc(var(--pt) - var(--over) + var(--shiftY));
      height:calc(var(--head) + var(--meta) + var(--rtotal) + 2*var(--over));
      width: var(--linew);
      background:#000;
      pointer-events:none;
      z-index:12;
      transform: translateZ(0);
    }
  </style>
  <div id="passcard-container"></div>
  <script>
    (function(){
      function BitBuffer(){this.buffer=[];this.length=0}
      BitBuffer.prototype.put=function(num,len){for(var i=0;i<len;i++)this.putBit(((num>>(len-i-1))&1)==1)}
      BitBuffer.prototype.putBit=function(bit){var idx=this.length>>3;if(this.buffer.length<=idx)this.buffer.push(0); if(bit)this.buffer[idx]|=(128>>(this.length%8)); this.length++}
      function QR(data){this.n=33;this.modules=[...Array(this.n)].map(()=>Array(this.n).fill(false));this.data=data}
      QR.prototype.make=function(){var bb=new BitBuffer(),d=this.data;bb.put(4,4);bb.put(d.length,8);for(var i=0;i<d.length;i++)bb.put(d.charCodeAt(i),8);bb.put(0,4);while(bb.length%8)bb.putBit(false);while(bb.length<this.n*this.n){bb.put(0xec,8);if(bb.length<this.n*this.n)bb.put(0x11,8);}var inc=-1,row=this.n-1,bit=0,byte=0;for(var col=this.n-1;col>0;col-=2){if(col==6)col--;while(true){for(var c=0;c<2;c++){var dark=false;if(byte<bb.buffer.length){dark=((bb.buffer[byte]>>(7-(bit%8)))&1)==1;bit++;if(bit%8==0)byte++;}this.modules[row][col-c]=dark;}row+=inc;if(row<0||this.n<=row){row-=inc;inc=-inc;break;}}}}
      QR.prototype.drawTo=function(el){var s=Math.min(el.clientWidth||120, el.clientHeight||120),n=this.n,cs=Math.max(2,Math.floor(s/n));var c=document.createElement('canvas');c.width=c.height=cs*n;var g=c.getContext('2d');g.fillStyle='#000';g.imageSmoothingEnabled=false;for(var r=0;r<n;r++)for(var c2=0;c2<n;c2++)if(this.modules[r][c2])g.fillRect(c2*cs,r*cs,cs,cs);c.style.width='100%';c.style.height='100%';el.innerHTML='';el.appendChild(c);}
      window.__renderDM = function(){ var nodes=document.querySelectorAll('.qri[data-qr]'); for(var i=0;i<nodes.length;i++){var el=nodes[i], t=el.getAttribute('data-qr')||''; if(!t) continue; var q=new QR(t); q.make(); q.drawTo(el);} }
    })();

    (function primeOnce(){
      try{
        var cont = document.getElementById('passcard-container');
        if(!cont) return;
        var ghost = document.createElement('div');
        ghost.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:var(--W);height:var(--H);';

        /* ✅ To-Be: 파란영역 Next 한 줄만 */
        ghost.innerHTML = '<section class="pc">\
          <div class="zbox z-header">IP-03-DEC-2025-IPI-08-01</div>\
          <div class="zbox z-meta">\
            <div class="meta-grid meta-next-only">\
              <div class="k">Next</div><div class="v">LN02</div>\
            </div>\
          </div>\
          <div class="zbox z-bodyL">\
            <div class="left-wrap">\
              <div class="big">\
                <span class="big-style">STYLE</span>\
                <span class="big-gender"></span>\
              </div>\
              <div class="style">STYLE NAME</div>\
              <div class="proc">OP NAME<br/>PART NAME</div>\
              <div class="foot">C200 - IPIPI - LN01<br/>APS110000001</div>\
              <div class="time">2025-12-03 08:17:32</div>\
            </div>\
          </div>\
          <div class="zbox z-bodyR">\
            <div class="right-grid">\
              <div class="cell size"><div class="v">7 - 7T</div></div>\
              <div class="cell qty"><div class="v">48</div></div>\
              <div class="cell qr"><div class="qri" data-qr="DUMMY_QR_123"></div></div>\
            </div>\
          </div>\
          <div class="zbox z-bottomline" aria-hidden="true"></div>\
          <div class="z-rightline" aria-hidden="true"></div>\
        </section>';

        cont.appendChild(ghost);
        window.__renderDM && window.__renderDM();
        void ghost.getBoundingClientRect();
        setTimeout(function(){ try{ cont.removeChild(ghost); }catch(e){} }, 150);
      }catch(e){}
    })();
  </script>`;
}


/* ===================== PDF 백엔드 핑 ===================== */
async function pdfPing(win: Electron.BrowserWindow, ps: PageSizeUm) {
  try {
    await win.webContents.printToPDF({ pageSize: ps });
  } catch {}
}

/* ===================== 배치 인쇄 ===================== */
const JOB_GAP_MS = (CURRENT_CFG.jobGapMs ?? 6) | 0;

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 1) return arr.map((x) => [x]);
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function whenReadyToPrint(win: Electron.BrowserWindow, timeoutMs = 2500) {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const ok = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const fail = (m: string) => {
      if (!done) {
        done = true;
        reject(new Error(m));
      }
    };
    const to = setTimeout(() => fail("load timeout"), timeoutMs);
    const js = `
      new Promise((res) => {
        const ready = () => { requestAnimationFrame(() => requestAnimationFrame(res)); };
        if (document.readyState === 'complete') ready();
        else window.addEventListener('load', ready, { once: true });
      });
    `;
    win.webContents
      .executeJavaScript(js, true)
      .then(() => {
        clearTimeout(to);
        ok();
      })
      .catch((e: any) => {
        clearTimeout(to);
        fail(String(e));
      });
  });
}

function makeSpoolToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function docTitleFor(job: any, token: string) {
  const k = keyOf(job);
  const base = `PASSCARD ${k.ORDER_NUMBER}-${k.PCARD_SEQ}`;
  return k.BAR_KEY ? `${base}-${k.BAR_KEY}-${token}` : `${base}-${token}`;
}

async function doBatchPrintAsync(jobs: any[], optionsIn: BatchOptions, notify?: { wcId?: number; batchId?: string }) {
  const merged = mergeOptions(optionsIn);
  const batchId = notify?.batchId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const send = (ch: string, p: any) => {
    if (!notify?.wcId) return;
    try {
      webContents.fromId(notify.wcId)?.send(ch, p);
    } catch {}
  };

  const preview = merged.preview;
  const pageSizeUm: PageSizeUm = getConfiguredPageSizeUm({
    widthMicrons: merged.widthMicrons,
    heightMicrons: merged.heightMicrons,
  });
  const resolvedDeviceNameOnce = await resolvePrinterNameCached(merged.deviceName);

  relayPasscardLog(
    "BATCH_START_FAST",
    {
      batchId,
      jobsCount: Array.isArray(jobs) ? jobs.length : -1,
      preview,
      cfg: { deviceName: CURRENT_CFG.deviceName, widthMM: CURRENT_CFG.widthMM, heightMM: CURRENT_CFG.heightMM },
      printer: {
        requested: merged.deviceName ?? CURRENT_CFG.deviceName,
        resolved: resolvedDeviceNameOnce ?? "*(system default)*",
      },
    },
    "info"
  );

  const printWith = (win: Electron.BrowserWindow, opts: Electron.WebContentsPrintOptions) =>
    new Promise<void>((resolve, reject) => {
      win.webContents.print(opts, (ok, err) => (ok ? resolve() : reject(new Error(err || "print failed"))));
    });

  const perResults: Array<{ index: number; key: ReturnType<typeof keyOf>; ok?: boolean; error?: string; preview?: boolean }> =
    [];

  // 미리보기
  if (preview) {
    const jobsWithQr = await ensureQrImages(jobs);
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      show: true,
      autoHideMenuBar: true,
      webPreferences: { sandbox: false, backgroundThrottling: false, spellcheck: false },
    });
    HOLD.add(win);
    win.on("closed", () => HOLD.delete(win));
    const skeleton = makeSkeletonHTML(pageSizeUm);
    await win.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(skeleton));
    await whenReadyToPrint(win);
    await win.webContents.setZoomFactor(CURRENT_CFG.previewZoom ?? 1.0);

    const sections = buildPasscardSections(jobsWithQr);
    await win.webContents.executeJavaScript(
      `document.getElementById('passcard-container').innerHTML = ${JSON.stringify(sections)}; window.__renderDM?.();`
    );

    const base: Electron.WebContentsPrintOptions = {
      silent: false,
      printBackground: true,
      pageSize: pageSizeUm,
      margins: { marginType: "custom", top: 0, right: 0, bottom: 0, left: 0 },
      ...(resolvedDeviceNameOnce ? { deviceName: resolvedDeviceNameOnce } : {}),
    };
    try {
      await printWith(win, base);
    } catch (e) {
      const { deviceName, ...noDev } = base as any;
      await printWith(win, noDev);
    } finally {
      if (!win.isDestroyed()) win.close();
    }

    const cntInc = CURRENT_CFG.previewCountAsPrint ? 1 : 0;
    for (const [idx, job] of jobs.entries()) {
      const key = keyOf(job);
      await markPrintResult(job, true, undefined, undefined, {
        stateHint: "SUCCESS",
        deviceName: resolvedDeviceNameOnce,
        cntInc,
      });
      perResults.push({ index: idx, key, ok: true, preview: true });
      send(CHANNEL_JOB, { batchId, index: idx, key, ok: true, preview: true });
    }
    send(CHANNEL_DONE, {
      batchId,
      total: jobs.length,
      okCount: jobs.length,
      pendCount: 0,
      failCount: 0,
      results: perResults,
    });
    return;
  }

  // 지정 프린터 못 찾으면 OS 기본 프린터로 fallback
  if (merged.deviceName && !resolvedDeviceNameOnce) {
    relayPasscardLog(
      "PRINTER_NOT_FOUND_FALLBACK_DEFAULT",
      { batchId, requested: merged.deviceName, note: "지정 프린터를 찾지 못해 OS 기본 프린터로 Fallback 합니다." },
      "warn"
    );
    merged.deviceName = undefined;
  }

  // 본 인쇄
  const jobsWithQrAll = await ensureQrImages(jobs);
  const printWin = await getPrintWin();

  // 웜업 + 정적 프레임 1회
  try {
    await getPrintersOnce(printWin);
    const skeleton = makeSkeletonHTML(pageSizeUm);
    await printWin.webContents.executeJavaScript(
      `document.open();document.write(${JSON.stringify(skeleton)});document.close();`,
      true
    );
    await whenReadyToPrint(printWin);
    await pdfPing(printWin, pageSizeUm);
  } catch (e) {
    relayPasscardLog("WARMUP_OR_SKELETON_FAIL", { error: String(e) }, "warn");
  }

  const baseSilent: Electron.WebContentsPrintOptions = {
    silent: true,
    printBackground: true,
    pageSize: pageSizeUm,
    margins: { marginType: "custom", top: 0, right: 0, bottom: 0, left: 0 },
    ...(resolvedDeviceNameOnce ? { deviceName: resolvedDeviceNameOnce } : {}),
  };

  const batches = chunk(jobsWithQrAll, Math.max(1, CURRENT_CFG.labelsPerJob ?? 1));

  for (const [bIdx, batch] of batches.entries()) {
    const token = makeSpoolToken();
    const docTitle = batch.length === 1 ? docTitleFor(batch[0], token) : `PASSCARD-x${batch.length}-${token}`;

    const sectionsHtml = buildPasscardSections(batch);
    const t0 = process.hrtime.bigint();
    await printWin.webContents.executeJavaScript(
      `document.title=${JSON.stringify(docTitle)};document.getElementById('passcard-container').innerHTML = ${JSON.stringify(
        sectionsHtml
      )}; window.__renderDM?.();`,
      true
    );
    const t1 = process.hrtime.bigint();

    relayPasscardLog(
      "PRINT_SPLIT_OR_MICROBATCH",
      { batchIndex: bIdx, pages: batch.length, deviceName: resolvedDeviceNameOnce ?? "(default)", docTitle },
      "info"
    );

    try {
      const t2 = process.hrtime.bigint();
      try {
        await printWith(printWin, baseSilent);
      } catch (e1) {
        relayPasscardLog("PRINT_FALLBACK_MARGINS_NONE", { batchIndex: bIdx, error: String(e1) }, "warn");
        try {
          await printWith(printWin, { ...baseSilent, margins: { marginType: "none" } });
        } catch (e2) {
          relayPasscardLog("PRINT_FALLBACK_NODEVICE", { batchIndex: bIdx, error: String(e2) }, "warn");
          const { deviceName, ...noDev } = baseSilent as any;
          await printWith(printWin, { ...noDev, margins: { marginType: "none" } });
        }
      }
      const t3 = process.hrtime.bigint();
      await pdfPing(printWin, pageSizeUm);
      const t4 = process.hrtime.bigint();

      relayPasscardLog(
        "TIMER",
        {
          batchIndex: bIdx,
          pages: batch.length,
          inject_ms: Number(t1 - t0) / 1e6,
          print_ms: Number(t3 - t2) / 1e6,
          total_ms: Number(t4 - t0) / 1e6,
        },
        "info"
      );

      for (const [i, job] of batch.entries()) {
        const idx = bIdx * (CURRENT_CFG.labelsPerJob ?? 1) + i;
        const key = keyOf(job);
        await markPrintResult(job, true, undefined, undefined, {
          stateHint: "SUCCESS",
          deviceName: resolvedDeviceNameOnce,
          cntInc: 1,
        });
        perResults.push({ index: idx, key, ok: true });
        send(CHANNEL_JOB, { batchId, index: idx, key, ok: true });
      }
      if (JOB_GAP_MS > 0) await sleep(JOB_GAP_MS);
    } catch (e) {
      relayPasscardLog("ERROR", { where: "split-or-microbatch", batchIndex: bIdx, error: String(e), batchId }, "error");
      for (const [i, job] of batch.entries()) {
        const idx = bIdx * (CURRENT_CFG.labelsPerJob ?? 1) + i;
        const key = keyOf(job);
        await markPrintResult(job, false, "LOAD_OR_PRINT_ERROR", String(e), {
          stateHint: "ERROR",
          deviceName: resolvedDeviceNameOnce,
          cntInc: 0,
        });
        perResults.push({ index: idx, key, ok: false, error: "LOAD_OR_PRINT_ERROR" });
        send(CHANNEL_JOB, { batchId, index: idx, key, ok: false, error: "LOAD_OR_PRINT_ERROR" });
      }
    }
  }

  const okCount = perResults.filter((r) => r.ok).length;
  const failCount = perResults.length - okCount;
  send(CHANNEL_DONE, { batchId, total: perResults.length, okCount, pendCount: 0, failCount, results: perResults });
}

/* ===================== 단일 프린트 ===================== */
ipcMain.handle("epcard:print", async (e, args: PrintArgs) => {
  const merged = mergeOptions({
    deviceName: args?.deviceName,
    preview: typeof args?.preview === "boolean" ? args.preview : undefined,
    widthMicrons: args?.pageSize ? mmToMicrons(args.pageSize.widthMM) : undefined,
    heightMicrons: args?.pageSize ? mmToMicrons(args.pageSize.heightMM) : undefined,
  });

  setImmediate(async () => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      show: true,
      autoHideMenuBar: true,
      webPreferences: { sandbox: false, backgroundThrottling: false, spellcheck: false },
    });
    HOLD.add(win);
    win.on("closed", () => HOLD.delete(win));
    try {
      const targetUrl = args?.url || e.sender.getURL();
      const resolvedDeviceName = await resolvePrinterNameCached(merged.deviceName);
      await win.loadURL(targetUrl);
      await whenReadyToPrint(win);
      await win.webContents.setZoomFactor(merged.preview ? CURRENT_CFG.previewZoom ?? 1.0 : 1);

      const pageSizeUm = getConfiguredPageSizeUm({ widthMicrons: merged.widthMicrons, heightMicrons: merged.heightMicrons });
      const opts: PrintOptions = {
        silent: !merged.preview,
        printBackground: true,
        pageSize: pageSizeUm,
        margins: { marginType: "custom", top: 0, right: 0, bottom: 0, left: 0 },
        ...(resolvedDeviceName ? { deviceName: resolvedDeviceName } : {}),
      };

      await new Promise<void>((resolve, reject) => {
        win.webContents.print(opts, (ok, err) => (ok ? resolve() : reject(new Error(err || "print failed"))));
      });

      await sleep(300);
      if (!merged.preview && !win.isDestroyed()) win.close();
    } catch (e) {
      relayPasscardLog("ERROR", { where: "single-fast", error: String(e) }, "error");
      if (!win.isDestroyed()) win.close();
    }
  });

  return { ok: true, accepted: 1, mode: (args?.preview ?? CURRENT_CFG.preview) ? "preview" : "silent" };
});

/* ===================== 배치 IPC/목록/컨피그 ===================== */
function parseJobs(payloadOrList: any, maybeOptions?: any) {
  const isNew = payloadOrList && typeof payloadOrList === "object" && "jobs" in payloadOrList;
  const jobs: any[] = isNew ? payloadOrList.jobs || [] : payloadOrList || [];
  const options = isNew ? payloadOrList.options || {} : maybeOptions || {};
  return { jobs, options, batchId: (payloadOrList && payloadOrList.batchId) || undefined };
}

ipcMain.handle("print:passcards", async (e, payloadOrList: any, maybeOptions?: any) => {
  const { jobs, options, batchId } = parseJobs(payloadOrList, maybeOptions);
  const merged = mergeOptions(options);
  // relayPasscardLog("IPC print:passcards FAST", { accepted: Array.isArray(jobs) ? jobs.length : 0, preview: merged.preview, batchId: batchId ?? "(auto)" }, "info");
  // relayPasscardLog("DEBUG_FIRST_JOB", { sample: jobs?.[0], keys: Object.keys(jobs?.[0] ?? {}) }, "info");

  setImmediate(() => {
    void doBatchPrintAsync(jobs, merged, { wcId: e.sender.id, batchId });
  });
  return { ok: true, accepted: Array.isArray(jobs) ? jobs.length : 0, mode: merged.preview ? "preview" : "silent", batchId: batchId ?? undefined };
});

ipcMain.handle("passcard:print-batch", async (_e, payloadOrList: any, maybeOptions?: any) => {
  const { jobs, options, batchId } = parseJobs(payloadOrList, maybeOptions);
  const merged = mergeOptions(options);
  relayPasscardLog("IPC passcard:print-batch FAST", { accepted: Array.isArray(jobs) ? jobs.length : 0, preview: merged.preview, batchId: batchId ?? "(auto)" }, "info");
  setImmediate(() => {
    void doBatchPrintAsync(jobs, merged, { batchId });
  });
  return { ok: true, accepted: Array.isArray(jobs) ? jobs.length : 0, mode: merged.preview ? "preview" : "silent", batchId: batchId ?? undefined };
});

ipcMain.handle("print:list", async () => {
  const list = await getPrintersOnce();
  return list;
});

ipcMain.handle("print:config-info", async () => ({
  ok: true,
  file: CONFIG_SRC ?? "(default)",
  cfg: CURRENT_CFG,
  API_BASE,
}));

ipcMain.handle("print:config-reload", async () => {
  const next = resolveCfg();
  CURRENT_CFG = next;
  relayPasscardLog("CONFIG reloaded (manual)", { from: CONFIG_SRC, cfg: CURRENT_CFG, API_BASE }, "info");
  return { ok: true, file: CONFIG_SRC, cfg: CURRENT_CFG, API_BASE };
});

// 🔸 사이드이펙트 모듈 명시
export {};
