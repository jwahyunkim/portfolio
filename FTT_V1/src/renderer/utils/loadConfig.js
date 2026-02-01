// src/renderer/utils/loadConfig.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { parseStringPromise } from "xml2js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// dev/packaged 판단: resources/public/Config.xml 존재 여부로만
function isPackagedLike() {
  try {
    if (typeof process !== "undefined" && process.resourcesPath) {
      const maybe = path.join(process.resourcesPath, "public", "Config.xml");
      if (fs.existsSync(maybe)) return true;
    }
  } catch {}
  return false;
}

function getConfigPath() {
  const packaged = isPackagedLike();

  // 개발 경로
  const devCfg = path.resolve(__dirname, "../../public/Config.xml");
  // 배포 경로
  const prodCfg = path.join(process.resourcesPath || "", "public", "Config.xml");

  const filePath = packaged ? prodCfg : devCfg;
  console.log("📂 읽는 Config 경로:", filePath);
  return filePath;
}

// 안전 숫자 변환
const toNum = (v, fallback = 0) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && !Number.isNaN(n) ? n : fallback;
};

// 키 대소문자 혼용 대응
const pick = (o, ...keys) => {
  if (!o) return undefined;
  for (const k of keys) {
    if (o[k] !== undefined) return o[k];
    const alt = Object.keys(o).find((x) => x.toLowerCase() === String(k).toLowerCase());
    if (alt) return o[alt];
  }
  return undefined;
};

export const loadXmlConfig = async () => {
  const filePath = getConfigPath();

  if (!filePath || !fs.existsSync(filePath)) {
    console.error("❌ Config.xml 파일이 존재하지 않습니다:", filePath);
    return null;
  }

  try {
    const xml = fs.readFileSync(filePath, "utf-8");
    const result = await parseStringPromise(xml, { explicitArray: false });
    if (!result) {
      console.error("❌ XML 파싱 결과가 비었습니다.");
      return null;
    }

    // 루트
    const ROOT = result;
    // 보편 구조: <SETTING> 아래 주요 블록이 있음
    const S = pick(ROOT, "SETTING") || {};
    const Common = pick(S, "Common") || {};
    const DBSQL = pick(S, "DBSQL") || {};
    const SERVICE = pick(S, "SERVICE") || {};
    const PRINT = pick(S, "PRINT") || {};
    const PASSCARD = pick(PRINT, "PASSCARD") || {};

    // APP 블록: 루트<APP> 또는 <SETTING><APP>
    const APP_root = pick(ROOT, "APP") || {};
    const APP_underS = pick(S, "APP") || {};
    const APP = Object.keys(APP_root).length ? APP_root : APP_underS;

    // DETAIL_PAGE_SIZE는 어디에 있어도 잡기
    const detailPageSizeRaw =
      pick(S, "DETAIL_PAGE_SIZE", "detail_page_size") ??
      pick(APP, "DETAIL_PAGE_SIZE", "detail_page_size") ??
      pick(ROOT, "DETAIL_PAGE_SIZE", "detail_page_size");

    const DETAIL_PAGE_SIZE = toNum(detailPageSizeRaw, 8); // 기본 8

    // SERVICE 정규화
    const sv = {
      HOST: pick(SERVICE, "HOST") || "",
      PORT: pick(SERVICE, "PORT") || "",

      // 🟢 LOCAL_HOST / LOCAL_PORT 추가
      LOCAL_HOST:
        pick(SERVICE, "LOCAL_HOST", "local_host", "Local_Host") || "",
      LOCAL_PORT:
        pick(SERVICE, "LOCAL_PORT", "local_port", "Local_Port") || "",

      API_KEY: pick(SERVICE, "API_KEY") || "", // 없으면 빈 문자열
    };

    // PASSCARD 주요값만 평탄화(편의)
    const pass = {
      DEVICE_NAME: pick(PASSCARD, "DEVICE_NAME") || "",
      PREVIEW: String(pick(PASSCARD, "PREVIEW") ?? "").toLowerCase() === "true",
      PREVIEW_COUNT_AS_PRINT:
        String(pick(PASSCARD, "PREVIEW_COUNT_AS_PRINT") ?? "").toLowerCase() === "true" ||
        String(pick(PASSCARD, "PREVIEW_COUNT_AS_PRINT") ?? "").toUpperCase() === "Y",
      WIDTH_MM: toNum(pick(PASSCARD, "WIDTH_MM"), 78),
      HEIGHT_MM: toNum(pick(PASSCARD, "HEIGHT_MM"), 50),
      PREVIEW_ZOOM: toNum(pick(PASSCARD, "PREVIEW_ZOOM"), 1),
      QR_MARGIN: toNum(pick(PASSCARD, "QR_MARGIN"), 2),
      QR_SCALE: toNum(pick(PASSCARD, "QR_SCALE"), 10),
      QR_EC_LEVEL: pick(PASSCARD, "QR_EC_LEVEL") || "M",
      LABELS_PER_JOB: toNum(pick(PASSCARD, "LABELS_PER_JOB"), 1),
      JOB_GAP_MS: toNum(pick(PASSCARD, "JOB_GAP_MS"), 6),
    };

    // 최종 반환(기존 사용처 호환 + 편의 필드)
    const normalized = {
      SETTING: {
        DBSQL: {
          USR: pick(DBSQL, "USR"),
          PWD: pick(DBSQL, "PWD"),
          DATA_SOURCE: pick(DBSQL, "DATA_SOURCE"),
          DB_NAME: pick(DBSQL, "DB_NAME"),
        },
        Common: {
          PLANT_CD: pick(Common, "PLANT_CD") || "",
          ZONE_CD: pick(Common, "ZONE_CD") || "",
        },
        SERVICE: sv,
        DETAIL_PAGE_SIZE: DETAIL_PAGE_SIZE,     // 대문자
        detail_page_size: DETAIL_PAGE_SIZE,     // 소문자
        PRINT: {
          PASSCARD: PASSCARD, // 원형 유지
        },
        APP: {
          ...APP,
          DETAIL_PAGE_SIZE: DETAIL_PAGE_SIZE,
        },
      },

      // 최상위 편의 노출(기존 코드 호환)
      SERVICE: sv,
      Common: {
        PLANT_CD: pick(Common, "PLANT_CD") || "",
        ZONE_CD: pick(Common, "ZONE_CD") || "",
      },
      PRINT: { PASSCARD },
      APP: { ...APP, DETAIL_PAGE_SIZE: DETAIL_PAGE_SIZE },

      // 완전 편의: 바로 숫자 접근
      DETAIL_PAGE_SIZE: DETAIL_PAGE_SIZE,
      detail_page_size: DETAIL_PAGE_SIZE,

      // 프린터 평탄화 값
      print: {
        passcard: {
          deviceName: pass.DEVICE_NAME,
          preview: pass.PREVIEW,
          previewCountAsPrint: pass.PREVIEW_COUNT_AS_PRINT,
          widthMM: pass.WIDTH_MM,
          heightMM: pass.HEIGHT_MM,
          previewZoom: pass.PREVIEW_ZOOM,
          qrMargin: pass.QR_MARGIN,
          qrScale: pass.QR_SCALE,
          qrEcLevel: pass.QR_EC_LEVEL,
          labelsPerJob: pass.LABELS_PER_JOB,
          jobGapMs: pass.JOB_GAP_MS,
        },
      },
    };

    console.log("[loadXmlConfig] DETAIL_PAGE_SIZE =", DETAIL_PAGE_SIZE);
    return normalized;
  } catch (err) {
    console.error("❌ XML 파싱 오류:", err?.message || err);
    return null;
  }
};
