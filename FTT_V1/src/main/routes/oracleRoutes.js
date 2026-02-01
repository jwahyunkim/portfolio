// src/main/routes/oracleRoutes.js
import express from "express";
import oracledb from "oracledb";
import fs from "fs";
import path from "path";
import { parseStringPromise } from "xml2js";
import { getConnection } from "@shared/oracle";

console.log("oracledb.thin:", oracledb.thin);

const router = express.Router();

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

/** COMMON_PARAMS 캐시 */
let _commonCache = {
  filePath: null,
  mtimeMs: 0,
  value: null,
};

/**
 * XML 로드 → COMMON_PARAMS 추출
 * - 기본값 사용 안 함
 * - 누락 시 ok:false + error 반환
 */
async function loadCommonParams() {
  const filePath = getConfigPath();
  if (!filePath) {
    return {
      ok: false,
      error: "Config.xml을 찾을 수 없습니다. (ENV CONFIG_XML_PATH 또는 경로 확인)",
      configPath: null,
      params: null,
    };
  }

  try {
    const st = fs.statSync(filePath);
    if (
      _commonCache.filePath === filePath &&
      _commonCache.value &&
      _commonCache.mtimeMs === st.mtimeMs
    ) {
      return {
        ok: true,
        error: null,
        configPath: filePath,
        params: _commonCache.value,
      };
    }

    const xml = fs.readFileSync(filePath, "utf-8");
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    const SETTING = parsed && parsed.SETTING;
    const CP = SETTING && SETTING.COMMON_PARAMS ? SETTING.COMMON_PARAMS : {};

    const plant_cd = (CP.PLANT_CD ?? "").toString().trim();
    const wc_cd = (CP.WC_CD ?? "").toString().trim();
    const line_cd = (CP.LINE_CD ?? "").toString().trim();

    const missing = [];
    if (!plant_cd) missing.push("PLANT_CD");
    if (!wc_cd) missing.push("WC_CD");
    if (!line_cd) missing.push("LINE_CD");

    if (missing.length) {
      return {
        ok: false,
        error: `Config.xml의 <COMMON_PARAMS> 값이 누락되었습니다: ${missing.join(", ")}`,
        configPath: filePath,
        params: null,
      };
    }

    const params = { plant_cd, wc_cd, line_cd };
    _commonCache = { filePath, mtimeMs: st.mtimeMs, value: params };

    return { ok: true, error: null, configPath: filePath, params };
  } catch (err) {
    return {
      ok: false,
      error: `Config.xml 파싱 실패: ${String(err?.message || err)}`,
      configPath: filePath,
      params: null,
    };
  }
}

/**
 * ✅ Oracle 연결 확인
 * GET /api/oracle/ping   (server.js에서 app.use("/api", oracleRoutes)로 마운트됨)
 */
router.get("/oracle/ping", async (_req, res) => {
  let conn;

  try {
    conn = await getConnection();
    await conn.execute("SELECT 1 FROM DUAL");
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ /oracle/ping 실패:", err);
    return res
      .status(500)
      .json({ ok: false, error: String(err?.message || err) });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Plant]
 * select plant_cd, plant_nm
 * from V_DMQM_PLANT;
 *
 * - XML COMMON_PARAMS.PLANT_CD로 특정
 * GET /api/oracle/plants
 */
router.get("/oracle/plants", async (_req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT plant_cd, plant_nm
      FROM V_DMQM_PLANT
      WHERE plant_cd = :plant_cd
      `,
      { plant_cd: cfg.params.plant_cd },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return res.status(200).json({
      ok: true,
      params: cfg.params,
      rows: r.rows || [],
    });
  } catch (err) {
    console.error("❌ /oracle/plants 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Plant List]
 * select plant_cd, plant_nm
 * from V_DMQM_PLANT;
 *
 * - 전체 리스트 조회
 * GET /api/oracle/plants-list
 */
router.get("/oracle/plants-list", async (_req, res) => {
  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT plant_cd, plant_nm
      FROM V_DMQM_PLANT
      ORDER BY plant_cd
      `,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return res.status(200).json({
      ok: true,
      rows: r.rows || [],
    });
  } catch (err) {
    console.error("❌ /oracle/plants-list 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Work Center]
 * select plant_cd, wc_cd, wc_nm
 * from V_DMQM_WORK_CENTER;
 *
 * - XML COMMON_PARAMS.PLANT_CD, WC_CD로 특정
 * GET /api/oracle/work-centers
 */
router.get("/oracle/work-centers", async (_req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT plant_cd, wc_cd, wc_nm
      FROM V_DMQM_WORK_CENTER
      WHERE plant_cd = :plant_cd
        AND wc_cd = :wc_cd
      `,
      { plant_cd: cfg.params.plant_cd, wc_cd: cfg.params.wc_cd },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return res.status(200).json({
      ok: true,
      params: cfg.params,
      rows: r.rows || [],
    });
  } catch (err) {
    console.error("❌ /oracle/work-centers 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Work Center List]
 * select plant_cd, wc_cd, wc_nm
 * from V_DMQM_WORK_CENTER;
 *
 * - plant_cd 기준 리스트 조회
 * - plant_cd는 querystring으로 필수 (?plant_cd=...)
 *
 * GET /api/oracle/work-centers-list?plant_cd=PLANT_CD
 */
router.get("/oracle/work-centers-list", async (req, res) => {
  const plant_cd = (req?.query?.plant_cd ?? "").toString().trim();
  if (!plant_cd) {
    return res.status(400).json({
      ok: false,
      error: "plant_cd가 필요합니다. (?plant_cd=...)",
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT plant_cd, wc_cd, wc_nm
      FROM V_DMQM_WORK_CENTER
      WHERE plant_cd = :plant_cd
      ORDER BY wc_cd
      `,
      { plant_cd },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return res.status(200).json({
      ok: true,
      params: { plant_cd },
      rows: r.rows || [],
    });
  } catch (err) {
    console.error("❌ /oracle/work-centers-list 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Line]
 * select plant_cd, wc_cd, line_cd, line_nm
 * from V_DMQM_LINE;
 *
 * - XML COMMON_PARAMS.PLANT_CD, WC_CD, LINE_CD로 특정
 * GET /api/oracle/lines
 */
router.get("/oracle/lines", async (_req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT plant_cd, wc_cd, line_cd, line_nm
      FROM V_DMQM_LINE
      WHERE plant_cd = :plant_cd
        AND wc_cd = :wc_cd
        AND line_cd = :line_cd
      `,
      {
        plant_cd: cfg.params.plant_cd,
        wc_cd: cfg.params.wc_cd,
        line_cd: cfg.params.line_cd,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return res.status(200).json({
      ok: true,
      params: cfg.params,
      rows: r.rows || [],
    });
  } catch (err) {
    console.error("❌ /oracle/lines 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Line List]
 * select plant_cd, wc_cd, line_cd, line_nm
 * from V_DMQM_LINE;
 *
 * - plant_cd, wc_cd 기준 리스트 조회
 * - plant_cd, wc_cd는 querystring으로 필수 (?plant_cd=...&wc_cd=...)
 *
 * GET /api/oracle/lines-list?plant_cd=PLANT_CD&wc_cd=WC_CD
 */
router.get("/oracle/lines-list", async (req, res) => {
  const plant_cd = (req?.query?.plant_cd ?? "").toString().trim();
  const wc_cd = (req?.query?.wc_cd ?? "").toString().trim();

  if (!plant_cd || !wc_cd) {
    return res.status(400).json({
      ok: false,
      error: "plant_cd, wc_cd가 필요합니다. (?plant_cd=...&wc_cd=...)",
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT plant_cd, wc_cd, line_cd, line_nm
      FROM V_DMQM_LINE
      WHERE plant_cd = :plant_cd
        AND wc_cd = :wc_cd
      ORDER BY line_cd
      `,
      { plant_cd, wc_cd },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return res.status(200).json({
      ok: true,
      params: { plant_cd, wc_cd },
      rows: r.rows || [],
    });
  } catch (err) {
    console.error("❌ /oracle/lines-list 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Styles]
 * select plant_cd, wc_cd, line_cd, style_cd, style_nm
 * from V_DMQM_STYLE;
 *
 * - XML COMMON_PARAMS.PLANT_CD, WC_CD, LINE_CD로 특정
 * - 프론트가 바로 쓰게 value/label로 변환
 *
 * GET /api/oracle/styles
 */
router.get("/oracle/styles", async (_req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT style_cd, style_nm
      FROM V_DMQM_STYLE
      WHERE plant_cd = :plant_cd
        AND wc_cd = :wc_cd
        AND line_cd = :line_cd
      ORDER BY style_cd
      `,
      {
        plant_cd: cfg.params.plant_cd,
        wc_cd: cfg.params.wc_cd,
        line_cd: cfg.params.line_cd,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (r.rows || []).map((row) => {
      const cd = (row?.STYLE_CD ?? row?.style_cd ?? "").toString();
      const nm = (row?.STYLE_NM ?? row?.style_nm ?? "").toString();

      return {
        value: cd,
        label: nm,
      };
    });

    return res.status(200).json({
      ok: true,
      params: cfg.params,
      rows,
    });
  } catch (err) {
    console.error("❌ /oracle/styles 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Style Sizes]
 * select plant_cd, wc_cd, line_cd, style_cd, size_cd
 * from V_DMQM_STYLE_SIZE;
 *
 * - XML COMMON_PARAMS.PLANT_CD, WC_CD, LINE_CD로 특정
 * - STYLE_CD는 프론트에서 query로 전달 (?style_cd=...)
 * - 프론트가 바로 쓰게 value/label로 변환 (표시도 value로 쓰는 패턴)
 *
 * GET /api/oracle/style-sizes?style_cd=STYLE_CD
 */
router.get("/oracle/style-sizes", async (req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  const style_cd = (req?.query?.style_cd ?? "").toString().trim();
  if (!style_cd) {
    return res.status(400).json({
      ok: false,
      error: "style_cd가 필요합니다. (?style_cd=...)",
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      SELECT size_cd
      FROM V_DMQM_STYLE_SIZE
      WHERE plant_cd = :plant_cd
        AND wc_cd = :wc_cd
        AND line_cd = :line_cd
        AND style_cd = :style_cd
      ORDER BY size_cd
      `,
      {
        plant_cd: cfg.params.plant_cd,
        wc_cd: cfg.params.wc_cd,
        line_cd: cfg.params.line_cd,
        style_cd,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (r.rows || []).map((row) => {
      const size = (row?.SIZE_CD ?? row?.size_cd ?? "").toString();
      return {
        value: size,
        label: size,
      };
    });

    // ✅ 1, 1T, 2, 2T ... 형태로 정렬
    rows.sort((a, b) => {
      const av = String(a?.value ?? "").trim().toUpperCase();
      const bv = String(b?.value ?? "").trim().toUpperCase();

      const pa = av.match(/^(\d+)(T)?$/);
      const pb = bv.match(/^(\d+)(T)?$/);

      // 둘 다 "숫자" 또는 "숫자+T" 패턴이면: 숫자 오름차순, 같은 숫자면 T 없는 게 먼저
      if (pa && pb) {
        const an = Number(pa[1]);
        const bn = Number(pb[1]);
        if (an !== bn) return an - bn;

        const aHasT = !!pa[2];
        const bHasT = !!pb[2];
        if (aHasT !== bHasT) return aHasT ? 1 : -1; // "1" < "1T"
        return 0;
      }

      // 패턴 밖 값이 섞이면 문자열 기준 정렬(기존 동작과 유사한 안정 처리)
      return av.localeCompare(bv);
    });

    return res.status(200).json({
      ok: true,
      params: cfg.params,
      rows,
    });
  } catch (err) {
    console.error("❌ /oracle/style-sizes 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [Defects]
 * select plant_cd, defect_cd, defect_nm
 * from v_dmqm_ftt_defect;
 *
 * - XML COMMON_PARAMS.PLANT_CD로 특정
 * - 프론트 DefectCard가 바로 쓰게 value/label/ftt/hfpa로 변환
 *   (현재 ftt/hfpa는 임시 0)
 *
 * GET /api/oracle/defects
 */
router.get("/oracle/defects", async (_req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  let conn;
  try {
    conn = await getConnection();

    // 1) 매핑 JSON 로드 (hfpaNm 공란인 매핑은 제외)
    const defectMap = {
      "001": { fttNm: "Airbag Defect", hfpaCd: "HFPA15", hfpaNm: "Airbag" },
      "002": {
        fttNm: "Alignment L + R Symmetry",
        hfpaCd: "HFPA09",
        hfpaNm: "L/R consistency",
      },
      "003": {
        fttNm: "Bond gap / Rat hole",
        hfpaCd: "HFPA01",
        hfpaNm: "Bonding gap",
      },
      "004": { fttNm: "Delamination", hfpaCd: "HFPA01", hfpaNm: null },
      "005": {
        fttNm: "Over cement",
        hfpaCd: "HFPA02",
        hfpaNm: "High cement",
      },
      "006": {
        fttNm: "Contamination",
        hfpaCd: "HFPA03",
        hfpaNm: "Upper Contamination",
      },
      "007": {
        fttNm: "Interior defect",
        hfpaCd: "HFPA14",
        hfpaNm: "Interior (including sock-liner)",
      },
      "008": {
        fttNm: "Accessories defect",
        hfpaCd: "HFPA14",
        hfpaNm: null,
      },
      "009": {
        fttNm: "Color / Paint migration, bleeding",
        hfpaCd: "HFPA11",
        hfpaNm: "Poor Painting",
      },
      "010": { fttNm: "Color mis-match", hfpaCd: "HFPA11", hfpaNm: null },
      "011": {
        fttNm: "Paint surface quality",
        hfpaCd: "HFPA11",
        hfpaNm: null,
      },
      "012": {
        fttNm: "Material damaged",
        hfpaCd: "HFPA12",
        hfpaNm: "Upper Damage",
      },
      "013": { fttNm: "Holes quality", hfpaCd: "HFPA12", hfpaNm: null },
      "014": { fttNm: "Over buffing", hfpaCd: "HFPA12", hfpaNm: null },
      "015": {
        fttNm: "Jump / Broken / Loose Stitch",
        hfpaCd: "HFPA10",
        hfpaNm: "Poor stitching",
      },
      "016": { fttNm: "Thread end", hfpaCd: "HFPA05", hfpaNm: "Thread end" },
      "017": {
        fttNm: "Stitching margin",
        hfpaCd: "HFPA10",
        hfpaNm: null,
      },
      "018": {
        fttNm: "Off-center",
        hfpaCd: "HFPA08",
        hfpaNm: "Center off",
      },
      "019": { fttNm: "Rocking", hfpaCd: "HFPA06", hfpaNm: null },
      "020": { fttNm: "Toe spring", hfpaCd: "HFPA06", hfpaNm: null },
      "021": {
        fttNm: "Wrinkle or Deformed Bottom",
        hfpaCd: "HFPA07",
        hfpaNm: null,
      },
      "022": {
        fttNm: "Wrinkle or Deformed Upper",
        hfpaCd: "HFPA06",
        hfpaNm: "Wrinkle on upper",
      },
      "023": { fttNm: "X-ray", hfpaCd: "HFPA07", hfpaNm: null },
      "024": { fttNm: "Yellowing", hfpaCd: "HFPA13", hfpaNm: null },
      "025": { fttNm: "Other Defects", hfpaCd: "HFPA13", hfpaNm: "Others" },
    };

    // hfpaCd -> [fttCd...] (hfpaNm 공란 제외)
    const hfpaToFtt = {};
    for (const [fttCd, v] of Object.entries(defectMap || {})) {
      const hfpaCd = v?.hfpaCd;
      const hfpaNm = (v?.hfpaNm ?? "").toString().trim();
      if (!hfpaCd) continue;
      if (!hfpaNm) continue; // ✅ HFPA 열 공란은 집계 제외
      (hfpaToFtt[hfpaCd] ??= []).push(fttCd);
    }

    // 2) HFPA: HFPA 코드별 집계
    const rH = await conn.execute(
      `
      SELECT DEFECT_CD AS hfpa_cd
           , SUM(DEFECT_QTY) AS hfpa_qty
      FROM MSPQ_HFPA_INSP
      WHERE INSPECT_DATE = TO_CHAR(SYSDATE, 'YYYYMMDD')
        AND PLANT_CD     = :plant_cd
        AND PB_CD        = :wc_cd
        AND WC_CD        = :line_cd
      GROUP BY DEFECT_CD
      `,
      {
        plant_cd: cfg.params.plant_cd,
        wc_cd: cfg.params.wc_cd,
        line_cd: cfg.params.line_cd,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    // 3) HFPA 집계를 FTT 코드로 변환해서 누적 (FTT 코드별 hfpa 수량)
    const hfpaByFtt = {}; // { "001": 10, ... }
    for (const row of rH.rows || []) {
      const hfpaCd = (row?.HFPA_CD ?? row?.hfpa_cd ?? "").toString();
      const qtyRaw = row?.HFPA_QTY ?? row?.hfpa_qty ?? 0;
      const qty = Number(qtyRaw) || 0;

      const fttList = hfpaToFtt[hfpaCd] ?? [];
      for (const fttCd of fttList) {
        hfpaByFtt[fttCd] = (hfpaByFtt[fttCd] ?? 0) + qty;
      }
    }

    // 4) FTT: 기존 로직(FTT코드별 집계) + FTT 마스터
    const r = await conn.execute(
      `
      SELECT D.plant_cd
           , D.defect_cd
           , D.defect_nm
           , NVL(F.ftt_qty, 0)  AS ftt_qty
           , 0                 AS hfpa_qty
      FROM v_dmqm_ftt_defect D
      LEFT JOIN (
          SELECT A.plant_cd
               , B.defect_type AS defect_cd
               , SUM(B.defect_qty) AS ftt_qty
          FROM DMQM_FTT_RESULT A
          JOIN DMQM_FTT_RESULT_DETAIL B
            ON A.ftt_no = B.ftt_no
          WHERE A.ftt_date    = TO_CHAR(SYSDATE, 'YYYYMMDD')
            AND A.plant_cd    = :plant_cd
            AND A.work_center = :wc_cd
            AND A.line_cd     = :line_cd
          GROUP BY A.plant_cd, B.defect_type
      ) F
        ON D.plant_cd  = F.plant_cd
       AND D.defect_cd = F.defect_cd
      WHERE D.plant_cd = :plant_cd
      ORDER BY D.defect_cd
      `,
      {
        plant_cd: cfg.params.plant_cd,
        wc_cd: cfg.params.wc_cd,
        line_cd: cfg.params.line_cd,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const rows = (r.rows || []).map((row) => {
      const cd = (row?.DEFECT_CD ?? row?.defect_cd ?? "").toString();
      const nm = (row?.DEFECT_NM ?? row?.defect_nm ?? "").toString();
      const fttQtyRaw = row?.FTT_QTY ?? row?.ftt_qty ?? 0;

      const fttQty = Number(fttQtyRaw) || 0;
      const hfpaQty = Number(hfpaByFtt[cd] ?? 0) || 0; // ✅ HFPA를 FTT 기준으로 출력

      return {
        value: cd,
        label: nm,
        ftt: fttQty,
        hfpa: hfpaQty,
      };
    });

    return res.status(200).json({
      ok: true,
      params: cfg.params,
      rows,
    });
  } catch (err) {
    console.error("❌ /oracle/defects 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});


/**
 * ✅ [FTT Status]
 * - PRODUCTION / REWORK / BC / FTT / DEFECT별 FTT/HFPA 반환
 *
 * GET /api/oracle/ftt-status
 */
router.get("/oracle/ftt-status", async (_req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const r = await conn.execute(
      `
      WITH
      PROD AS (
        SELECT NVL(SUM(PROD_QTY), 0) AS PROD_QTY
          FROM SMP_HFPA_HEAD A
         WHERE YMD = TO_CHAR(SYSDATE, 'YYYYMMDD')
           AND FN_GET_LINE_NAME(LINE_CD) = :wc_cd
           AND FN_LINE_NAME('7', LINE_CD || MLINE_CD) = :line_cd
      ),
      RB AS (
        SELECT
            NVL(SUM(DEFECT_QTY), 0) AS DEFECT_QTY,
            NVL(SUM(DECODE(FTT_TYPE, 'R', 0, 1)), 0) AS BC_QTY,
            NVL(
              SUM(
                CASE
                  WHEN FTT_TYPE = 'R'
                   AND REWORK_COUNT = 1
                  THEN 1
                  ELSE 0
                END
              )
            , 0) AS REWORK_QTY,
            NVL(
              SUM(
                CASE
                  WHEN FTT_TYPE = 'R'
                   AND REWORK_COUNT = 2
                  THEN 1
                  ELSE 0
                END
              )
            , 0) AS MULTI_REWORK_QTY
          FROM DMQM_FTT_RESULT
         WHERE FTT_DATE    = TO_CHAR(SYSDATE, 'YYYYMMDD')
           AND PLANT_CD    = :plant_cd
           AND WORK_CENTER = :wc_cd
           AND LINE_CD     = :line_cd
      ),
      PLANTNM AS (
        SELECT A.SUB_WC_NAME AS PLANT_NM
          FROM MSBS_WC_SUB A
          JOIN MSBS_WC_SUB B
            ON A.PLANT_CD = B.PLANT_CD
           AND A.SUB_WC_CD = B.PB_CD
         WHERE A.RESOURCE_TYPE = 'PB'
           AND B.RESOURCE_TYPE = 'LN'
           AND A.PLANT_CD = :plant_cd
           AND B.SUB_WC_CD = :line_cd
      ),
      LINENM AS (
        SELECT DECODE(
                 SUB_WC_CD,
                 'FGAID', 'NBY',
                 TO_NUMBER(REGEXP_REPLACE(RESOURCE_NO, '[^0-9]'))
               ) AS LINE_NM
          FROM MSBS_WC_SUB
         WHERE RESOURCE_TYPE = 'LN'
           AND PLANT_CD = :plant_cd
           AND SUB_WC_CD = :line_cd
      )
      SELECT
          (SELECT PLANT_NM FROM PLANTNM) AS PLANT_NM,
          (SELECT LINE_NM  FROM LINENM)  AS LINE_NM,

          /* ① Production */
          (SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB) AS PROD_QTY,

          /* ⑩ #defect */
          (SELECT DEFECT_QTY FROM RB) AS DEFECT_QTY,

          /* ⑨ Total rework */
          (SELECT REWORK_QTY FROM RB) AS REWORK_QTY,

          /* ⑪ B/C grade */
          (SELECT BC_QTY FROM RB) AS BC_QTY,

          /* ⑧ Multi Rework */
          (SELECT MULTI_REWORK_QTY FROM RB) AS MULTI_REWORK_QTY,

          /* ⑦ 1st Rework */
          (SELECT REWORK_QTY FROM RB) - (SELECT MULTI_REWORK_QTY FROM RB) AS "1ST_REWORK_QTY",

          /* ② FTT = (①-⑨-⑪)/①*100% */
          CASE
            WHEN NVL((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB), 0) = 0
              THEN NULL
            ELSE ROUND(
              (
                (
                  ((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB))
                  - (SELECT REWORK_QTY FROM RB)
                  - (SELECT BC_QTY FROM RB)
                )
                / ((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB))
              ) * 100
            , 1)
          END AS FTT_RATE,

          /* ③ Rework Rate = ⑨/① */
          CASE
            WHEN NVL((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB), 0) = 0
              THEN NULL
            ELSE ROUND(
              (SELECT REWORK_QTY FROM RB)
              / ((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB))
            , 1)
          END AS REWORK_RATE,

          /* ④ DPU = ⑩/① (소수 2자리) */
          CASE
            WHEN NVL((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB), 0) = 0
              THEN NULL
            ELSE ROUND(
              (SELECT DEFECT_QTY FROM RB)
              / ((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB))
            , 2)
          END AS DPU,

          /* ⑤ DPMO = ⑩/(①*25)*1000000 (정수) */
          CASE
            WHEN NVL((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB), 0) = 0
              THEN NULL
            ELSE ROUND(
              (SELECT DEFECT_QTY FROM RB)
              / (((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB)) * 25)
              * 1000000
            , 0)
          END AS DPMO,

          /* ⑥ Reject rate = ⑪/① */
          CASE
            WHEN NVL((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB), 0) = 0
              THEN NULL
            ELSE ROUND(
              (SELECT BC_QTY FROM RB)
              / ((SELECT PROD_QTY FROM PROD) + (SELECT BC_QTY FROM RB))
            , 1)
          END AS REJECT_RATE,

          /* ⑫ Rework Effectiveness = ⑦/⑨*100% */
          CASE
            WHEN NVL((SELECT REWORK_QTY FROM RB), 0) = 0
              THEN NULL
            ELSE ROUND(
              (
                (
                  ((SELECT REWORK_QTY FROM RB) - (SELECT MULTI_REWORK_QTY FROM RB))
                  / (SELECT REWORK_QTY FROM RB)
                ) * 100
              )
            , 1)
          END AS REWORK_EFFECTIVENESS
      FROM DUAL
      `,
      {
        plant_cd: cfg.params.plant_cd,
        wc_cd: cfg.params.wc_cd,
        line_cd: cfg.params.line_cd,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    return res.status(200).json({
      ok: true,
      params: cfg.params,
      rows: r.rows || [],
    });
  } catch (err) {
    console.error("❌ /oracle/ftt-status 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [FTT Template V1]
 * - SP_FTT_TEMPLATE_GET_V1 호출해서 리포트 ROW 반환
 *
 * GET /api/oracle/ftt-template-v1?from_date=YYYYMMDD&to_date=YYYYMMDD&wc_cd=...&line_cd=...&plant_cd=...
 *
 * - Query 파라미터
 *   - from_date (필수)
 *   - to_date   (필수)
 *   - wc_cd     (필수)
 *   - line_cd   (필수)
 *   - plant_cd  (옵션) : 있으면D V_PLANT_CD로 전달, 없으면 NULL 전달
 */
router.get("/oracle/ftt-template-v1", async (req, res) => {
  const from_date = (req?.query?.from_date ?? "").toString().trim();
  const to_date = (req?.query?.to_date ?? "").toString().trim();

  const wc_cd_raw = (req?.query?.wc_cd ?? "").toString().trim();
  const line_cd_raw = (req?.query?.line_cd ?? "").toString().trim();
  const plant_cd_raw = (req?.query?.plant_cd ?? "").toString().trim();

  const wc_cd = wc_cd_raw ? wc_cd_raw : null;
  const line_cd = line_cd_raw ? line_cd_raw : null;
  const plant_cd = plant_cd_raw ? plant_cd_raw : null;

  const missing = [];
  if (!from_date) missing.push("from_date");
  if (!to_date) missing.push("to_date");

  if (missing.length) {
    return res.status(400).json({
      ok: false,
      error: `${missing.join(", ")}가 필요합니다.`,
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const binds = {
      V_F_DATE: from_date,
      V_T_DATE: to_date,
      V_PLANT_CD: plant_cd, // ✅ 옵션
      V_WC_CD: wc_cd, // ✅ 옵션
      V_LINE_CD: line_cd, // ✅ 옵션

      V_P_ERROR_CODE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 200,
      },
      V_P_ROW_COUNT: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
      V_P_ERROR_NOTE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
      V_P_RETURN_STR: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
      V_P_ERROR_STR: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
      V_ERRORSTATE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 200,
      },
      V_ERRORPROCEDURE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
      CV_1: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR },
    };

    const result = await conn.execute(
      `
      BEGIN
        SP_FTT_TEMPLATE_GET_V1(
          :V_F_DATE,
          :V_T_DATE,
          :V_PLANT_CD,
          :V_WC_CD,
          :V_LINE_CD,
          :V_P_ERROR_CODE,
          :V_P_ROW_COUNT,
          :V_P_ERROR_NOTE,
          :V_P_RETURN_STR,
          :V_P_ERROR_STR,
          :V_ERRORSTATE,
          :V_ERRORPROCEDURE,
          :CV_1
        );
      END;
      `,
      binds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    // ✅ refcursor fetch
    const rs = result?.outBinds?.CV_1;
    const rows = [];

    if (rs) {
      try {
        while (true) {
          const chunk = await rs.getRows(1000);
          if (!chunk || chunk.length === 0) break;
          rows.push(...chunk);
        }
      } finally {
        try {
          await rs.close();
        } catch (e) {}
      }
    }

    return res.status(200).json({
      ok: true,
      params: {
        from_date,
        to_date,
        wc_cd,
        line_cd,
        plant_cd,
      },
      out: {
        V_P_ERROR_CODE: result?.outBinds?.V_P_ERROR_CODE ?? null,
        V_P_ROW_COUNT: result?.outBinds?.V_P_ROW_COUNT ?? null,
        V_P_ERROR_NOTE: result?.outBinds?.V_P_ERROR_NOTE ?? null,
        V_P_RETURN_STR: result?.outBinds?.V_P_RETURN_STR ?? null,
        V_P_ERROR_STR: result?.outBinds?.V_P_ERROR_STR ?? null,
        V_ERRORSTATE: result?.outBinds?.V_ERRORSTATE ?? null,
        V_ERRORPROCEDURE: result?.outBinds?.V_ERRORPROCEDURE ?? null,
      },
      rows,
    });
  } catch (err) {
    console.error("❌ /oracle/ftt-template-v1 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

/**
 * ✅ [FTT Result Save V1]
 * - SP_DMQM_FTT_RESULT_SAVE_V1 호출해서 저장
 *
 * POST /api/oracle/ftt-result-save-v1
 *
 * Body(JSON)
 *  - material_cd
 *  - style_cd
 *  - size_cd
 *  - ftt_type
 *  - defect_type  (예: "001" 또는 "001,002,003")
 *  - rework_count
 *  - defect_qty
 *  - creator
 *  - create_pc
 */
router.post("/oracle/ftt-result-save-v1", async (req, res) => {
  const cfg = await loadCommonParams();
  if (!cfg.ok) {
    return res.status(400).json({
      ok: false,
      error: cfg.error,
      configPath: cfg.configPath,
    });
  }

  const toStrOrNull = (v) => (v === undefined || v === null ? null : String(v));
  const toNumOrNull = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const material_cd = toStrOrNull(req?.body?.material_cd);
  const style_cd = toStrOrNull(req?.body?.style_cd);
  const size_cd = toStrOrNull(req?.body?.size_cd);
  const ftt_type = toStrOrNull(req?.body?.ftt_type);
  const defect_type = toStrOrNull(req?.body?.defect_type); // "001" or "001,002"
  const rework_count = toNumOrNull(req?.body?.rework_count);
  const defect_qty = toNumOrNull(req?.body?.defect_qty);
  const creator = toStrOrNull(req?.body?.creator);
  const create_pc = toStrOrNull(req?.body?.create_pc);

  const missing = [];
  if (!material_cd) missing.push("material_cd");
  if (!style_cd) missing.push("style_cd");
  // if (!size_cd) missing.push("size_cd");
  if (!ftt_type) missing.push("ftt_type");
  if (!defect_type) missing.push("defect_type");
  if (ftt_type !== "R" && !size_cd) missing.push("size_cd");
  if (rework_count === null) missing.push("rework_count");
  if (defect_qty === null) missing.push("defect_qty");
  if (!creator) missing.push("creator");
  if (!create_pc) missing.push("create_pc");

  if (missing.length) {
    return res.status(400).json({
      ok: false,
      error: `${missing.join(", ")}가 필요합니다.`,
    });
  }

  if (Number.isNaN(rework_count) || Number.isNaN(defect_qty)) {
    return res.status(400).json({
      ok: false,
      error: "rework_count, defect_qty는 숫자여야 합니다.",
    });
  }

  let conn;
  try {
    conn = await getConnection();

    const binds = {
      V_PLANT_CD: cfg.params.plant_cd,
      V_WC_CD: cfg.params.wc_cd,
      V_LINE_CD: cfg.params.line_cd,

      V_MATERIAL_CD: material_cd,
      V_STYLE_CD: style_cd,
      V_SIZE_CD: size_cd,
      V_FTT_TYPE: ftt_type,
      V_DEFECT_TYPE: defect_type,

      V_REWORK_COUNT: rework_count,
      V_DEFECT_QTY: defect_qty,

      V_CREATOR: creator,
      V_CREATE_PC: create_pc,

      V_P_ERROR_CODE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 200,
      },
      V_P_ROW_COUNT: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
      V_P_ERROR_NOTE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
      V_P_RETURN_STR: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
      V_P_ERROR_STR: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
      V_ERRORSTATE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 200,
      },
      V_ERRORPROCEDURE: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 4000,
      },
    };

    const result = await conn.execute(
      `
      BEGIN
        SP_DMQM_FTT_RESULT_SAVE_V1(
          :V_PLANT_CD,
          :V_WC_CD,
          :V_LINE_CD,
          :V_MATERIAL_CD,
          :V_STYLE_CD,
          :V_SIZE_CD,
          :V_FTT_TYPE,
          :V_DEFECT_TYPE,
          :V_REWORK_COUNT,
          :V_DEFECT_QTY,
          :V_CREATOR,
          :V_CREATE_PC,
          :V_P_ERROR_CODE,
          :V_P_ROW_COUNT,
          :V_P_ERROR_NOTE,
          :V_P_RETURN_STR,
          :V_P_ERROR_STR,
          :V_ERRORSTATE,
          :V_ERRORPROCEDURE
        );
      END;
      `,
      binds,
      { autoCommit: true },
    );

    return res.status(200).json({
      ok: true,
      params: {
        ...cfg.params,
        material_cd,
        style_cd,
        size_cd,
        ftt_type,
        defect_type,
        rework_count,
        defect_qty,
        creator,
        create_pc,
      },
      out: {
        V_P_ERROR_CODE: result?.outBinds?.V_P_ERROR_CODE ?? null,
        V_P_ROW_COUNT: result?.outBinds?.V_P_ROW_COUNT ?? null,
        V_P_ERROR_NOTE: result?.outBinds?.V_P_ERROR_NOTE ?? null,
        V_P_RETURN_STR: result?.outBinds?.V_P_RETURN_STR ?? null,
        V_P_ERROR_STR: result?.outBinds?.V_P_ERROR_STR ?? null,
        V_ERRORSTATE: result?.outBinds?.V_ERRORSTATE ?? null,
        V_ERRORPROCEDURE: result?.outBinds?.V_ERRORPROCEDURE ?? null,
      },
    });
  } catch (err) {
    console.error("❌ /oracle/ftt-result-save-v1 실패:", err);
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  } finally {
    try {
      if (conn) await conn.close();
    } catch (e) {}
  }
});

export default router;
