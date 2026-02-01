// src/main/index.ts
// ──────────────────────────────────────────────────────────────
// [1] 메인 프로세스 글로벌 예외 가드 (다른 import 이전!)
// ──────────────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("💥 [MAIN] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 [MAIN] unhandledRejection:", reason);
});

// ──────────────────────────────────────────────────────────────
// [2] 일반 import (epcardPrint는 절대 여기서 import 하지 않음)
// ──────────────────────────────────────────────────────────────
import { app, shell, BrowserWindow, nativeImage, ipcMain, Menu } from "electron";
import { join, dirname } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { loadXmlConfig } from "@main/utils/loadConfig";
import fs from "fs";
import { ensureLocalApiServer, stopLocalApiServer } from "./server";
import axios from "axios";
import { warmupOnce } from "./warmup";
import { registerWarmupIpc, setWarmupBaseUrl } from "./ipc-warmup";
import path from "node:path";
import { pathToFileURL } from "node:url";


// ─────────────── 인쇄/백그라운드 최적화 스위치 ───────────────
app.commandLine.appendSwitch("disable-print-preview");
app.commandLine.appendSwitch("kiosk-printing");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");


// =============================================================
// 이하 기존 코드 전부 동일 (절대 수정 금지)
// =============================================================

/* ───────────────── Language 메뉴 ───────────────── */
type LangCode = "en" | "ko-KR" | "vi" | "zh-Hans" | "id";

function applyAppMenu() {
  const LANGS: Array<{ code: LangCode; label: string }> = [
    { code: "ko-KR", label: "한국어" },
    { code: "en", label: "English" },
    { code: "vi", label: "Tiếng Việt" },
    { code: "zh-Hans", label: "简体中文" },
    { code: "id", label: "Bahasa Indonesia" },
  ];
  const current = (loadSavedLang() ?? "en") as LangCode;

  const languageSubmenu: Electron.MenuItemConstructorOptions[] = LANGS.map(l => ({
    label: l.label,
    type: "radio",
    checked: current === l.code,
    click: () => {
      saveLang(l.code);
      process.env.APP_LANG = l.code;
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) win.webContents.send("lang:changed", l.code);
      });
      applyAppMenu();
    },
  }));


  const template: Electron.MenuItemConstructorOptions[] = [
    { label: "File",   submenu: [{ role: "quit", label: "Exit" }] },
    { label: "Edit",   submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" },
                                 { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View",   submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" },
                                 { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" },
                                 { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    { label: "Language", submenu: languageSubmenu },
    { label: "Help",   submenu: [{ role: "about", label: "About" }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── keep epcardPrint chunk emitted without executing it (NO top-level await)
const __keep_epcard_chunk_loader =
  Math.random() < 0 ? () => import("./epcardPrint.js") : null;
// 참조만 남겨 번들러가 제거하지 않게 함
void __keep_epcard_chunk_loader;


/* ───────────────── settings.json ───────────────── */
const settingsPath = () => join(app.getPath("userData"), "settings.json");
const readJsonSafe = (p: string) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
};
const writeJsonSafe = (p: string, obj: any) => {
  try {
    fs.mkdirSync(dirname(p), { recursive: true });
  } catch {}
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
};

function readLangFromArgsEnv(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--lang="))?.slice("--lang=".length);
  return (arg as string) || process.env.APP_LANG || null;
}
function loadSavedLang(): string | null {
  try {
    if (!fs.existsSync(settingsPath())) return null;
    const j = JSON.parse(fs.readFileSync(settingsPath(), "utf-8"));
    return typeof j.lang === "string" ? j.lang : null;
  } catch {
    return null;
  }
}
function saveLang(lang: string) {
  let j: any = {};
  try {
    if (fs.existsSync(settingsPath())) j = JSON.parse(fs.readFileSync(settingsPath(), "utf-8"));
  } catch {}
  j.lang = lang;
  writeJsonSafe(settingsPath(), j);
}
function initLanguageAtBoot(): LangCode {
  const incoming = readLangFromArgsEnv();
  const saved = loadSavedLang();
  const lang = (incoming || saved || "en") as LangCode;
  if (incoming && incoming !== saved) saveLang(lang);
  process.env.APP_LANG = lang;
  return lang;
}

/* ─────────────── i18n 로더 ─────────────── */
function listFiles(dir: string) {
  try { return fs.readdirSync(dir); } catch { return []; }
}
function readAllJsonInDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!fs.existsSync(dir)) return out;
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of list) {
      if (!ent.isFile()) continue;
      const file = join(dir, ent.name);
      try {
        const txt = fs.readFileSync(file, "utf-8").trim();
        if (!txt) continue;
        const obj = JSON.parse(txt);
        if (obj && typeof obj === "object") Object.assign(out, obj);
      } catch { /* ignore invalid */ }
    }
  } catch {}
  return out;
}
function rowMatrixToDict(raw: any, lang: LangCode): Record<string, string> {
  if (!Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const row of raw) {
    const k = typeof row?.Key === "string" ? row.Key.trim() : "";
    if (!k) continue;
    const v = (row?.[lang] ?? row?.en ?? "").toString();
    if (v) out[k] = v;
  }
  return out;
}

function getLauncherLocalesFallback(): string | null {
  const baseLocal = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "Programs")
    : join(app.getPath("home"), "AppData", "Local", "Programs");

  try {
    const dirs = fs.readdirSync(baseLocal, { withFileTypes: true });
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const name = ent.name.toLowerCase();
      if (!name.endsWith("_electron-launcher")) continue;

      const cand = join(baseLocal, ent.name, "resources", "public", "locales");
      if (fs.existsSync(cand)) {
        console.log(`[MAIN i18n] launcher fallback hit: ${cand}`);
        return cand;
      }
    }
  } catch (e) {
    console.warn("[MAIN i18n] fallback scan failed:", (e as any)?.message || e);
  }
  return null;
}

function getLocalesRoot(): { root: string; reason: string } {
  const candidates: Array<{ p: string; why: string }> = [
    { p: join(app.getPath("userData"), "locales"), why: "userData/locales" },
    {
      p: app.isPackaged ? join(process.resourcesPath, "public", "locales")
                        : join(__dirname, "../../public/locales"),
      why: app.isPackaged ? "resources/public/locales" : "dev public/locales"
    },
  ];
  const launcher = getLauncherLocalesFallback();
  if (launcher) candidates.push({ p: launcher, why: "LAUNCHER resources/public/locales (fallback)" });

  for (const c of candidates) {
    if (fs.existsSync(c.p)) return { root: c.p, reason: c.why };
  }
  const last = candidates[candidates.length - 1];
  return { root: last.p, reason: "last fallback" };
}

function loadBundle(lang: LangCode): Record<string, string> {
  const { root, reason } = getLocalesRoot();
  console.log(`[MAIN i18n] try root = ${root} (${reason})`);

  const matrixCommon = join(root, "translations.json");
  const matrixLang   = join(root, lang, "translations.json");
  if (fs.existsSync(matrixCommon)) {
    const raw = readJsonSafe(matrixCommon);
    const dict = rowMatrixToDict(raw, lang);
    console.log(`[MAIN i18n] used matrixCommon, keys=${Object.keys(dict).length}`);
    if (Object.keys(dict).length) return dict;
  }
  if (fs.existsSync(matrixLang)) {
    const raw = readJsonSafe(matrixLang);
    const dict = rowMatrixToDict(raw, lang);
    console.log(`[MAIN i18n] used matrixLang, keys=${Object.keys(dict).length}`);
    if (Object.keys(dict).length) return dict;
  }

  const baseDir = join(root, "en");
  const langDir = join(root, lang);
  console.log(`[MAIN i18n] merge dirs base=${baseDir} files=${listFiles(baseDir).join(",")}`);
  console.log(`[MAIN i18n] merge dirs lang=${langDir} files=${listFiles(langDir).join(",")}`);
  const base = readAllJsonInDir(baseDir);
  const over = lang === "en" ? {} : readAllJsonInDir(langDir);
  const dict = { ...base, ...over };
  console.log(`[MAIN i18n] merged keys=${Object.keys(dict).length}`);
  return dict;
}

/* ─────────────── IPC (Config / Lang / Port) ─────────────── */
ipcMain.handle("config:get", async () => {
  try {
    const res = await loadXmlConfig();
    // 🔥 항상 cfg만 넘긴다 (DEV/PROD 공통)
    return res?.cfg ?? null;
  } catch {
    return null;
  }
});


ipcMain.handle("config:getXml", async () => {
  try {
    const xmlPath = !app.isPackaged ? join(__dirname, "../../public/Config.xml") : join(process.resourcesPath, "public", "Config.xml");
    return fs.readFileSync(xmlPath, "utf-8");
  } catch {
    return "";
  }
});
ipcMain.handle("settings:getLang", () => (loadSavedLang() ?? "en"));
ipcMain.handle("settings:setLang", (_evt, lang: LangCode) => {
  saveLang(lang);
  process.env.APP_LANG = lang;
  return true;
});
ipcMain.handle("i18n:getBundle", () => {
  const lang = (loadSavedLang() ?? "en") as LangCode;
  const dict = loadBundle(lang);
  console.log(`[MAIN i18n] lang=${lang}, keys=${Object.keys(dict).length}`);
  return dict;
});


/* ─────────────── 로컬 API 포트 ─────────────── */
let LOCAL_API_PORT = 4000;
ipcMain.handle("getLocalApiPort", () => LOCAL_API_PORT);

/* ─────────────── 인쇄 모듈 지연 로드 상태 ─────────────── */
let PRINT_MODULE_READY = false;
ipcMain.handle("print:isReady", () => PRINT_MODULE_READY);

// ✅ 프리로드에서 사용하는 보조 IPC
// (중복 핸들러 제거: print:config-info / print:config-reload 는 epcardPrint.ts 에서만 등록)

/* ─────────────── 유틸: Config/포트 준비 ─────────────── */
function isDevMode(): boolean {
  return !app.isPackaged;
}
function getConfigPath(): string {
  return isDevMode() ? join(__dirname, "../../public/Config.xml") : join(process.resourcesPath, "public", "Config.xml");
}
function configExists(): boolean {
  const p = getConfigPath();
  const ok = fs.existsSync(p);
  if (!ok) console.warn(`❌ Config 파일 없음: ${p}`);
  return ok;
}
function readAppNameFromConfig(): string {
  const xml = fs.readFileSync(getConfigPath(), "utf-8");
  const m = xml.match(/<TITLE>\s*([^<]+)\s*<\/TITLE>/i);
  if (!m || !m[1]) throw new Error("❌ Config에 <TITLE> 없음");
  return m[1].trim();
}
function buildAppTitle(title: string): string {
  return `${title}${app.getVersion()}`;
}
async function waitForReady(): Promise<void> {
  let tries = 30;
  while (tries-- > 0) {
    if (LOCAL_API_PORT && configExists()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("plant/port not ready");
}

/* ─────────────── Config에서 PLANT 읽기(탄탄) ─────────────── */
function readPlantFromConfig(cfg: any): string {
  const pickStr = (v: any): string => {
    if (v == null) return "";
    if (typeof v === "string" || typeof v === "number") return String(v).trim();
    if (Array.isArray(v)) return pickStr(v[0]);
    if (typeof v === "object") {
      if ("_" in v) return pickStr((v as any)._);
      if ("#text" in v) return pickStr((v as any)["#text"]);
      const candKeys = ["PLANT_CD", "plant_cd", "PLANT", "plant", "plantCode", "Plant", "plantcode", "plantcd"];
      for (const k of candKeys) {
        if (k in v) return pickStr((v as any)[k]);
        const ku = k.toUpperCase();
        const kl = k.toLowerCase();
        if (ku in v) return pickStr((v as any)[ku]);
        if (kl in v) return pickStr((v as any)[kl]);
      }
    }
    return "";
  };

  const want = new Set(["plant_cd", "plant", "plantcode", "plantcd"]);
  const stack: any[] = [cfg];
  const seen = new Set<any>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, val] of Object.entries(cur)) {
      const key = k.toLowerCase();
      if (want.has(key)) {
        const s = pickStr(val);
        if (s) return s.toUpperCase();
      }
      if (val && typeof val === "object") stack.push(val);
    }
  }

  try {
    const top = Object.keys(cfg || {});
    const set = (cfg as any)?.SETTING ?? (cfg as any)?.setting;
    const common = set?.Common ?? set?.COMMON ?? (cfg as any)?.Common ?? (cfg as any)?.common;
    console.warn("[TIME] PLANT not found in config (deep search). topKeys=", top, "has SETTING=", !!set, "has Common=", !!common);
  } catch {}
  return "";
}

/* ─────────────── 시간 컨텍스트 ─────────────── */
type TimeContext = {
  ok: boolean;
  source: "plant" | "local";
  isOnline: boolean;
  plant: string | null;
  timeZone: string | null;
  serverEpochMs: number | null;
  workDate: string | null;
  raw?: any;
};
let TIME_CONTEXT: TimeContext = {
  ok: false,
  source: "local",
  isOnline: false,
  plant: null,
  timeZone: null,
  serverEpochMs: null,
  workDate: null
};

/* ====== ★★★ 시간 계산 핵심 (최종) ★★★ ====== */
function ymdInTzFromEpoch(epochMs: number, tz: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(epochMs));
}
function fullInTzFromEpoch(epochMs: number, tz: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(epochMs));
}

function normalizeBodyEpochToMs(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  if (n >= 1e15 && n < 1e16) return Math.floor(n / 1000);
  if (n >= 1e12 && n < 1e13) return Math.floor(n);
  if (n >= 1e9 && n < 1e10) return Math.floor(n * 1000);
  return null;
}

function computeFromHeaderAndTz(resp: any, data: any, tz: string) {
  const upstreamDateStr: string | undefined =
    (resp?.headers?.["x-upstream-date"] as any) ||
    data?.header?.upstreamDateGmt ||
    data?.header?.dateGmt ||
    undefined;

  const epochBodyMs = normalizeBodyEpochToMs(
    data?.header?.serverNowEpochMs ?? data?.serverNowEpochMs ?? data?.serverNow ?? null
  );

  const localHeaderDateStr: string | undefined =
    (resp?.headers?.["date"] as any) || (resp?.headers as any)?.["Date"];

  const tryParse = (s?: string | null) => {
    if (!s) return null;
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  };

  const upstreamMs = tryParse(upstreamDateStr);
  const localHdrMs = tryParse(localHeaderDateStr);

  const epoch: number | null = (upstreamMs ?? null) ?? (epochBodyMs ?? null) ?? (localHdrMs ?? null);

  if (!epoch || !tz) {
    return {
      epoch: null,
      workDate: null,
      localFull: null,
      headerDateStr: upstreamDateStr ?? localHeaderDateStr,
      _upstreamDateStr: upstreamDateStr,
      _localHeaderDateStr: localHeaderDateStr,
      _source: "none"
    };
  }

  const workDate = ymdInTzFromEpoch(epoch, tz);
  const localFull = fullInTzFromEpoch(epoch, tz);

  return {
    epoch,
    workDate,
    localFull,
    headerDateStr: upstreamDateStr ?? localHeaderDateStr,
    _upstreamDateStr: upstreamDateStr,
    _localHeaderDateStr: localHeaderDateStr,
    _source: upstreamMs != null ? "upstream-header" : epochBodyMs != null ? "body-epoch" : "local-header"
  };
}

function makeLocalContext(plant: string | null, online: boolean): TimeContext {
  const epoch = Date.now();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    ok: true,
    source: "local",
    isOnline: online,
    plant,
    timeZone: tz,
    serverEpochMs: epoch,
    workDate: ymdInTzFromEpoch(epoch, tz)
  };
}
function withAliases(ctx: TimeContext) {
  return {
    ...ctx,
    timezone: ctx.timeZone,
    workday: ctx.workDate,
    tz: ctx.timeZone,
    currentWorkday: ctx.workDate
  };
}

ipcMain.handle("time:getContext", () => withAliases(TIME_CONTEXT));
ipcMain.handle("time:getSource", () => TIME_CONTEXT.source);
ipcMain.handle("time:getWorkDate", () => TIME_CONTEXT.workDate);
ipcMain.handle("time:getPlantTime", () => withAliases(TIME_CONTEXT));

/* ─────────────── 수동 새로고침 ─────────────── */
ipcMain.handle("time:refreshPlantTime", async () => {
  try {
    await waitForReady();
    const cfg: any = await loadXmlConfig();
    const plant = readPlantFromConfig(cfg);
    const baseURL = `http://127.0.0.1:${LOCAL_API_PORT}`;

    if (!plant) {
      console.warn("[TIME/refresh] PLANT not found → local");
      TIME_CONTEXT = makeLocalContext(null, false);
      return { ok: false, fallback: withAliases(TIME_CONTEXT), error: "PLANT not found in config" };
    }

    try {
      const resp = await axios.get(`${baseURL}/api/sap/plant-timezone`, {
        params: { plant },
        timeout: 10000,
        validateStatus: () => true
      });

      if (resp.status < 200 || resp.status >= 300) {
        console.warn("[TIME/refresh] API non-2xx:", { status: resp.status, data: resp.data });
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = resp.data;
      const tz: string | null = data?.timeZone ?? data?.etpTimezone ?? data?.tz ?? null;

      if (!tz) throw new Error("invalid payload: missing timeZone");
      const { epoch, workDate, localFull, headerDateStr, _upstreamDateStr, _localHeaderDateStr, _source } =
        computeFromHeaderAndTz(resp, data, tz);

      if (!epoch || !workDate) throw new Error(`invalid payload tz=${tz} epoch=${epoch} workDate=${workDate}`);

      TIME_CONTEXT = {
        ok: true,
        source: "plant",
        isOnline: true,
        plant,
        timeZone: tz,
        serverEpochMs: epoch,
        workDate,
        raw: {
          ...data,
          _headerDate: headerDateStr,
          _upstreamHeaderDate: _upstreamDateStr,
          _localHeaderDate: _localHeaderDateStr,
          _localFullInPlantTz: localFull,
          _source
        }
      };
      console.log("[TIME/refresh] OK(header+tz):", {
        plant,
        tz,
        headerDateStr,
        epoch,
        workDate,
        localFull,
        _source
      });
      return { ok: true, data: withAliases(TIME_CONTEXT) };
    } catch (e: any) {
      const ax = e;
      if (ax?.response) {
        console.warn("[TIME/refresh] API error:", { status: ax.response.status, data: ax.response.data });
      } else {
        console.warn("[TIME/refresh] error:", ax?.message || String(ax));
      }
      const ctx = makeLocalContext(TIME_CONTEXT.plant ?? plant ?? null, false);
      TIME_CONTEXT = ctx;
      return { ok: false, fallback: withAliases(ctx), error: ax?.message || "API error" };
    }
  } catch (e: any) {
    console.warn("[TIME/refresh] failed early:", e?.message || String(e));
    const ctx = makeLocalContext(TIME_CONTEXT.plant ?? null, false);
    TIME_CONTEXT = ctx;
    return { ok: false, fallback: withAliases(ctx), error: e?.message || String(e) };
  }
});

/* ─────────────── 프린트 호스트 & 예열/유지(조정) ─────────────── */
let PRINT_HOST: BrowserWindow | null = null;
let KEEPALIVE_TIMER: NodeJS.Timeout | null = null;

// Config.xml 경로: SETTING > PRINT > PASSCARD > DEVICE_NAME
function pickPrinterNameFromConfig(cfg: any): string | undefined {
  const dev =
    cfg?.SETTING?.PRINT?.PASSCARD?.DEVICE_NAME ??
    cfg?.PRINT?.PASSCARD?.DEVICE_NAME ??
    process.env.PRINTER_NAME ??
    undefined;
  const s = typeof dev === "string" ? dev.trim() : undefined;
  return s || undefined;
}

async function ensurePrintHost(_deviceName?: string): Promise<BrowserWindow> {
  if (PRINT_HOST && !PRINT_HOST.isDestroyed()) return PRINT_HOST;

  PRINT_HOST = new BrowserWindow({
    show: false,
    webPreferences: {
      // ✅ offscreen 사용 금지: 크로미움이 문서쿠키 오류를 잘 냄
      offscreen: false,
      backgroundThrottling: false,
      sandbox: false,
    },
  });

  // 빈 문서 로드만 하고 인쇄하지 않음 (쿠키 오류 방지)
  await PRINT_HOST.loadURL("data:text/html,<html><body>print-host</body></html>");
  await new Promise((r) => setTimeout(r, 150));

  PRINT_HOST.on("closed", () => { PRINT_HOST = null; });
  return PRINT_HOST;
}

// ── Keep-Alive helpers ──
type PageSizeUm = { width: number; height: number };

async function lightKeepAlive(deviceName?: string | null, ps?: PageSizeUm, usePdf = false) {
  try {
    const win = await ensurePrintHost(deviceName ?? undefined);
    const page = ps ?? { width: 78000, height: 50000 }; // 78x50mm
    await win.webContents.getPrintersAsync();

    // 가벼운 HTML 주입 (렌더링 파이프라인 유지)
    const html = `<!doctype html><meta charset="utf-8">
      <style>@page{size:${page.width}um ${page.height}um;margin:0}</style>
      <div style="width:1px;height:1px"></div>`;
    await win.webContents.executeJavaScript(
      `document.open();document.write(${JSON.stringify(html)});document.close();`, true
    );

    // 필요 시 PDF 백엔드도 깨움 (BIXOLON 등에서 유리)
    if (usePdf) {
      await win.webContents.printToPDF({ pageSize: page });
    }
  } catch (e) {
    console.warn("[PRINT] lightKeepAlive failed:", (e as any)?.message || e);
  }
}

async function deepKeepAlive(deviceName?: string | null, ps?: PageSizeUm) {
  try {
    const win = await ensurePrintHost(deviceName ?? undefined);
    const page = ps ?? { width: 78000, height: 50000 };
    await new Promise<void>((resolve) => {
      const opts: Electron.WebContentsPrintOptions = {
        silent: true,
        printBackground: false,
        pageSize: page,
        margins: { marginType: "none" },
        ...(deviceName ? { deviceName } : {})
      };
      win.webContents.print(opts, () => resolve());
    });
  } catch (e) {
    console.warn("[PRINT] deepKeepAlive failed:", (e as any)?.message || e);
  }
}

/**
 * 1단계: 0.5초 간격으로 8초(스풀 슬립 경계 강타)
 * 2단계: 이어서 3초 간격으로 총 90초까지 유지 (10초 뒤 재출력 커버)
 */
function burstLightKeepAlive(
  deviceName?: string | null,
  ps?: { width: number; height: number },
  usePdf = false,
  durationMs = 8000,
  intervalMs = 500
) {
  const started = Date.now();
  // 1단계: 초단기 버스트
  const phase1 = setInterval(() => {
    const now = Date.now();
    if (now - started >= durationMs) {
      clearInterval(phase1);
      // 2단계로 전환: 3초 주기, 시작 시점부터 90초까지
      const until = started + 90_000;
      const tick = () => {
        const now2 = Date.now();
        if (now2 >= until) return; // 90초까지
        lightKeepAlive(deviceName, ps, usePdf).catch(() => {});
        setTimeout(tick, 3000);
      };
      tick();
      return;
    }
    lightKeepAlive(deviceName, ps, usePdf).catch(() => {});
  }, Math.max(200, intervalMs));
}



/* ──────────────────────── ▼▼▼ 추가: 예열 유틸 ▼▼▼ ──────────────────────── */

function mmToUm(n: number): number { return Math.max(1, Math.floor(n * 1000)); }
function toNumberSafe(v: any): number | null {
  if (v == null) return null;
  const s = (typeof v === "string" ? v : String(v)).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function pickNumberFromConfig(cfg: any, paths: string[]): number | null {
  for (const p of paths) {
    try {
      const seg = p.split(".");
      let cur: any = cfg;
      for (const k of seg) {
        if (!cur) break;
        const keys = [k, k.toLowerCase(), k.toUpperCase()];
        let next: any = null;
        for (const kk of keys) if (cur && kk in cur) { next = cur[kk]; break; }
        cur = next;
      }
      const raw = cur && (cur._ ?? (cur as any)["#text"] ?? cur);
      const n = toNumberSafe(raw);
      if (n != null) return n;
    } catch {}
  }
  return null;
}
function pickBooleanFromConfig(cfg: any, paths: string[], envKeys: string[] = []): boolean {
  for (const k of envKeys) {
    const v = process.env[k];
    if (v != null) {
      const s = String(v).trim().toLowerCase();
      if (["1","true","yes","y","on"].includes(s)) return true;
      if (["0","false","no","n","off"].includes(s)) return false;
    }
  }
  for (const p of paths) {
    try {
      const seg = p.split(".");
      let cur: any = cfg;
      for (const k of seg) {
        if (!cur) break;
        const keys = [k, k.toLowerCase(), k.toUpperCase()];
        let next: any = null;
        for (const kk of keys) if (cur && kk in cur) { next = cur[kk]; break; }
        cur = next;
      }
      const raw = cur && (cur._ ?? (cur as any)["#text"] ?? cur);
      if (raw == null) continue;
      const s = String(raw).trim().toLowerCase();
      if (["1","true","yes","y","on"].includes(s)) return true;
      if (["0","false","no","n","off"].includes(s)) return false;
    } catch {}
  }
  return false;
}

// Config.xml에서 PASSCARD 용지 크기(mm) → micron
function pickPasscardSizeUmFromConfig(cfg: any): PageSizeUm {
  const wMm = pickNumberFromConfig(cfg, [
    "SETTING.PRINT.PASSCARD.WIDTH_MM", "PRINT.PASSCARD.WIDTH_MM", "PASSCARD.WIDTH_MM"
  ]);
  const hMm = pickNumberFromConfig(cfg, [
    "SETTING.PRINT.PASSCARD.HEIGHT_MM", "PRINT.PASSCARD.HEIGHT_MM", "PASSCARD.HEIGHT_MM"
  ]);
  const w = mmToUm(wMm ?? 50);
  const h = mmToUm(hMm ?? 30);
  return { width: w, height: h };
}

/**
 * 프린터 엔진 완전 예열: 빈 문서 1장 silent print (옵션)
 * 실제 라벨 1장 소모될 수 있으므로 Config/ENV로 opt-in
 */
async function preWarmPrinterEngine(deviceName?: string | null, pageSizeUm?: PageSizeUm) {
  try {
    const win = await ensurePrintHost(deviceName ?? undefined);
    const ps = pageSizeUm ?? { width: 78000, height: 50000 }; // 78x50mm

    await win.webContents.getPrintersAsync();
    const dummyHtml = `
      <!doctype html><meta charset="utf-8">
      <style>@page{size:${ps.width}um ${ps.height}um;margin:0}</style>
      <body><div style="width:1px;height:1px"></div></body>`;

    // 빈 문서 로드
    await win.webContents.executeJavaScript(
      `document.open();document.write(${JSON.stringify(dummyHtml)});document.close();`, true
    );

    // PDF 백엔드 트리거
    await win.webContents.printToPDF({ pageSize: ps });

    // 내부 프린트 파이프라인까지 깨우기(실제 1장 출력)
    await new Promise<void>((resolve) => {
      const opts: Electron.WebContentsPrintOptions = {
        silent: true,
        printBackground: false,
        pageSize: ps,
        margins: { marginType: "none" },
        ...(deviceName ? { deviceName } : {})
      };
      win.webContents.print(opts, () => resolve());
    });

    console.log("[PRINT] FULL preWarmPrinterEngine done (PDF+Print)");
  } catch (e) {
    console.warn("[PRINT] preWarmPrinterEngine failed:", e);
  }
}

/* ──────────────────────── ▲▲▲ 추가: 예열 유틸 ▲▲▲ ──────────────────────── */

function startPrintKeepAlive(_deviceName?: string, intervalMs = 60000) {
  if (KEEPALIVE_TIMER) return;
  KEEPALIVE_TIMER = setInterval(async () => {
    try {
      // 호스트만 보장하고 아무 것도 인쇄하지 않음
      await ensurePrintHost();
    } catch {
      /* noop */
    }
  }, intervalMs);
}

function stopPrintKeepAlive() {
  if (KEEPALIVE_TIMER) {
    clearInterval(KEEPALIVE_TIMER);
    KEEPALIVE_TIMER = null;
  }
}

// 런타임 제어 IPC
ipcMain.handle("print:start-keepalive", async (_e, ms?: number) => {
  const cfg = await loadXmlConfig().catch(() => null);
  const device = pickPrinterNameFromConfig(cfg);
  const interval = typeof ms === "number" && ms > 0 ? ms : Number(process.env.PRINT_KEEPALIVE_MS || 0) || 60000;
  startPrintKeepAlive(device, interval);
  return { ok: true, device, interval };
});
ipcMain.handle("print:stop-keepalive", async () => {
  stopPrintKeepAlive();
  return { ok: true };
});

/* ─────────────── 윈도우 생성 ─────────────── */
function createWindow(appName: string): BrowserWindow {
  const iconPath = is.dev ? join(app.getAppPath(), "src/renderer/resources/icon.png") : join(process.resourcesPath, "icon.png");
  const iconImage = nativeImage.createFromPath(iconPath);
  const fixedTitle = buildAppTitle(appName);

  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: fixedTitle,
    show: false,
    autoHideMenuBar: true,
    icon: iconImage,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  mainWindow.on("page-title-updated", (e) => {
    e.preventDefault();
    mainWindow.setTitle(fixedTitle);
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.setTitle(fixedTitle);
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  const rendererURL = process.env["ELECTRON_RENDERER_URL"];
  if (is.dev && rendererURL) mainWindow.loadURL(rendererURL);
  else mainWindow.loadFile(join(__dirname, "../renderer/index.html"));

  return mainWindow;
}

/* ─────────────── ★ SAP ENV 주입 헬퍼 (최종) ─────────────── */
function toStr(v: any): string {
  if (v == null) return "";
  return typeof v === "string" ? v.trim() : String(v).trim();
}
function applySapEnvFromConfig(cfg: any) {
  const sap = cfg?.SAP ?? cfg?.Sap ?? cfg?.sap;
  if (!sap) return;

  const tokenUrl    = toStr(sap.TOKEN_URL     ?? sap.TokenUrl     ?? sap.token_url);
  const clientId    = toStr(sap.CLIENT_ID     ?? sap.ClientId     ?? sap.client_id);
  const clientSecret= toStr(sap.CLIENT_SECRET ?? sap.ClientSecret ?? sap.client_secret);
  const apiBase     = toStr(sap.API_BASE      ?? sap.ApiBase      ?? sap.api_base);

  // 접두어 O 버전
  if (tokenUrl    && !process.env.SAP_TOKEN_URL)     process.env.SAP_TOKEN_URL     = tokenUrl;
  if (clientId    && !process.env.SAP_CLIENT_ID)     process.env.SAP_CLIENT_ID     = clientId;
  if (clientSecret&& !process.env.SAP_CLIENT_SECRET) process.env.SAP_CLIENT_SECRET = clientSecret;
  if (apiBase     && !process.env.SAP_API_BASE)      process.env.SAP_API_BASE      = apiBase;

  // 접두어 X(서버가 이 이름을 찾음) ★★ 여기가 핵심
  if (tokenUrl    && !process.env.TOKEN_URL)     process.env.TOKEN_URL     = tokenUrl;
  if (clientId    && !process.env.CLIENT_ID)     process.env.CLIENT_ID     = clientId;
  if (clientSecret&& !process.env.CLIENT_SECRET) process.env.CLIENT_SECRET = clientSecret;
  if (apiBase     && !process.env.API_BASE)      process.env.API_BASE      = apiBase;

  console.log("[MAIN] SAP env mapped from Config.xml:", {
    TOKEN_URL:         process.env.TOKEN_URL         ? "(set)" : "(missing)",
    CLIENT_ID:         process.env.CLIENT_ID         ? "(set)" : "(missing)",
    CLIENT_SECRET:     process.env.CLIENT_SECRET     ? "(set)" : "(missing)",
    API_BASE:          process.env.API_BASE          || "(missing)",
    SAP_TOKEN_URL:     process.env.SAP_TOKEN_URL     ? "(set)" : "(missing)",
    SAP_CLIENT_ID:     process.env.SAP_CLIENT_ID     ? "(set)" : "(missing)",
    SAP_CLIENT_SECRET: process.env.SAP_CLIENT_SECRET ? "(set)" : "(missing)",
    SAP_API_BASE:      process.env.SAP_API_BASE      || "(missing)",
  });
}


/* ─────────────── 부팅 플로우 ─────────────── */
let BOOT_BROADCAST_DONE = false;

// ===== PASSCARD IPC STUBS (로드 전 호출 대비) =====
function installPrintIpcStubs() {
  const ensure = (channel: string, fn: (e: any, ...a: any[]) => any) => {
    try {
      ipcMain.handle(channel, fn);
      console.log(`[MAIN] stub installed for '${channel}'`);
    } catch {
      // 이미 등록된 경우는 패스
    }
  };

  ensure("print:config-info", async () => {
    let cfg: any = null;
    try {
      cfg = await loadXmlConfig();
    } catch {}
    return {
      ok: true,
      file: "(main stub: Config.xml)",
      cfg,
      API_BASE: process.env.ESCAN_KEYIN_API_BASE || process.env.API_BASE || "http://127.0.0.1:4000/api/mssql",
      _stub: true
    };
  });

  ensure("print:config-reload", async () => {
    let cfg: any = null;
    try {
      cfg = await loadXmlConfig();
    } catch {}
    return {
      ok: true,
      file: "(main stub: Config.xml)",
      cfg,
      API_BASE: process.env.ESCAN_KEYIN_API_BASE || process.env.API_BASE || "http://127.0.0.1:4000/api/mssql",
      _stub: true
    };
  });

  ensure("print:list", async () => {
    const w = BrowserWindow.getAllWindows()[0] || new BrowserWindow({ show: false });
    try {
      return await (w.webContents.getPrintersAsync?.() ?? Promise.resolve([]));
    } catch {
      return [];
    }
  });

  ensure("print:passcards", async () => {
    return { ok: false, accepted: 0, mode: "silent", error: "PRINT_MODULE_NOT_READY (stub)" };
  });

  ensure("passcard:print-batch", async () => {
    return { ok: false, accepted: 0, mode: "silent", error: "PRINT_MODULE_NOT_READY (stub)" };
  });

  ensure("epcard:print", async () => {
    return { ok: false, error: "PRINT_MODULE_NOT_READY (stub)" };
  });

  ensure("print:diag", async () => {
    return { ok: false, error: "PRINT_MODULE_NOT_READY (stub)" };
  });
}
installPrintIpcStubs();

console.log("[MAIN] boot…");
app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");
  app.on("browser-window-created", (_, window) => optimizer.watchWindowShortcuts(window));

  const currentLang = initLanguageAtBoot();
  console.log("[MAIN] language =", currentLang);
  applyAppMenu();

  if (!configExists()) {
    app.quit();
    return;
  }

  // ⬇️ SAP ENV 를 서버 기동 전에 주입 (중요!)
  try {
    const earlyCfg = await loadXmlConfig();
    applySapEnvFromConfig(earlyCfg);
  } catch (e) {
    console.warn("[MAIN] loadXmlConfig (early) failed for SAP env mapping:", (e as any)?.message || e);
  }

  const loadPrintPromise = tryLoadPrintModule();

  // ⬇️ 로컬 API 서버 기동 (이미 env가 준비된 상태)
  const { port, reused } = await ensureLocalApiServer({
    preferredPort: 4000,
    host: "127.0.0.1",
    mode: "isolated",
    forceNew: true,
  });
  LOCAL_API_PORT = port;
  console.log("[LOCAL API] ready:", { port, reused });

  registerWarmupIpc();
  const baseURL = `http://127.0.0.1:${LOCAL_API_PORT}`;
  setWarmupBaseUrl(baseURL);

  let title = "E-Scan";
  try {
    title = readAppNameFromConfig();
  } catch (e) {
    console.warn("[MAIN] TITLE fallback:", e);
  }

  // ✅ (INTER_FACE) 메인 UI 로드 전에 반드시 확보 (FAIL이면 종료)
  try {
    const { ensureInterfaceBeforeMainUI } = await import("@main/utils/interfaceBoot");

    // electron-vite dev 서버 주소(보통 http://localhost:5173)
    const rendererURL = process.env["ELECTRON_RENDERER_URL"];

    const r = await ensureInterfaceBeforeMainUI({ parent: null, rendererURL });

    console.log("[MAIN] INTER_FACE ensure result:", r);

    if (!r.ok) {
      console.error("[MAIN] INTER_FACE setup failed:", r.reason);
      app.quit();
      return;
    }

    // ✅ 성공이면 여기서만 계속 진행
  } catch (e) {
    console.warn("[MAIN] ensureInterfaceBeforeMainUI error:", e);
    app.quit();
    return;
  }


  const mainWindow = createWindow(title);

   // ============================================
  // 🔥 여기에 추가 (런처가 userData 경로 요청할 때 사용)
  // ============================================
  ipcMain.handle("main:getUserDataPath", () => {
    return app.getPath("userData");
  });
  // ============================================

  // 🔥 (A) 앱 시작 직후 “즉시 예열”: 스풀러/드라이버 깨우기(첫 장 딜레이 제거 핵심)
  try {
    const cfgEarly = await loadXmlConfig().catch(() => null);
    const deviceEarly = pickPrinterNameFromConfig(cfgEarly);
    await ensurePrintHost(deviceEarly);
    console.log("[PRINT] early host ready", deviceEarly ? `(device=${deviceEarly})` : "");

    // Config/ENV로 prewarm 여부 결정 (기본 off)
    // ENV: PRINT_PREWARM=1 → 강제 예열
    // Config: <PREWARM_FIRST_PRINT>1</PREWARM_FIRST_PRINT> 또는 <PREWARM>1</PREWARM>
    const enablePreWarm = pickBooleanFromConfig(
      cfgEarly,
      ["SETTING.PRINT.PASSCARD.PREWARM_FIRST_PRINT", "PRINT.PASSCARD.PREWARM_FIRST_PRINT", "SETTING.PRINT.PASSCARD.PREWARM", "PRINT.PASSCARD.PREWARM"],
      ["PRINT_PREWARM"]
    );

    if (enablePreWarm) {
      const psEarly = pickPasscardSizeUmFromConfig(cfgEarly);
      await preWarmPrinterEngine(deviceEarly, psEarly);
      console.log("[PRINT] early warm print completed");
    } else {
      console.log("[PRINT] prewarm disabled (Config/ENV)");
    }
    /* ── 2-a: 시작 직후 ‘버스트’ 유지로 2번째도 2~3초대 유도 (라벨 소모 없음) ── */
    try {
      const psEarly = pickPasscardSizeUmFromConfig(cfgEarly);
      const started = Date.now();
      const burst = setInterval(() => {
        if (Date.now() - started >= 8000) { // 총 8초만 유지
          clearInterval(burst);
          return;
        }
        // 가벼운 예열: 렌더링/스풀러 파이프라인만 계속 깨워둠
        lightKeepAlive(deviceEarly, psEarly).catch(() => {});
      }, 500); // 0.5초 간격으로 티클
      console.log("[PRINT] burst light keep-alive started (8s @ 500ms)");
    } catch (e) {
      console.warn("[PRINT] burst light keep-alive skipped:", (e as any)?.message || e);
    }

  } catch (e) {
    console.warn("[PRINT] early warmup failed (continue):", (e as any)?.message || e);
  }

  try {
    await waitForReady();
    const cfg: any = await loadXmlConfig();
    const plant = readPlantFromConfig(cfg);
    const baseURL2 = `http://127.0.0.1:${LOCAL_API_PORT}`;

    if (plant) {
      try {
        const resp = await axios.get(`${baseURL2}/api/sap/plant-timezone`, {
          params: { plant },
          timeout: 10000,
          validateStatus: () => true
        });

        if (resp.status < 200 || resp.status >= 300) {
          console.warn("[TIME/init] API non-2xx:", { status: resp.status, data: resp.data });
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = resp.data;
        const tz: string | null = data?.timeZone ?? data?.etpTimezone ?? data?.tz ?? null;

        if (tz) {
          const { epoch, workDate, localFull, headerDateStr, _upstreamDateStr, _localHeaderDateStr, _source } =
            computeFromHeaderAndTz(resp, data, tz);

          if (epoch && workDate) {
            TIME_CONTEXT = {
              ok: true,
              source: "plant",
              isOnline: true,
              plant,
              timeZone: tz,
              serverEpochMs: epoch,
              workDate,
              raw: {
                ...data,
                _headerDate: headerDateStr,
                _upstreamHeaderDate: _upstreamDateStr,
                _localHeaderDate: _localHeaderDateStr,
                _localFullInPlantTz: localFull,
                _source
              }
            };
            console.log("[TIME/init] OK(header+tz):", { plant, tz, headerDateStr, epoch, workDate, localFull, _source });
          } else {
            console.warn("[TIME/init] payload insufficient → local fallback", { tz, epoch, workDate });
            TIME_CONTEXT = makeLocalContext(plant, false);
          }
        } else {
          console.warn("[TIME/init] missing tz → local fallback");
          TIME_CONTEXT = makeLocalContext(plant, false);
        }
      } catch (e: any) {
        const ax = e;
        if (ax?.response) {
          console.warn("[TIME/init] API error:", { status: ax.response.status, data: ax.response.data });
        } else {
          console.warn("[TIME/init] error:", ax?.message || String(ax));
        }
        TIME_CONTEXT = makeLocalContext(plant, false);
      }
    } else {
      console.warn("[TIME/init] PLANT not found → local fallback");
      TIME_CONTEXT = makeLocalContext(null, false);
    }

    // ★ (B) 프린터 예열(설정 프린터 반영) + 선택적 keep-alive
    try {
      const device = pickPrinterNameFromConfig(cfg);
      await ensurePrintHost(device);

      const ka = Number(process.env.PRINT_KEEPALIVE_MS || 0);
      if (ka > 0) {
        startPrintKeepAlive(device, ka);
        console.log(`[PRINT] keep-alive started (interval=${ka}ms)`);
      }

      // ▼▼▼ 추가: Light/Deep keep-alive 설정 읽기 ▼▼▼
      const pageSize = pickPasscardSizeUmFromConfig(cfg);

      // BIXOLON 계열은 PDF 백엔드까지 예열하는 게 유리 → 기본 on
      const usePdfWarm =
        pickBooleanFromConfig(cfg, [
          "SETTING.PRINT.PASSCARD.LIGHT_KEEPALIVE_PDF",
          "PRINT.PASSCARD.LIGHT_KEEPALIVE_PDF"
        ], ["PRINT_LIGHT_KEEPALIVE_PDF"]) || /bixolon|srp-330/i.test(String(device || ""));

      // Light keep-alive — 기본값 2초로 ‘공격적’으로 낮춤
      const lightMs =
        Number(process.env.PRINT_LIGHT_KEEPALIVE_MS || 0) ||
        (pickNumberFromConfig(cfg, [
          "SETTING.PRINT.PASSCARD.LIGHT_KEEPALIVE_MS",
          "PRINT.PASSCARD.LIGHT_KEEPALIVE_MS"
        ]) ?? 2000);

      if (lightMs > 0) {
        // ✅ 즉시 1회 (현재 시점이 “첫 장 이후 슬립 경계”일 수 있으니 바로 티클)
        await lightKeepAlive(device, pageSize, usePdfWarm).catch(() => {});

        // ✅ 5~8초간 버스트로 경계를 넘겨버림(두번째도 2~3초 목표)
        burstLightKeepAlive(device, pageSize, usePdfWarm, 8000, 500);

        // ✅ 이후엔 주기적으로 가볍게 유지
        setInterval(() => { lightKeepAlive(device, pageSize, usePdfWarm); }, lightMs);
        console.log(`[PRINT] light keep-alive ON (${lightMs}ms, pdf=${usePdfWarm})`);
      } else {
        console.log("[PRINT] light keep-alive OFF");
      }

      // Deep keep-alive (옵션) — 기본 OFF (라벨 1장 소모)
      const deepEnable =
        pickBooleanFromConfig(cfg, [
          "SETTING.PRINT.PASSCARD.DEEP_KEEPALIVE",
          "PRINT.PASSCARD.DEEP_KEEPALIVE"
        ], ["PRINT_DEEP_KEEPALIVE"]);

      const deepMin =
        Number(process.env.PRINT_DEEP_KEEPALIVE_MIN || 0) ||
        (pickNumberFromConfig(cfg, [
          "SETTING.PRINT.PASSCARD.DEEP_KEEPALIVE_MIN",
          "PRINT.PASSCARD.DEEP_KEEPALIVE_MIN"
        ]) ?? 0);

      if (deepEnable && deepMin > 0) {
        const deepMs = Math.max(1, deepMin) * 60_000;
        setInterval(() => { deepKeepAlive(device, pageSize); }, deepMs);
        console.log(`[PRINT] deep keep-alive ON (${deepMin}min) — consumes 1 blank`);
      } else {
        console.log("[PRINT] deep keep-alive OFF");
      }
      // ▲▲▲ 추가 끝 ▲▲▲


    } catch (e) {
      console.warn("[PRINT] warmup setup skipped:", (e as any)?.message || e);
    }
  } catch (e) {
    console.warn("⚠️ TIME_CONTEXT init failed, fallback local:", e);
    TIME_CONTEXT = makeLocalContext(null, false);
  }

  mainWindow.webContents.once("did-finish-load", () => {
    if (!BOOT_BROADCAST_DONE) {
      mainWindow.webContents.send("plant-time:ready", withAliases(TIME_CONTEXT));
      BOOT_BROADCAST_DONE = true;
    }
  });

  // (C) Warmup HTTP 핑 1회
  warmupOnce(baseURL).catch(() => {});

  // (D) epcardPrint 모듈 로딩 결과 브로드캐스트
  loadPrintPromise.then((ok) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("print:module-ready", { ok });
    }
  });
});

let BOOTING = true;

// ensure 성공 직후
BOOTING = false;

app.on("before-quit", () => {
  void stopLocalApiServer().catch(() => {});
});

app.on("window-all-closed", (e: Electron.Event) => {
  if (BOOTING) {
    e.preventDefault();
    return;
  }
  if (process.platform !== "darwin") app.quit();
});




async function tryLoadPrintModule(): Promise<boolean> {
  if (process.env.DISABLE_PRINT === "1") {
    console.warn("[MAIN] print disabled by env");
    PRINT_MODULE_READY = false;
    return false;
  }

  try {
    // ➊ Vite가 소스 경로 기준으로 생성하는 동적 임포트 로더 사용
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Vite 환경에서만 제공되는 import.meta.glob (런타임 정상)
    const globLoaders: Record<string, () => Promise<unknown>> = import.meta.glob(
      "./epcardPrint.{ts,js}",
      { eager: false }
    );

    const loader = Object.values(globLoaders)[0];
    if (loader) {
      [
        "print:config-info","print:config-reload","print:list","print:passcards",
        "passcard:print-batch","epcard:print","print:diag",
      ].forEach(ch => { try { ipcMain.removeHandler(ch); } catch {} });

      await loader(); // ← 실제 로드
      console.log("[MAIN] epcardPrint loaded via import.meta.glob");
      PRINT_MODULE_READY = true;
      return true;
    }
  } catch (e) {
    console.warn("[MAIN] glob import failed, will fallback:", e);
  }

  // ➋ (폴백) 기존 고정/스캔 후보 로딩 로직 유지
  try {
    const hashed: string[] =
      fs.readdirSync(__dirname)
        .filter((f) => /^epcardPrint(?:-[A-Za-z0-9._]+)?\.js$/.test(f))
        .map((f) => path.resolve(__dirname, f));

    const candidates = [
      ...hashed,
      path.resolve(__dirname, "./epcardPrint.js"),
      path.resolve(__dirname, "./epcardPrint.cjs"),
      path.resolve(__dirname, "./epcardPrint"),
      path.resolve(__dirname, "../main/epcardPrint.js"),
      path.resolve(__dirname, "../main/epcardPrint"),
      path.resolve(process.cwd(), "dist/main/epcardPrint.js"),
      path.resolve(process.cwd(), "out/main/epcardPrint.js"),
    ];

    let loaded = false;
    let lastErr: any = null;

    for (const abs of candidates) {
      try {
        [
          "print:config-info",
          "print:config-reload",
          "print:list",
          "print:passcards",
          "passcard:print-batch",
          "epcard:print",
          "print:diag",
        ].forEach((ch) => { try { ipcMain.removeHandler(ch); } catch {} });

        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require(abs);
        } catch {
          await import(pathToFileURL(abs).href);
        }
        console.log("[MAIN] epcardPrint loaded:", abs);
        loaded = true;
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    PRINT_MODULE_READY = loaded;
    if (!loaded) {
      console.error("❌ [MAIN] epcardPrint load failed (all candidates):", lastErr);
      installPrintIpcStubs();
    }
    return loaded;
  } catch (e) {
    PRINT_MODULE_READY = false;
    console.error("❌ [MAIN] epcardPrint load failed (exception):", e);
    installPrintIpcStubs();
    return false;
  }
  
}
