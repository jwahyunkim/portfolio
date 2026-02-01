// C:\Changshin\test\electron-app_final\src\preload\index.ts
import { contextBridge, ipcRenderer } from "electron";
import { electronAPI as toolkitElectronAPI } from "@electron-toolkit/preload";

/* ───────── types ───────── */
type Listener<T = any> = (data: T) => void;

type PasscardPrintOptions = {
  deviceName?: string;
  preview?: boolean;
  previewCountAsPrint?: boolean;
  widthMicrons?: number;
  heightMicrons?: number;
  batchId?: string;
  [k: string]: unknown;
};

type AnyObj = Record<string, any>;
type PasscardLogMsg = { tag: string; payload: any; level: "info" | "warn" | "error"; ts: string };

type PageSizeMM = { widthMM: number; heightMM: number };
type EpcardPrintArgs = {
  deviceName?: string;
  pageSize?: PageSizeMM;
  url?: string;
  preview?: boolean;
};

/* ───────── utils ───────── */
const toBool = (v: any) => {
  const s = String(v ?? "").trim().toUpperCase();
  return ["Y", "YES", "TRUE", "T", "1"].includes(s);
};
const asNum = (v: any, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const deepMerge = (a: AnyObj = {}, b: AnyObj = {}): AnyObj => {
  const out: AnyObj = Array.isArray(a) ? [...a] : { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object" &&
      out[k] &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k], v as AnyObj);
    } else {
      out[k] = v;
    }
  }
  return out;
};

const normStr = (v: any): string => {
  const s = v == null ? "" : String(v);
  return s.trim();
};
const normUpper = (v: any): string => normStr(v).toUpperCase();

/* ───────── config normalize ───────── */
function normalizeConfig(raw: AnyObj | null | undefined): AnyObj {
  const r: AnyObj = raw ?? {};
  const SETTING: AnyObj =
    r.SETTING ??
    r.setting ?? {
      Common: r.Common ?? r.common ?? (typeof r.input !== "undefined" ? { INPUT: r.input } : {}),
      PRINT: r.PRINT ?? r.Print ?? r.print ?? {},
      DBSQL:
        r.DBSQL ??
        r.dbsql ??
        (r.db ? { USR: r.db.user, PWD: r.db.password, DATA_SOURCE: r.db.host, DB_NAME: r.db.database } : {}),
    };

  const Common = SETTING.Common ?? {};
  const PRINT = SETTING.PRINT ?? {};
  const PASSCARD = PRINT.PASSCARD ?? PRINT.Passcard ?? r.PASSCARD ?? {};

  return {
    ...r,
    SETTING,
    Common,
    PRINT: { ...PRINT, PASSCARD },
    input: typeof r.input !== "undefined" ? r.input : Common.INPUT,
    DBSQL: SETTING.DBSQL ?? r.DBSQL ?? {},
  };
}

/* ───────── 렌더러 dev 여부 헬퍼 ───────── */
function isDevRendererEnv(): boolean {
  try {
    const g: any = globalThis as any;
    const loc = g?.window?.location ?? g?.location;
    return !!loc && loc.protocol === "http:";
  } catch {
    return false;
  }
}

/* ───────── merge: main(xml) 우선 ───────── */
async function fetchMergedConfig(): Promise<{ cfg: AnyObj; source: string }> {
  let client: AnyObj | null = null;
  let main: AnyObj | null = null;

  const isDevRenderer = isDevRendererEnv();

  // 1) dev 렌더러에서만 client loader 사용
  if (isDevRenderer) {
    try {
      // @ts-ignore
      const mod = await import("../renderer/utils/loadConfigClient");
      const cfgClient = await (mod as any).loadConfigClient();
      if (cfgClient) client = normalizeConfig(cfgClient as AnyObj);
    } catch (err) {
      console.warn("[Config] client typed loader 실패(dev renderer):", err);
      client = null;
    }
  }

  // 2) main(xml) IPC
  let mainRaw: AnyObj | null = null;
  try {
    mainRaw = await ipcRenderer.invoke("config:get");
  } catch (e) {
    console.warn("[Config] ipcRenderer.invoke('config:get') 실패:", e);
  }
  main = normalizeConfig(mainRaw as AnyObj);

  // 3) merge
  const cfg = deepMerge(client ?? {}, main ?? {});
  const parts: string[] = [];
  if (mainRaw) parts.push("main(xml)");
  if (client && isDevRenderer) parts.push("client");
  const source = parts.join("+") || "none";

  return { cfg, source };
}

/* ───────── PASSCARD options ───────── */
let previewOverride: boolean | undefined;
let previewCountAsPrintOverride: boolean | undefined;

/**
 * ✅ 핵심 변경:
 * - Config의 PASSCARD.DEVICE_NAME(예: POS-80C)가
 *   현재 "기본 프린터 이름"과 다르면(불일치)
 *   -> 강제 옵션(deviceName/width/height/preview/previewCountAsPrint)을 전부 제거
 *   -> 메인 쪽이 "기본 프린터 설정"으로 출력하도록 유도
 *
 * 전제:
 * - main의 print:passcards / epcard:print 구현이
 *   deviceName이 undefined/null이면 기본 프린터로 보내는 구조여야 함.
 */
async function getPasscardOptions(): Promise<PasscardPrintOptions> {
  const { cfg, source } = await fetchMergedConfig();

  const pass =
    cfg?.SETTING?.PRINT?.PASSCARD ??
    cfg?.PRINT?.PASSCARD ??
    cfg?.Print?.PASSCARD ??
    cfg?.PRINT?.Passcard ??
    cfg?.Passcard ??
    cfg?.PASSCARD ??
    {};

  const rawPreview =
    pass.PREVIEW ?? pass.preview ?? cfg?.SETTING?.PRINT?.PREVIEW ?? cfg?.PRINT?.PREVIEW ?? cfg?.preview ?? "";

  const rawCount =
    pass.PREVIEW_COUNT_AS_PRINT ??
    pass.preview_count_as_print ??
    pass.previewCountAsPrint ??
    cfg?.previewCountAsPrint ??
    cfg?.PREVIEW_COUNT_AS_PRINT ??
    "";

  const deviceNameRaw = pass.DEVICE_NAME ?? pass.deviceName ?? cfg?.deviceName;
  const deviceNameCfg = normStr(deviceNameRaw);
  const deviceName = deviceNameCfg !== "" ? deviceNameCfg : undefined;

  const widthMm = asNum(pass.WIDTH_MM ?? pass.width_mm ?? pass.widthMm ?? cfg?.widthMM ?? cfg?.WIDTH_MM, 79);
  const heightMm = asNum(pass.HEIGHT_MM ?? pass.height_mm ?? pass.heightMm ?? cfg?.heightMM ?? cfg?.HEIGHT_MM, 54);

  const preview = typeof previewOverride === "boolean" ? previewOverride : toBool(rawPreview);
  const previewCountAsPrint =
    typeof previewCountAsPrintOverride === "boolean" ? previewCountAsPrintOverride : toBool(rawCount);

  // ✅ 기본 프린터 이름 가져오기 (main 쪽 print:list에서 "default" 정보가 있어야 함)
  let defaultPrinterName: string | null = null;
  try {
    const list = (await ipcRenderer.invoke("print:list")) as any;
    const arr: any[] = Array.isArray(list) ? list : Array.isArray(list?.printers) ? list.printers : [];
    const def =
      arr.find((p) => p?.isDefault === true) ||
      arr.find((p) => p?.default === true) ||
      arr.find((p) => p?.is_default === true) ||
      arr.find((p) => p?.name && typeof p?.name === "string" && p?.name.length > 0 && p?.isDefault);
    defaultPrinterName = def?.name ? normStr(def.name) : null;
  } catch (e) {
    // default 못 얻어도 동작은 유지(이 경우엔 강제 옵션 그대로)
    defaultPrinterName = null;
  }

  // ✅ 불일치 판단 (둘 다 있을 때만 비교)
  const cfgUpper = deviceName ? normUpper(deviceName) : "";
  const defUpper = defaultPrinterName ? normUpper(defaultPrinterName) : "";
  const mismatch = !!(cfgUpper && defUpper && cfgUpper !== defUpper);

  // mismatch면 강제 옵션 제거 → 기본 프린터/기본 설정으로 출력
  const out: PasscardPrintOptions = mismatch
    ? {
        // 일부러 아무것도 강제하지 않음 (main이 default printer로 처리)
        deviceName: undefined,
        preview: undefined,
        widthMicrons: undefined,
        heightMicrons: undefined,
        previewCountAsPrint: undefined,
      }
    : {
        deviceName,
        preview,
        widthMicrons: Math.round(widthMm * 1000),
        heightMicrons: Math.round(heightMm * 1000),
        previewCountAsPrint,
      };

  console.log("[PASSCARD] config source =", source);
  console.log("[PASSCARD] cfg DEVICE_NAME =", deviceName ?? "(none)");
  console.log("[PASSCARD] default printer =", defaultPrinterName ?? "(unknown)");
  console.log("[PASSCARD] mismatch =", mismatch);
  console.log("[PASSCARD] options =", out);

  return out;
}

async function mergePasscardOptions(opts?: PasscardPrintOptions): Promise<PasscardPrintOptions> {
  const base = await getPasscardOptions();
  const merged: PasscardPrintOptions = { ...base, ...opts };
  if (typeof merged.deviceName === "string" && merged.deviceName.trim() === "") delete merged.deviceName;
  return merged;
}

/* ───────── legacy APIs ───────── */
const api = {
  getConfig: async () => {
    try {
      const { cfg } = await fetchMergedConfig();
      return cfg;
    } catch (err) {
      console.error("❌ preload에서 config 로드 실패:", err);
      return null;
    }
  },
  getLocalApiPort: () => ipcRenderer.invoke("getLocalApiPort"),
};

const i18n = {
  getLang: () => ipcRenderer.invoke("settings:getLang"),
  setLang: (lang: "en" | "ko-KR" | "vi" | "zh-Hans" | "id") => ipcRenderer.invoke("settings:setLang", lang),
  getBundle: (lang?: string) => ipcRenderer.invoke("i18n:getBundle", lang),
};

const langEvents = {
  onChanged: (cb: (code: string) => void) => {
    const handler = (_: unknown, code: string) => {
      try {
        cb(code);
      } catch (e) {
        console.warn("langEvents cb error:", e);
      }
    };
    ipcRenderer.on("lang:changed", handler);
    return () => ipcRenderer.removeListener("lang:changed", handler);
  },
};

const print = {
  passcards: async (jobs: any[], options?: PasscardPrintOptions) => {
    const merged = await mergePasscardOptions(options);
    const payload = { batchId: merged.batchId, jobs, options: merged };
    return ipcRenderer.invoke("print:passcards", payload);
  },
};

const printer = {
  printPasscard: async (opts: {
    deviceName?: string;
    pageSize?: { widthMM: number; heightMM: number };
    url?: string;
    preview?: boolean;
  }) => {
    const merged = await mergePasscardOptions({
      deviceName: opts?.deviceName,
      preview: opts?.preview,
      widthMicrons: opts?.pageSize ? Math.round(opts.pageSize.widthMM * 1000) : undefined,
      heightMicrons: opts?.pageSize ? Math.round(opts.pageSize.heightMM * 1000) : undefined,
    });
    return ipcRenderer.invoke("epcard:print", {
      deviceName: merged.deviceName,
      preview: merged.preview,
      pageSize: opts?.pageSize
        ? opts.pageSize
        : merged.widthMicrons && merged.heightMicrons
        ? { widthMM: merged.widthMicrons / 1000, heightMM: merged.heightMicrons / 1000 }
        : undefined,
      url: opts?.url,
    });
  },
  list: () => ipcRenderer.invoke("print:list"),
};

async function getMainConfigInfo() {
  return ipcRenderer.invoke("print:config-info");
}
async function reloadMainConfig() {
  return ipcRenderer.invoke("print:config-reload");
}

function onPasscardLog(cb: (msg: PasscardLogMsg) => void) {
  const handler = (_: unknown, msg: PasscardLogMsg) => {
    try {
      const label = `[PASSCARD][MAIN→RDR][${msg.tag}]`;
      if (msg.level === "error") console.error(label, msg.payload);
      else if (msg.level === "warn") console.warn(label, msg.payload);
      else console.info(label, msg.payload);

      queueMicrotask(() => {
        try {
          cb?.(msg);
        } catch (e) {
          console.warn("onPasscardLog cb error(microtask):", e);
        }
      });
    } catch (e) {
      console.warn("onPasscardLog handler error:", e);
    }
  };
  ipcRenderer.on("passcard:log", handler);
  return () => ipcRenderer.removeListener("passcard:log", handler);
}

/* ───────── time bridge ───────── */
type TimeContext = {
  ok: boolean;
  source: "plant" | "local";
  isOnline: boolean;
  plant: string | null;
  timeZone: string | null;
  serverEpochMs: number | null;
  workDate: string | null;
  raw?: any;
  nowMs?: number;
};

const timeBridge = {
  getContext: (): Promise<TimeContext> => ipcRenderer.invoke("time:getContext"),
  getSource: (): Promise<"plant" | "local"> => ipcRenderer.invoke("time:getSource"),
  refresh: () => ipcRenderer.invoke("time:refreshPlantTime"),
  refreshPlantTime: () => ipcRenderer.invoke("time:refreshPlantTime"),
  onReadyOnce: (cb: (data: TimeContext) => void) => {
    const handler = (_: unknown, data: TimeContext) => {
      try {
        cb(data);
      } catch (e) {
        console.warn("timeBridge.onReadyOnce cb error:", e);
      }
    };
    ipcRenderer.once("plant-time:ready", handler);
    return () => ipcRenderer.removeListener("plant-time:ready", handler);
  },
};

/* ───────── unified electronAPI ───────── */
const unifiedElectronAPI = {
  // config
  getConfig: api.getConfig,
  getConfigXml: () => ipcRenderer.invoke("config:getXml"),

  // i18n + settings
  getLang: i18n.getLang,
  setLang: (lang: string) => ipcRenderer.invoke("settings:setLang", lang),
  getI18nBundle: (lang?: string) => ipcRenderer.invoke("i18n:getBundle", lang),
  onLangChanged: (cb: (lang: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, lang: string) => cb(lang);
    ipcRenderer.on("lang:changed", handler);
    return () => ipcRenderer.removeListener("lang:changed", handler);
  },
  setLangAndGetBundle: async (lang: string) => {
    await ipcRenderer.invoke("settings:setLang", lang);
    return ipcRenderer.invoke("i18n:getBundle", lang);
  },

  // local api
  getLocalApiPort: api.getLocalApiPort,

  // time
  timeGetContext: () => ipcRenderer.invoke("time:getContext"),
  timeGetSource: () => ipcRenderer.invoke("time:getSource"),
  timeGetWorkDate: () => ipcRenderer.invoke("time:getWorkDate"),
  timeGetPlantTime: () => ipcRenderer.invoke("time:getPlantTime"),
  timeRefresh: () => ipcRenderer.invoke("time:refreshPlantTime"),
  onPlantTimeReady: (cb: Listener) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on("plant-time:ready", handler);
    return () => ipcRenderer.removeListener("plant-time:ready", handler);
  },

  // ✅ boot-interface 완료 notify
  bootInterfaceDone: (payload: any) => ipcRenderer.send("interface:boot-done", payload),

  // print keepalive
  printIsReady: () => ipcRenderer.invoke("print:isReady"),
  printStartKeepalive: (ms?: number) => ipcRenderer.invoke("print:start-keepalive", ms),
  printStopKeepalive: () => ipcRenderer.invoke("print:stop-keepalive"),

  // passcard print
  printPasscards: async (payloadOrList: any, options?: PasscardPrintOptions) => {
    if (Array.isArray(payloadOrList)) {
      const merged = await mergePasscardOptions(options);
      const payload = { batchId: merged.batchId, jobs: payloadOrList, options: merged };
      return ipcRenderer.invoke("print:passcards", payload);
    }
    return ipcRenderer.invoke("print:passcards", payloadOrList, options);
  },
  passcardPrintBatch: (payloadOrList: any, options?: any) =>
    ipcRenderer.invoke("passcard:print-batch", payloadOrList, options),

  epcardPrint: async (args: EpcardPrintArgs) => {
    const merged = await mergePasscardOptions({
      deviceName: args?.deviceName,
      preview: args?.preview,
      widthMicrons: args?.pageSize ? Math.round(args.pageSize.widthMM * 1000) : undefined,
      heightMicrons: args?.pageSize ? Math.round(args.pageSize.heightMM * 1000) : undefined,
    });
    return ipcRenderer.invoke("epcard:print", {
      deviceName: merged.deviceName,
      preview: merged.preview,
      pageSize:
        args?.pageSize ??
        (merged.widthMicrons && merged.heightMicrons
          ? { widthMM: merged.widthMicrons / 1000, heightMM: merged.heightMicrons / 1000 }
          : undefined),
      url: args?.url,
    });
  },

  printDiag: (deviceName?: string) => ipcRenderer.invoke("print:diag", deviceName),
  printList: () => ipcRenderer.invoke("print:list"),
  printConfigInfo: () => ipcRenderer.invoke("print:config-info"),
  printConfigReload: () => ipcRenderer.invoke("print:config-reload"),

  // events
  onPasscardLog: (cb: Listener<PasscardLogMsg>) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: PasscardLogMsg) => {
      try {
        const label = `[PASSCARD][MAIN→RDR][${msg.tag}]`;
        if (msg.level === "error") console.error(label, msg.payload);
        else if (msg.level === "warn") console.warn(label, msg.payload);
        else console.info(label, msg.payload);
        queueMicrotask(() => {
          try {
            cb?.(msg);
          } catch (e) {
            console.warn("onPasscardLog cb error(microtask):", e);
          }
        });
      } catch (e) {
        console.warn("onPasscardLog handler error:", e);
      }
    };
    ipcRenderer.on("passcard:log", handler);
    return () => ipcRenderer.removeListener("passcard:log", handler);
  },
  onPasscardJobResult: (cb: Listener) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on("passcard:job-result", handler);
    return () => ipcRenderer.removeListener("passcard:job-result", handler);
  },
  onPasscardBatchDone: (cb: Listener) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on("passcard:batch-done", handler);
    return () => ipcRenderer.removeListener("passcard:batch-done", handler);
  },
  onPrintModuleReady: (cb: Listener<{ ok: boolean }>) => {
    const handler = (_e: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on("print:module-ready", handler);
    return () => ipcRenderer.removeListener("print:module-ready", handler);
  },

  // toolkit delegate
  __toolkit: toolkitElectronAPI,
};

/* ───────── compatibility bridges ───────── */
const EXPOSE_FLAG = Symbol.for("__preload_exposed__");

const configBridge = {
  get: api.getConfig,
  getXml: () => ipcRenderer.invoke("config:getXml"),
  getPasscardOptions,
  setPreviewOverride: (v?: boolean) => {
    previewOverride = v;
    console.log("[PASSCARD] preview override =", previewOverride);
  },
  setPreviewCountAsPrintOverride: (v?: boolean) => {
    previewCountAsPrintOverride = v;
    console.log("[PASSCARD] previewCountAsPrint override =", previewCountAsPrintOverride);
  },
  setPasscardPreviewOverride: (v: boolean) => (previewOverride = !!v),
  setPasscardPreviewCountAsPrintOverride: (v: boolean) => (previewCountAsPrintOverride = !!v),
  getMainConfigInfo,
  reloadMainConfig,
  listPrinters: () => ipcRenderer.invoke("print:list"),
};

const logsBridge = { onPasscardLog };

const electronBridge = {
  ...toolkitElectronAPI,
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
};

/* ───────── expose ───────── */
if (process.contextIsolated) {
  try {
    if (!(globalThis as any)[EXPOSE_FLAG]) {
      contextBridge.exposeInMainWorld("electron", electronBridge);
      contextBridge.exposeInMainWorld("ipc", {
        invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
      });
      contextBridge.exposeInMainWorld("api", api);
      contextBridge.exposeInMainWorld("config", configBridge);
      contextBridge.exposeInMainWorld("i18n", i18n);
      contextBridge.exposeInMainWorld("langEvents", langEvents);
      contextBridge.exposeInMainWorld("printBridge", print);
      contextBridge.exposeInMainWorld("passcard", print);
      contextBridge.exposeInMainWorld("printer", printer);
      contextBridge.exposeInMainWorld("logs", logsBridge);
      contextBridge.exposeInMainWorld("time", timeBridge);

      // ✅ unified
      contextBridge.exposeInMainWorld("electronAPI", unifiedElectronAPI);

      contextBridge.exposeInMainWorld("__preloadReady", true);
      (globalThis as any)[EXPOSE_FLAG] = true;

      console.log("[preload] exposed: legacy bridges + unified window.electronAPI + __preloadReady=true");
    }
  } catch (e) {
    console.error("❌ contextBridge expose 실패:", e);
  }
} else {
  // @ts-ignore
  window.electron = electronBridge;
  // @ts-ignore
  window.ipc = { invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args) };
  // @ts-ignore
  window.api = api;
  // @ts-ignore
  window.config = configBridge;
  // @ts-ignore
  window.i18n = i18n;
  // @ts-ignore
  window.langEvents = langEvents;
  // @ts-ignore
  window.printBridge = print;
  // @ts-ignore
  window.passcard = print;
  // @ts-ignore
  window.printer = printer;
  // @ts-ignore
  window.logs = logsBridge;
  // @ts-ignore
  window.time = timeBridge;
  // @ts-ignore
  window.electronAPI = unifiedElectronAPI;
  // @ts-ignore
  window.__preloadReady = true;

  console.log("[preload] exposed (non-isolated): legacy bridges + unified window.electronAPI + __preloadReady=true");
}

/* ───────── global clock cache (1회만 유지) ───────── */
const GLOBAL_CLOCK: {
  ctx?: TimeContext | null;
  baseServerMs?: number | null;
  basePerf?: number | null;
  timer?: NodeJS.Timeout | null;
} = (globalThis as any).__GLOBAL_CLOCK__ || {
  ctx: null,
  baseServerMs: null,
  basePerf: null,
  timer: null,
};
(globalThis as any).__GLOBAL_CLOCK__ = GLOBAL_CLOCK;

timeBridge.getContext = async (): Promise<TimeContext> => {
  if (GLOBAL_CLOCK.ctx && GLOBAL_CLOCK.baseServerMs && GLOBAL_CLOCK.basePerf) {
    const elapsed = performance.now() - GLOBAL_CLOCK.basePerf;
    const nowMs = GLOBAL_CLOCK.baseServerMs + elapsed;
    return { ...GLOBAL_CLOCK.ctx, nowMs };
  }

  const ctx = await ipcRenderer.invoke("time:getContext");
  const ms = ctx?.serverEpochMs ?? Date.now();

  GLOBAL_CLOCK.ctx = ctx;
  GLOBAL_CLOCK.baseServerMs = ms;
  GLOBAL_CLOCK.basePerf = performance.now();

  if (!GLOBAL_CLOCK.timer) {
    GLOBAL_CLOCK.timer = setInterval(() => {
      if (GLOBAL_CLOCK.ctx && GLOBAL_CLOCK.baseServerMs && GLOBAL_CLOCK.basePerf) {
        const elapsed = performance.now() - GLOBAL_CLOCK.basePerf;
        GLOBAL_CLOCK.ctx.nowMs = GLOBAL_CLOCK.baseServerMs + elapsed;
      }
    }, 1000);
  }

  return ctx;
};

/* ───────── 타입 export ───────── */
export type PreloadElectronAPI = typeof unifiedElectronAPI;
export {};
