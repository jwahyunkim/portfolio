// src/main/utils/interfaceBoot.ts
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs";
import { join } from "path";

export type InterfaceCfg = {
  DEVICE_ID: string;
  PLANT_CD: string;
  WC_CD: string;
};

type BootResult =
  | { type: "done"; payload: any }
  | { type: "closed" };

function isDevMode() {
  return !app.isPackaged;
}

/**
 * ✅ Config.xml 경로 규칙 (최종)
 * 1순위: AppData (실제 메인이 쓰는 경로)
 * 2순위: public(Config.xml) - fallback
 */
function getConfigPath(): string {
  const userCfg = join(app.getPath("userData"), "Config.xml");

  const publicCfg = isDevMode()
    ? join(app.getAppPath(), "public", "Config.xml")
    : join(process.resourcesPath, "public", "Config.xml");

  return fs.existsSync(userCfg) ? userCfg : publicCfg;
}

/** XML에서 <INTER_FACE> 읽기 */
export function readInterfaceFromXml(xml: string): InterfaceCfg | null {
  const block = xml.match(/<INTER_FACE>([\s\S]*?)<\/INTER_FACE>/i)?.[1];
  if (!block) return null;

  const pick = (tag: string) =>
    block.match(new RegExp(`<${tag}>\\s*([^<]*)\\s*<\\/${tag}>`, "i"))?.[1]?.trim() || "";

  const DEVICE_ID = pick("DEVICE_ID");
  const PLANT_CD = pick("PLANT_CD");
  const WC_CD = pick("WC_CD");

  return DEVICE_ID && PLANT_CD && WC_CD ? { DEVICE_ID, PLANT_CD, WC_CD } : null;
}

/** <SETTING> 하위에 <INTER_FACE> upsert */
export function upsertInterfaceXml(xml: string, v: InterfaceCfg): string {
  const block = `  <INTER_FACE>
    <DEVICE_ID>${escapeXml(v.DEVICE_ID)}</DEVICE_ID>
    <PLANT_CD>${escapeXml(v.PLANT_CD)}</PLANT_CD>
    <WC_CD>${escapeXml(v.WC_CD)}</WC_CD>
  </INTER_FACE>
`;

  if (/<INTER_FACE>[\s\S]*?<\/INTER_FACE>/i.test(xml)) {
    return xml.replace(/<INTER_FACE>[\s\S]*?<\/INTER_FACE>\s*/i, block);
  }

  if (/<SETTING[\s\S]*?>/i.test(xml)) {
    return xml.replace(/<\/SETTING>\s*$/i, `${block}\n</SETTING>`);
  }

  throw new Error("INVALID_XML_ROOT");
}

function escapeXml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validate(v: any): v is InterfaceCfg {
  const a = (x: any) => typeof x === "string" && x.trim().length > 0;
  return !!v && a(v.DEVICE_ID) && a(v.PLANT_CD) && a(v.WC_CD);
}

function waitOnce<T>(ch: string): Promise<T> {
  return new Promise((resolve) => ipcMain.once(ch, (_e, p: T) => resolve(p)));
}

/**
 * =========================================================
 * ✅ 부팅 인터페이스 보장 함수 (FINAL)
 * =========================================================
 */
export async function ensureInterfaceBeforeMainUI(opts: {
  parent?: BrowserWindow | null;
  rendererURL?: string;
}): Promise<{ ok: true; cfg: InterfaceCfg; wrote: boolean } | { ok: false; reason: string }> {
  console.log("[BOOT_IF] ENTER");

  const cfgPath = getConfigPath();
  console.log("[BOOT_IF] configPath =", cfgPath);

  if (!fs.existsSync(cfgPath)) {
    return { ok: false, reason: `CONFIG_NOT_FOUND: ${cfgPath}` };
  }

  const xml = fs.readFileSync(cfgPath, "utf-8");
  const existing = readInterfaceFromXml(xml);

  if (existing) {
    console.log("[BOOT_IF] INTER_FACE exists, skip popup");
    return { ok: true, cfg: existing, wrote: false };
  }

  let closedByUser = false;

  const win = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 760,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    modal: !!opts.parent, // ✅ parent 있을 때만 modal
    parent: opts.parent ?? undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // ✅ “OK 제출”로 닫히는 것과 “사용자가 닫은 것”을 구분해야 함
  let submitted = false;

  win.on("close", () => {
    if (!submitted) closedByUser = true;
  });

  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[BOOT_IF] did-fail-load", { code, desc, url });
  });

  const url = opts.rendererURL ? `${opts.rendererURL}#/boot-interface` : undefined;

  if (url) await win.loadURL(url);
  else await win.loadFile(join(__dirname, "../renderer/index.html"), { hash: "/boot-interface" });

  // ✅ show는 ready-to-show 우선, 안 오면 fallback
  let shown = false;
  win.once("ready-to-show", () => {
    try {
      win.show();
      shown = true;
    } catch {}
  });
  setTimeout(() => {
    if (!shown) {
      try {
        win.show();
      } catch {}
    }
  }, 300);

  // ✅ done 이벤트가 오면 “즉시 submitted=true”로 바꿔서
  //    창이 닫히면서 USER_CLOSED로 오인되는 걸 막는다 (핵심)
  const result = await Promise.race<BootResult>([
    waitOnce<any>("interface:boot-done").then((payload) => {
      submitted = true;
      return { type: "done", payload };
    }),
    new Promise<BootResult>((resolve) => {
      win.once("closed", () => resolve({ type: "closed" }));
    }),
  ]);

  if (result.type === "closed" || closedByUser) {
    console.warn("[BOOT_IF] USER CLOSED");
    return { ok: false, reason: "USER_CLOSED_BOOT_IF" };
  }

  const payload = result.payload;

  if (!validate(payload)) {
    console.warn("[BOOT_IF] INVALID_PAYLOAD", payload);
    try {
      if (!win.isDestroyed()) win.close();
    } catch {}
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }

  const cleaned: InterfaceCfg = {
    DEVICE_ID: String(payload.DEVICE_ID).trim(),
    PLANT_CD: String(payload.PLANT_CD).trim(),
    WC_CD: String(payload.WC_CD).trim(),
  };

  const xml2 = upsertInterfaceXml(xml, cleaned);
  fs.writeFileSync(cfgPath, xml2, "utf-8");

  try {
    if (!win.isDestroyed()) win.close();
  } catch {}

  console.log("[BOOT_IF] SAVED & OK");
  return { ok: true, cfg: cleaned, wrote: true };
}
