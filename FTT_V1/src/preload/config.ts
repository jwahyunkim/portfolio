// src/preload/config.ts
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

export type AppConfig = {
  SETTING: {
    Common?: { INPUT?: string };
    PRINT?: {
      PASSCARD?: {
        DEVICE_NAME?: string;
        PREVIEW?: string; // 'Y' | 'N'
        WIDTH_MM?: string | number;
        HEIGHT_MM?: string | number;
      };
    };
    DBSQL?: { USR?: string; PWD?: string; DATA_SOURCE?: string; DB_NAME?: string };
    HOST?: {
      HOST?: string;
      PORT?: string | number;
      HOST1?: string;
      PORT1?: string | number;

      // 🔹 혹시 HOST 아래에 LOCAL_*를 넣는 경우 대비
      LOCAL_HOST?: string;
      LOCAL_PORT?: string | number;
    };
    Service?: {
      HOST?: string;
      PORT?: string | number;
      API_KEY?: string;
      LOCAL_HOST?: string;
      LOCAL_PORT?: string | number;
    };
    SERVICE?: {
      HOST?: string;
      PORT?: string | number;
      API_KEY?: string;
      LOCAL_HOST?: string;
      LOCAL_PORT?: string | number;
    };
    Comm?: {
      SETTINGS?: string; COMMPORT?: string | number;
      SETTINGS1?: string; COMMPORT1?: string | number;
      SETTINGS2?: string; COMMPORT2?: string | number;
    };
    MQTT?: { BROKER?: string; TOPIC?: string };
    FTP?: { HOST?: string; PORT?: string | number; USER?: string; PASSWORD?: string; APPNAME?: string };
    PASSWORD?: { PASS?: string };

    // ✅ APP 블록
    APP?: {
      TITLE?: string;
      DETAIL_PAGE_SIZE?: string | number;
      detail_page_size?: string | number; // 혹시 소문자 변형 대비
    };

    // 편의상 상위에 직접 들어오는 경우도 대비
    DETAIL_PAGE_SIZE?: string | number;
    detail_page_size?: string | number;
  };
};

function n(v: any, d: number) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function findConfigPath(): string {
  const candidates = [
    process.env.CONFIG_XML_PATH,
    path.join(process.cwd(), "public", "Config.xml"),
    path.join(process.resourcesPath || "", "public", "Config.xml"),
    path.join(__dirname, "../../public/Config.xml"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return path.join(process.cwd(), "Config.xml");
}

function normalize(cfg: AppConfig): AppConfig {
  const s: any = cfg?.SETTING ?? {};

  // --- PRINT.PASSCARD 기본값
  const p = s?.PRINT?.PASSCARD ?? {};
  const device = (p.DEVICE_NAME ?? "BIXOLON SRP-330II").toString().trim();
  const preview = (p.PREVIEW ?? "N").toString().trim().toUpperCase() as "Y" | "N";
  const width = n(p.WIDTH_MM ?? 79, 79);
  const height = n(p.HEIGHT_MM ?? 60, 60);

  // --- SERVICE/HOST 원본
  const svcRaw = s.SERVICE ?? s.Service ?? {};
  const hostRaw = s.HOST ?? {};

  // --- 원래 HOST/PORT/API_KEY
  const svcHost = (svcRaw.HOST ?? hostRaw.HOST ?? "").toString().trim();
  const svcPort = n(svcRaw.PORT ?? hostRaw.PORT ?? 4001, 4001);
  const svcKey  = (svcRaw.API_KEY ?? "").toString().trim();

  // 🔹 LOCAL_HOST / LOCAL_PORT (없으면 기본값 / 포트는 HOST 포트 재사용)
  const svcLocalHost = (
    svcRaw.LOCAL_HOST ??
    hostRaw.LOCAL_HOST ??
    "127.0.0.1"
  ).toString().trim();

  const svcLocalPort = n(
    svcRaw.LOCAL_PORT ??
      hostRaw.LOCAL_PORT ??
      svcRaw.PORT ??
      hostRaw.PORT ??
      4001,
    svcPort
  );

  // ✅ DETAIL_PAGE_SIZE 정규화 (SETTING.APP/SETTING 루트/소문자 변형 모두 허용)
  const app = s.APP ?? {};
  const rawSize =
    app.DETAIL_PAGE_SIZE ??
    app.detail_page_size ??
    s.DETAIL_PAGE_SIZE ??
    s.detail_page_size ??
    8;
  const detailPageSize = n(rawSize, 8);

  // 정규화 결과 구성: APP 블록과 DETAIL_PAGE_SIZE 둘 다 숫자로 넣어줌
  const normalized: AppConfig = {
    ...cfg,
    SETTING: {
      ...s,
      SERVICE: {
        HOST: svcHost,
        PORT: svcPort,
        API_KEY: svcKey,
        LOCAL_HOST: svcLocalHost,
        LOCAL_PORT: svcLocalPort,
      },
      PRINT: {
        PASSCARD: {
          DEVICE_NAME: device,
          PREVIEW: preview,
          WIDTH_MM: width,
          HEIGHT_MM: height,
        },
      },
      APP: {
        ...app,
        DETAIL_PAGE_SIZE: detailPageSize,
      },
      DETAIL_PAGE_SIZE: detailPageSize,
    },
  };

  // 🔎 로깅 (프리로드 콘솔)
  try {
    // eslint-disable-next-line no-console
    console.log("[Config] SERVICE loaded:", {
      host: svcHost,
      port: svcPort,
      localHost: svcLocalHost,
      localPort: svcLocalPort,
    });
    // eslint-disable-next-line no-console
    console.log("[Config] DETAIL_PAGE_SIZE =", detailPageSize);
  } catch {}

  return normalized;
}

export function loadAppConfig(): AppConfig {
  const xmlPath = findConfigPath();
  try {
    // eslint-disable-next-line no-console
    console.log("📂 Config.xml path =", xmlPath);
  } catch {}

  let xml = "";
  try {
    xml = fs.readFileSync(xmlPath, "utf-8");
  } catch {
    try {
      console.warn("❌ Config.xml not found, using defaults");
    } catch {}
    return normalize({ SETTING: {} } as AppConfig);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
    parseTagValue: true,
  });

  const raw = parser.parse(xml) as AppConfig;
  return normalize(raw || ({ SETTING: {} } as AppConfig));
}
