// C:\Changshin\test\electron-app_final\src\renderer\utils\loadConfigClient.ts
// DEV 전용 Typed Config 로더 (설치본에서는 사용 안 함)

import axios from "axios";
import { XMLParser } from "fast-xml-parser";

/* ===================== 타입 ===================== */
export interface PasscardPrintOptions {
  deviceName?: string;
  preview?: "Y" | "N";
  widthMM?: number;
  heightMM?: number;
}

export interface DbConfig {
  input: string;
  db: {
    user: string;
    password: string;
    dataSource: string;
    dbName: string;
  };
  host: {
    mainHost: string;
    mainPort: string;
    subHost: string;
    subPort: string;
  };
  comm: {
    portSettings: { settings: string; port: string }[];
  };
  password: string;
  print?: {
    passcard?: PasscardPrintOptions;
  };
  postgres?: {
    host: string;
    port: number;
    user: string;
    password: string;
    dbName: string;
    schema: string;
    poolMax?: number;
    idleMs?: number;
  };
  service?: {
    host: string;
    port: string;
    localHost?: string;   // ✅ 추가
    localPort?: string;   // ✅ 추가
  };
  app?: {
    detailPageSize: number; // ✅ DETAIL_PAGE_SIZE
  };
}

/* ===================== 유틸 ===================== */
function isDev(): boolean {
  try {
    // NODE_ENV 기준 + 렌더러 URL 기준 둘 다 체크
    if (
      typeof process !== "undefined" &&
      process.env &&
      process.env.NODE_ENV === "development"
    )
      return true;
    return (
      typeof window !== "undefined" &&
      (window as any).location?.protocol === "http:"
    );
  } catch {
    return false;
  }
}

function parseSettingFromXml(xmlText: string): any | null {
  const clean = (xmlText || "").replace(/^\uFEFF/, "").trim();
  if (!clean) return null;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
    parseTagValue: true,
  });
  const parsed = parser.parse(clean);
  return parsed?.SETTING ?? parsed?.setting ?? null;
}

/** dev: /Config.xml HTTP로 읽기 */
async function readConfigXmlTextDev(): Promise<string> {
  const res = await axios.get<string>(`/Config.xml?t=${Date.now()}`, {
    responseType: "text",
  });
  return res.data;
}

/** prod: preload/IPC로 XML 텍스트(권장) 또는 파싱된 오브젝트 받기 */
async function readSettingProd(): Promise<any | null> {
  const w = window as any;

  // 1) 권장: preload에서 XML 원문 제공
  try {
    const maybeGetXml = w?.config?.getXml;
    if (typeof maybeGetXml === "function") {
      const xmlText = await maybeGetXml();
      const setting = parseSettingFromXml(xmlText);
      if (setting) return setting;
    }
  } catch (e) {
    console.warn("[Config] preload window.config.getXml 실패:", e);
  }

  // 2) 대안: electron.invoke("config:getXml")
  try {
    const inv = w?.electron?.invoke;
    if (typeof inv === "function") {
      const xmlText = await inv("config:getXml");
      if (typeof xmlText === "string" && xmlText.length > 0) {
        const setting = parseSettingFromXml(xmlText);
        if (setting) return setting;
      }
    }
  } catch (e) {
    console.warn("[Config] electron.invoke('config:getXml') 실패:", e);
  }

  // 3) 최후: 파싱된 객체 직접 반환
  try {
    const maybeGet = w?.config?.get;
    if (typeof maybeGet === "function") {
      const cfgObj = await maybeGet();
      const setting = cfgObj?.SETTING ?? cfgObj?.setting ?? cfgObj;
      if (setting) return setting;
    }
  } catch (e) {
    console.warn("[Config] preload window.config.get 실패:", e);
  }

  console.warn(
    "[Config] prod에서 typed loader(readSettingProd)를 위한 브리지가 없어 null 반환"
  );
  return null;
}

/** 공통: dev/prod에서 SETTING 오브젝트 획득 */
async function getSetting(): Promise<any | null> {
  if (isDev()) {
    const xmlText = await readConfigXmlTextDev();
    return parseSettingFromXml(xmlText);
  }
  return await readSettingProd();
}

/* ===================== 1) 타입 좋은 버전 ===================== */
export async function loadConfigClient(): Promise<DbConfig | null> {
  // ⛔ 설치본에서는 아예 사용하지 않도록 강제
  if (!isDev()) {
    console.log(
      "[Config] loadConfigClient: prod build → skip (typed loader는 DEV 전용)"
    );
    return null;
  }

  try {
    const setting = await getSetting();
    if (!setting) {
      console.warn("[Config] SETTING 노드 없음");
      return null;
    }

    const input = String(setting?.Common?.INPUT ?? "N").toUpperCase();
    const dbsql = setting.DBSQL ?? {};
    const host = setting.HOST ?? {};
    const commRoot = setting.Comm ?? setting.COMM ?? {};
    const passwordValue = setting.PASSWORD?.PASS ?? "";
    const pg = setting.POSTGRES ?? {};
    const service = setting.SERVICE ?? {};
    const app = setting.APP ?? {};

    const commPorts = [
      {
        settings: String(commRoot.SETTINGS ?? ""),
        port: String(commRoot.COMMPORT ?? ""),
      },
      {
        settings: String(commRoot.SETTINGS1 ?? ""),
        port: String(commRoot.COMMPORT1 ?? ""),
      },
      {
        settings: String(commRoot.SETTINGS2 ?? ""),
        port: String(commRoot.COMMPORT2 ?? ""),
      },
    ].filter((p) => p.settings || p.port);

    const pass = setting?.PRINT?.PASSCARD ?? {};
    const previewYN: "Y" | "N" =
      String(pass?.PREVIEW ?? "N").toUpperCase() === "Y" ? "Y" : "N";

    const passcard: PasscardPrintOptions = {
      deviceName: String(pass?.DEVICE_NAME ?? ""),
      preview: previewYN,
      widthMM: Number(pass?.WIDTH_MM ?? 79),
      heightMM: Number(pass?.HEIGHT_MM ?? 60),
    };

    const config: DbConfig = {
      input,
      db: {
        user: String(dbsql.USR ?? ""),
        password: String(dbsql.PWD ?? ""),
        dataSource: String(dbsql.DATA_SOURCE ?? ""),
        dbName: String(dbsql.DB_NAME ?? ""),
      },
      host: {
        mainHost: String(host.HOST ?? ""),
        mainPort: String(host.PORT ?? ""),
        subHost: String(host.HOST1 ?? ""),
        subPort: String(host.PORT1 ?? ""),
      },
      comm: { portSettings: commPorts },
      password: String(passwordValue),
      print: { passcard },
      postgres: {
        host: String(pg.HOST ?? ""),
        port: Number(pg.PORT ?? 5432),
        user: String(pg.USER ?? ""),
        password: String(pg.PASSWORD ?? ""),
        dbName: String(pg.DB_NAME ?? ""),
        schema: String(pg.SCHEMA ?? "mes"),
        poolMax: Number(pg.POOL_MAX ?? 10),
        idleMs: Number(pg.IDLE_MS ?? 10000),
      },
      service: {
        host: String(service.HOST ?? ""),
        port: String(service.PORT ?? ""),
        localHost: String(service.LOCAL_HOST ?? service.local_host ?? ""),
        localPort: String(service.LOCAL_PORT ?? service.local_port ?? ""),
      },
      app: {
        detailPageSize: Number(app.DETAIL_PAGE_SIZE ?? 8),
      },
    };

    console.log("[Config] SERVICE loaded:", config.service);
    console.log("[Config] POSTGRES(DEV) =", config.postgres);
    console.log("[Config] DETAIL_PAGE_SIZE =", config.app?.detailPageSize);

    return config;
  } catch (err) {
    console.error("❌ Config.xml 로드 실패(렌더러/typed):", err);
    return null;
  }
}

/* ===================== 2) 레거시 호환 버전 ===================== */
export async function loadConfig_RawCompat(): Promise<any | null> {
  // 레거시 버전도 DEV에서만 사용 (prod는 메인/프리로드 경로 사용)
  if (!isDev()) {
    console.log(
      "[Config] loadConfig_RawCompat: prod build → skip (DEV 전용)"
    );
    return null;
  }

  try {
    const setting = await getSetting();
    if (!setting) {
      console.warn("[Config] SETTING 노드 없음(rawCompat)");
      return null;
    }

    const service = setting.SERVICE ?? {};

    return {
      SETTING: setting,
      ...setting,
      Common: setting.Common ?? setting.COMMON,
      PRINT: setting.PRINT,
      DBSQL: setting.DBSQL,
      POSTGRES: setting.POSTGRES,
      SERVICE: {
        HOST: String(service.HOST ?? ""),
        PORT: String(service.PORT ?? ""),
        LOCAL_HOST: String(service.LOCAL_HOST ?? service.local_host ?? ""),
        LOCAL_PORT: String(service.LOCAL_PORT ?? service.local_port ?? ""),
      },
    };
  } catch (err) {
    console.error("❌ Config.xml 로드 실패(렌더러/rawCompat):", err);
    return null;
  }
}
