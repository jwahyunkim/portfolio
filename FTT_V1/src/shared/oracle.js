// src/shared/oracle.js
import oracledb from "oracledb";
import path from "path";
import fs from "fs";
import { parseStringPromise } from "xml2js";

/** 파일 존재 체크 */
function fileExists(p) {
  if (!p) return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Config.xml 경로 탐색 (ENV > cwd/public > resources/public > src/public > cwd) */
function getConfigPath() {
  const candidates = [
    process.env.CONFIG_XML_PATH,
    path.resolve(process.cwd(), "public/Config.xml"),
    process.resourcesPath
      ? path.join(process.resourcesPath, "public", "Config.xml")
      : null,
    path.resolve(__dirname, "../../public/Config.xml"),
    path.resolve(process.cwd(), "Config.xml"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fileExists(p)) return p;
  }
  return null;
}

/** ORACLE 섹션 캐시 (Config.xml 변경 없으면 재파싱/재읽기 방지) */
let _oracleXmlCache = {
  filePath: null,
  mtimeMs: 0,
  value: null,
};

/** XML 로드 → ORACLE 섹션 추출 */
async function loadXmlOracle() {
  const filePath = getConfigPath();
  if (!filePath) return null;

  try {
    const st = fs.statSync(filePath);
    if (
      _oracleXmlCache.filePath === filePath &&
      _oracleXmlCache.value &&
      _oracleXmlCache.mtimeMs === st.mtimeMs
    ) {
      return _oracleXmlCache.value;
    }

    const xml = fs.readFileSync(filePath, "utf-8");
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const SETTING = parsed && parsed.SETTING;
    const ORACLE = SETTING && SETTING.ORACLE ? SETTING.ORACLE : {};

    const value = {
      libDir: ORACLE.LIB_DIR,
      user: ORACLE.USR,
      password: ORACLE.PWD,
      host: ORACLE.HOST,
      port: ORACLE.PORT,
      sid: ORACLE.SID,
      serviceName: ORACLE.SERVICE_NAME, // (선택) 나중에 SERVICE_NAME으로 바꾸면 사용
    };

    _oracleXmlCache = { filePath, mtimeMs: st.mtimeMs, value };
    return value;
  } catch (e) {
    console.error("❌ Config.xml 파싱 실패(ORACLE):", e);
    return null;
  }
}

/** ENV 우선 → XML → 실패 시 예외 */
async function resolveOracleConfig() {
  // (선택) ENV 오버라이드
  const envLibDir = process.env.ORACLE_LIB_DIR;

  const envUser = process.env.ORACLE_USER;
  const envPass = process.env.ORACLE_PASS;

  const envHost = process.env.ORACLE_HOST;
  const envPort = process.env.ORACLE_PORT;
  const envSid = process.env.ORACLE_SID;
  const envServiceName = process.env.ORACLE_SERVICE_NAME;

  if (envUser && envPass && envHost && (envSid || envServiceName)) {
    return {
      libDir: envLibDir,
      user: envUser,
      password: envPass,
      host: envHost,
      port: envPort || "1521",
      sid: envSid,
      serviceName: envServiceName,
    };
  }

  const xml = await loadXmlOracle();
  if (
    xml &&
    xml.user &&
    xml.password &&
    xml.host &&
    (xml.sid || xml.serviceName)
  ) {
    return {
      libDir: xml.libDir,
      user: xml.user,
      password: xml.password,
      host: xml.host,
      port: xml.port || "1521",
      sid: xml.sid,
      serviceName: xml.serviceName,
    };
  }

  throw new Error("ORACLE 설정을 찾을 수 없습니다. (ENV 또는 Config.xml 확인)");
}

function buildConnectString({ host, port, sid, serviceName }) {
  const connectData = serviceName
    ? `(SERVICE_NAME=${serviceName})`
    : `(SID=${sid})`;

  return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=${connectData}))`;
}

// ✅ Oracle Instant Client 경로를 명시해 Thick 모드 활성화
let _oracleClientInited = false;
let _oracleClientInitTried = false;

async function ensureOracleClient(libDir) {
  if (_oracleClientInited) return;
  if (_oracleClientInitTried) return;

  _oracleClientInitTried = true;

  if (!libDir) {
    // libDir 없으면 Thin 모드로도 동작 가능(환경에 따라)
    console.warn("[Oracle] initOracleClient skipped (libDir empty)");  return;
  }

  try {
    console.log("[Oracle] initOracleClient libDir:", libDir);
    oracledb.initOracleClient({ libDir });
    _oracleClientInited = true;
    console.log("[Oracle] initOracleClient ok; thin =", oracledb.thin);
  } catch (err) {
    console.error("[Oracle] initOracleClient failed:", err);
    console.error("[Oracle] thin =", oracledb.thin);
  }
}

/**
 * ✅ Connection Pool (요청마다 새 연결 생성 비용 제거)
 * - 최초 1회 createPool
 * - 이후 getConnection()은 pool.getConnection() 사용
 */
let _pool = null;
let _poolCreating = null;

async function ensurePool(base) {
  if (_pool) return _pool;
  if (_poolCreating) return _poolCreating;

  _poolCreating = (async () => {
    console.log("[Oracle] ensurePool: starting", { hasLibDir: !!base.libDir });
    await ensureOracleClient(base.libDir);

    const poolConfig = {
      user: base.user,
      password: base.password,
      connectString: buildConnectString({
        host: base.host,
        port: base.port,
        sid: base.sid,
        serviceName: base.serviceName,
      }),

      // ✅ 사용자가 "알아서" 설정 요청 → 보수적으로 기본값 선택
      poolMin: 0,
      poolMax: 4,
      poolIncrement: 1,

      // (선택) 유휴 커넥션 정리(초 단위)
      poolTimeout: 60,
    };

    try {
      _pool = await oracledb.createPool(poolConfig);
      return _pool;
    } finally {
      _poolCreating = null;
    }
  })();

  return _poolCreating;
}

export async function getConnection() {
  console.log("[Oracle] getConnection");
  const base = await resolveOracleConfig();

  const pool = await ensurePool(base);
  return await pool.getConnection();
}


