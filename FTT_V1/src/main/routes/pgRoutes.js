// src/main/routes/pgRoutes.js
const express = require("express");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { XMLParser } = require("fast-xml-parser");

const router = express.Router();

/* ===================== 0. CL_POSTGRES 전용 Config 로더 ===================== */

/** OneDrive 회피용 로컬 기준 */
function getBaseLocal() {
  return process.platform === "win32"
    ? (process.env.LOCALAPPDATA ||
        path.resolve(app.getPath("appData"), "..", "Local"))
    : app.getPath("userData");
}

/**
 * 🔍 Config_Db.xml만 후보로 찾는다.
 *   - 설치본: resources/public/Config_Db.xml, LocalAppData\QM_FTT\Config_Db.xml 등
 *   - DEV:   프로젝트 루트/ public/Config_Db.xml 등
 */
function getConfigDbCandidates() {
  const exeDir = path.dirname(app.getPath("exe"));
  const resources =
    process.resourcesPath || path.join(exeDir, "resources");
  const baseLocal = getBaseLocal();
  const userData = app.getPath("userData");
  const cwd = process.cwd();

  // 환경변수 오버라이드(있으면 최우선)
  const envOverride = String(process.env.CONFIG_DBXML || "").trim();

  const list = [];

  if (envOverride) {
    list.push(envOverride);
  }

  // 설치본 기준
  list.push(
    path.join(resources, "public", "Config.xml"),
    path.join(resources, "Config.xml"),
    path.join(baseLocal, "QM_FTT", "Config.xml"),
    path.join(userData, "Config.xml")
  );

  // DEV 기준
  list.push(
    path.resolve(__dirname, "../../public/Config.xml"),
    path.resolve(__dirname, "../../Config.xml"),
    path.resolve(cwd, "public/Config.xml"),
    path.resolve(cwd, "Config.xml")
  );

  return Array.from(new Set(list.filter(Boolean)));
}

/** BOM 제거 */
function readUtf8Safe(file) {
  const buf = fs.readFileSync(file);
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}

/**
 * ⬇️ CL_POSTGRES 전용 로더
 *
 *   <CL_POSTGRES>
 *     <HOST>203.228.118.39</HOST>
 *     <PORT>5432</PORT>
 *     <USER>sto</USER>
 *     <PASSWORD>sto</PASSWORD>
 *     <DB_NAME>cloud</DB_NAME>
 *     <SCHEMA>mes</SCHEMA>
 *     <POOL_MAX>10</POOL_MAX>
 *     <IDLE_MS>10000</IDLE_MS>
 *   </CL_POSTGRES>
 */
function loadClPgConfigFromXml() {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: true,
  });

  const tried = [];

  for (const p of getConfigDbCandidates()) {
    try {
      if (!fs.existsSync(p)) {
        tried.push(`${p} (not found)`);
        continue;
      }

      const xmlText = readUtf8Safe(p);
      const parsed = parser.parse(xmlText) || {};

      const root = parsed;
      const setting = root.SETTING || root.setting || root;

      // ✅ 오직 CL_POSTGRES만 사용 (POSTGRES fallback 안 씀)
      const cl =
        setting.CL_POSTGRES ||
        setting.cl_postgres ||
        root.CL_POSTGRES ||
        root.cl_postgres ||
        null;

      if (!cl) {
        tried.push(`${p} → CL_POSTGRES 노드 없음`);
        continue;
      }

      const cfg = {
        host: String(cl.HOST ?? ""),
        port: String(cl.PORT ?? "5432"),
        user: String(cl.USER ?? ""),
        password: String(cl.PASSWORD ?? ""),
        dbName: String(cl.DB_NAME ?? cl.DBNAME ?? "postgres"),
        schema: String(cl.SCHEMA ?? "mes"),
        poolMax: String(cl.POOL_MAX ?? cl.POOLMAX ?? "10"),
        idleMs: String(cl.IDLE_MS ?? cl.IDLEMS ?? "10000"),
        sourceTag: "CL_POSTGRES",
      };

      console.log("[PG Config] using(Config_Db.xml):", p);
      console.log("[PG] CL_POSTGRES config loaded:", cfg);

      if (!cfg.host) {
        console.error(
          "❌ [PG] CL_POSTGRES.HOST 가 비어 있습니다. Config_Db.xml 의 <CL_POSTGRES> 블록을 확인하세요."
        );
      }

      return cfg;
    } catch (e) {
      tried.push(`${p} → ${e.message || e}`);
    }
  }

  console.error(
    "[PG] CL_POSTGRES 설정 로드 실패. Tried:\n" + tried.join("\n")
  );
  throw new Error("CL_POSTGRES 설정을 찾지 못했습니다. Config_Db.xml 확인 필요");
}

/* ===================== 1. Pool 생성 ===================== */

const pgCfg = loadClPgConfigFromXml();

const pool = new Pool({
  host: pgCfg.host,
  port: Number(pgCfg.port ?? 5432),
  database: pgCfg.dbName || pgCfg.database || "postgres",
  user: pgCfg.user,
  password: pgCfg.password,
  max: Number(pgCfg.poolMax ?? 10),
  idleTimeoutMillis: Number(pgCfg.idleMs ?? 10000),
  // ssl: { rejectUnauthorized: false },
});

function isSafeIdent(v) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v);
}

/* ===================== 5. Confirm 대상 조회 ===================== */
/**
 * GET /db/pg/confirm-targets?plant=C200&work_center=OSOSP&order_number=PO12345
 */
router.get("/confirm-targets", async (req, res) => {
  const plant = req.query.plant || null;
  const orderNumber = req.query.order_number || null;``
  const workCenter = req.query.work_center || null; // ❗ 이제 실제 필터에 사용

  console.log("📡 [PG] /confirm-targets 호출:", {
    plant,
    orderNumber,
    workCenter,
  });

  let client;
  try {
    client = await pool.connect();

    const sqlText =
      "SELECT * FROM mes.dmpd_production_summary_confirm_q($1::varchar, $2::varchar, $3::varchar)";
    const result = await client.query(sqlText, [
      plant,
      workCenter,
      orderNumber,
    ]);

    res.json({
      ok: true,
      count: result.rows?.length ?? 0,
      rows: result.rows || [],
    });
  } catch (err) {
    console.error("❌ [PG] /confirm-targets 실패:", err);
    res.status(500).json({
      ok: false,
      error: "dmpd_production_summary_confirm_q 호출 실패",
      detail: err.message,
    });
  } finally {
    if (client) client.release();
  }
});

/* ===================== 6. dcf_confirm_qty 누적 업데이트 ===================== */
/**
 * POST /db/pg/dmpd_production_summary_confirm_apply
 *  body: { plant, work_center, order_number, applied_qty }
 *
 *  ↪ mes.dmpd_production_summary_confirm_apply(p_plant, p_work_center, p_order_number, p_applied_qty)
 */
async function handleConfirmApply(req, res) {
  const plant = req.body.plant || null;
  const workCenter = req.body.work_center || null;
  const orderNumber = req.body.order_number || null;
  const appliedQty = Number(req.body.applied_qty ?? 0);

  console.log("📡 [PG] /dmpd_production_summary_confirm_apply 호출:", {
    plant,
    workCenter,
    orderNumber,
    appliedQty,
  });

  if (!Number.isFinite(appliedQty) || appliedQty <= 0) {
    return res.status(400).json({
      ok: false,
      error: "applied_qty must be > 0",
    });
  }

  let client;
  try {
    client = await pool.connect();

    const sqlText =
      "SELECT * FROM mes.dmpd_production_summary_confirm_apply($1::varchar, $2::varchar, $3::varchar, $4::numeric)";
    const result = await client.query(sqlText, [
      plant,
      workCenter,
      orderNumber,
      appliedQty,
    ]);

    const row = result.rows?.[0] || null;

    res.json({
      ok: true,
      affected: row ? row.affected_rows : 0,
      new_confirm_qty: row ? row.new_confirm_qty : null,
    });
  } catch (err) {
    console.error(
      "❌ [PG] dmpd_production_summary_confirm_apply 실패:",
      err
    );
    res.status(500).json({
      ok: false,
      error: "dmpd_production_summary_confirm_apply 호출 실패",
      detail: err.message,
    });
  } finally {
    if (client) client.release();
  }
}

// 함수명 그대로 쓰는 엔드포인트 (프론트에서 사용하는 애)
router.post(
  "/dmpd_production_summary_confirm_apply",
  express.json(),
  handleConfirmApply
);

// 프런트에서 간단히 쓰고 싶을 때용 alias
router.post("/confirm-apply", express.json(), handleConfirmApply);

module.exports = router;
