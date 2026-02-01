//C:\Changshin\test\electron-app_final\src\main\routes\mssqlRoutes.js
import express from "express";
import { sql, poolPromise } from "@shared/mssql2";
const router = express.Router();

/**
 * ✅ 1. E-SCAN 메인 테이블 데이터 조회 (SP_ESCAN_MAIN_Q 기반)
 */
router.get("/test", (req, res) => {
  res.send("✅ MSSQL 라우터 정상 연결됨");
});

router.get("/escan-main", async (req, res) => {
  const { plant, work_date, storage, center } = req.query;

  console.log("📦 [MSSQL] /escan-main 호출됨:", { plant, work_date, storage, center });

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT", sql.VarChar(4), plant)
      .input("WORK_DATE", sql.VarChar(8), work_date)
      .input("PUTAWAYSTORAGELOCATION", sql.VarChar(50), storage)
      .input("WORK_CENTER", sql.VarChar(5), center)
      .execute("SP_ESCAN_MAIN_Q_WITH");

    const rows = result.recordset || [];
    res.json(rows);
  } catch (err) {
    console.error("❌ /escan-main 실패:", err);
    res.status(500).json({ error: "MSSQL 데이터 조회 실패", detail: err.message });
  }
});

// ✅ 1-2. INPUT/PROD 요약 조회용 추가 (SP_ESCAN_ECT_Q)
router.get("/escan-extra", async (req, res) => {
  const { plant, work_date, storage, center } = req.query;
  console.log("📦 [MSSQL] /escan-extra 호출됨:", { plant, work_date, storage, center });

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT", sql.VarChar(4), plant)
      .input("WORK_DATE", sql.VarChar(8), work_date)
      .input("PUTAWAYSTORAGELOCATION", sql.VarChar(50), storage || "")
      .input("WORK_CENTER", sql.VarChar(5), center || "")
      .execute("SP_ESCAN_ECT_Q");

    res.json(result.recordset || []);
  } catch (err) {
    console.error("❌ /escan-extra 실패:", err);
    res.status(500).json({ error: "MSSQL escan-extra 실패", detail: err.message });
  }
});


/**
 * ✅ 2. E-SCAN 디테일 데이터 조회 (SP_ESCAN_DETAIL_Q 기반)
 */
router.get("/escan-detail", async (req, res) => {
  const { plant_cd, work_date, center, material_code, size_cd, order_number, flag } = req.query;

   console.log("📦 [MSSQL] /escan-detail 호출됨:", {
    plant_cd, // ✅ 이건 이제 제대로 찍힐 것
    work_date, center, material_code, size_cd, order_number
  });

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT_CD", sql.VarChar(4), plant_cd || null)
      .input("WORK_DATE", sql.VarChar(8), work_date || "20250523")
      .input("WORK_CENTER", sql.VarChar(20), center || "")
      .input("MATERIAL_CODE", sql.VarChar(50), material_code || "")
      .input("SIZE_CD", sql.VarChar(10), size_cd || "")
      .input("ORDER_NUMBER", sql.VarChar(20), order_number || "")
      .input("FLAG", sql.NVarChar(5), flag || "")
      .execute("SP_ESCAN_DETAIL_Q");

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ /escan-detail 실패:", err);
    res.status(500).json({ error: "MSSQL escan-detail 실패", detail: err.message });
  }
});

/**
 * ✅ 2-1. E-SCAN 디테일 카드 덮어쓰기용 조회 (SP_ESCAN_DETAIL_Q_V2 기반)
 */
router.get("/escan-detail-v2", async (req, res) => {
  const { plant_cd, sfc_cd, work_center } = req.query;

  console.log("📦 [MSSQL] /escan-detail-v2 호출됨:", {
    plant_cd,
    sfc_cd,
    work_center
  });

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT_CD", sql.NVarChar(4), plant_cd || "")
      .input("SFC_CD", sql.NVarChar(10), sfc_cd || "")
      .input("WORK_CENTER", sql.NVarChar(8), work_center || "")
      .execute("SP_ESCAN_DETAIL_Q_V2");

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ /escan-detail-v2 실패:", err);
    res.status(500).json({ error: "MSSQL escan-detail-v2 실패", detail: err.message });
  }
});


/**
 * ✅ 3-1. E-SCAN 디테일_확정 저장 (PROC_SAVE_PCARD_CONFIRM)
 */

router.post("/escan-detail-save", async (req, res) => {
   console.log("test");
  const list = req.body.list;
  console.log("🔥 API 수신 payload:", req.body.list);

  try {
    const pool = await poolPromise;

    for (const item of list) {
      console.log("🧾 saving item:", item); // ← 추가
      await pool.request()
        .input("PLANT_CD", sql.VarChar(4), item.PLANT_CD)
        .input("WORK_CENTER", sql.VarChar(8), item.WORK_CENTER)
        .input("ORDER_NUMBER", sql.NVarChar(10), item.ORDER_NUMBER)
        .input("SEQ", sql.VarChar(5), item.SEQ)
        .input("MATERIAL_CODE", sql.VarChar(50), item.MATERIAL_CODE)
        .input("SIZE_CD", sql.VarChar(2), item.SIZE_CD)
        .input("ITPO_TYPE", sql.Char(1), item.ITPO_TYPE)
        .input("SFC", sql.NVarChar(10), item.SFC ?? "")  // ✅ 추가
        .execute("SP_PROC_SAVE_PCARD_CONFIRM");
    }

    res.json({ message: "Bulk save OK" });
  } catch (err) {
    console.error("❌ escan-detail-save 실패:", err);
    res.status(500).json({ error: "Failed to save", detail: err.message });
  }
});

/**
 * ✅ 3-2. E-SCAN 디테일_확정 저장 (SP_PROC_SAVE_PCARD)
 */
router.post("/escan-detail-save_v2", async (req, res) => {
  const list = req.body.list;

  console.log("🔥 [v2] API 수신 payload:", list); // ✅ 여기도 확인

  try {
    const pool = await poolPromise;

    for (const item of list) {
      console.log("🧾 [v2] saving item:", item); // ✅ 여기서 SCAN_TYPE 출력

      await pool.request()
        .input("PLANT_CD", sql.NVarChar(4), item.PLANT_CD)
        .input("BAR_KEY", sql.NVarChar(100), item.BAR_KEY)
        .input("SFC_CD", sql.NVarChar(10), item.SFC)
        .input("PCARD_SEQ", sql.NVarChar(30), item.SEQ)
        .input("PCARD_QTY", sql.Decimal(10, 3), item.PCARD_QTY)
        .input("WORK_CENTER", sql.NVarChar(50), item.WORK_CENTER)
        .input("ORDER_NUMBER", sql.NVarChar(10), item.ORDER_NUMBER)
        .input("DEVICE_ID", sql.NVarChar(20), item.DEVICE_ID || "SYSTEM")
        .input("USER_IP", sql.NVarChar(50), item.USER_IP || "0.0.0.0")
        .input("SCAN_TYPE", sql.NVarChar(1), item.SCAN_TYPE) // ✅ 이게 null이면 에러
        .execute("SP_PROC_SAVE_PCARD");
    }

    res.json({ message: "✅ 저장 완료" });
  } catch (err) {
    console.error("❌ 저장 실패:", err);
    res.status(500).json({ error: "Failed to save", detail: err.message });
  }
});



/**
 * ✅ 4. 기준 정보 가져오기 
 */

router.get("/basic-info", async (req, res) => {
  const { type, plant_cd } = req.query;

  console.log("📦 [MSSQL] /basic-info 호출됨:", { type, plant_cd });

  if (!type) {
    return res.status(400).json({ error: "Missing required parameter: type" });
  }

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("TYPE", sql.VarChar(10), type)
      .input("PLANT_CD", sql.VarChar(10), plant_cd || null)
      .execute("SP_BASIC_INFO");

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ /basic-info 실패:", err);
    res.status(500).json({ error: "MSSQL basic-info 실패", detail: err.message });
  }
});
router.get("/sfc-status", async (req, res) => {
  const { sfc } = req.query;
  if (!sfc) {
    console.warn("⚠️ /sfc-status 호출 → sfc 파라미터 누락");
    return res.status(400).json({ error: "sfc 파라미터 누락" });
  }

  console.log(`📡 [MSSQL] /sfc-status 호출됨 → SFC: ${sfc}`);

  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("sfc", sql.NVarChar, sfc)
      .query(`SELECT STATUS_CODE FROM DMPD_SFC WHERE SFC = @sfc`);

    if (result.recordset.length === 0) {
      console.warn(`⚠️ SFC 상태 없음 → SFC: ${sfc}`);
      return res.status(404).json({ error: "해당 SFC 없음" });
    }

    const status = result.recordset[0].STATUS_CODE;

    console.log(`✅ SFC 상태 조회 완료 → SFC: ${sfc}, STATUS_CODE: ${status}`);
    return res.status(200).json({ status });
  } catch (err) {
    console.error(`❌ SFC 상태 조회 실패 → SFC: ${sfc}, 에러: ${err.message}`);
    return res.status(500).json({ error: "DB 조회 실패" });
  }
});




/**
 * ✅ 5. TMP_PCARD_SFC_MAPPING 저장 API
 * 프론트에서 카드-SFC 매핑을 백엔드에 저장할 때 사용
 * body.list = [{ ORDER_NUMBER, SEQ, SFC }, ...]
 */
router.post("/save-mapping", async (req, res) => {
  const list = req.body.list;

  try {
    const pool = await poolPromise;

    for (const item of list) {
      await pool.request()
        .input("ORDER_NUMBER", sql.NVarChar(10), item.ORDER_NUMBER)
        .input("SEQ", sql.VarChar(5), item.SEQ)
        .input("SFC", sql.NVarChar(128), item.SFC)
        .execute("SP_PROC_SAVE_PCARD_SFC_MAPPING");
    }

    res.json({ message: "매핑 저장 완료" });
  } catch (err) {
    console.error("❌ 매핑 저장 실패:", err);
    res.status(500).json({ error: "매핑 저장 실패", detail: err.message });
  }
});




// ✅ 6. [NEW] SAP 처리 성공 시만 UPLOAD_YN = 'Y' 업데이트 API
// @body: { plant_cd, sfc, seqList: [1,2,3,...] }
router.post("/update-upload-yn", async (req, res) => {
  const { plant_cd, sfc, scan_type, seqList } = req.body;

  if (!plant_cd || !sfc || !scan_type || !Array.isArray(seqList) || seqList.length === 0) {
    return res.status(400).json({ error: "❌ 필수 파라미터 누락 또는 SEQ 배열 없음" });
  }

  try {
    const pool = await poolPromise;

    // ✅ 1. 콘솔로 요청 파라미터 전체 확인
    console.log("📦 요청 파라미터:", { plant_cd, sfc, scan_type, seqList });

    const placeholders = seqList.map((_, idx) => `@seq${idx}`).join(", ");
    const request = pool.request();

    // ✅ 2. 파라미터 로그 출력
    request.input("plant_cd", sql.NVarChar(4), plant_cd);
    request.input("sfc", sql.NVarChar(10), sfc);
    request.input("scan_type", sql.NVarChar(10), scan_type);

    seqList.forEach((seq, idx) => {
      console.log(`🔹 바인딩 seq${idx}:`, seq); // ✅ 바인딩 로그
      request.input(`seq${idx}`, sql.NVarChar(20), String(seq)); // 문자열로 강제 변환
    });

    // ✅ 3. 최종 실행 쿼리도 콘솔 출력
    const query = `
    UPDATE A
    SET 
      A.UPLOAD_YN = 'Y',
      A.UPLOAD_DATE = CONVERT(CHAR(8), GETDATE(), 112), -- 'YYYYMMDD'
      A.UPLOAD_DT = GETDATE()
    FROM DMPD_EPCARD_SCAN AS A
    WHERE A.PLANT_CD = @plant_cd
      AND A.SFC_CD = @sfc
      AND A.SCAN_TYPE = @scan_type
      AND A.PCARD_SEQ IN (${placeholders})
  `;


    console.log("🧾 실행할 쿼리:", query);

    const result = await request.query(query);
    console.log("✅ 업데이트 결과:", result.rowsAffected);

    res.json({ message: `✅ ${result.rowsAffected[0]}건 업데이트 완료`, affected: result.rowsAffected[0] });
  } catch (err) {
    console.error("❌ UPLOAD_YN 업데이트 실패:", err);
    res.status(500).json({ error: "UPLOAD_YN 업데이트 실패", detail: err.message });
  }
});

// api/mssql/interface-insert-order  (JS 버전: 타입 주석 없음, 기존 구조 유지 + 신규 컬럼 포함)

router.post("/interface-insert-order", async (req, res) => {
  const {
    plant, orderNumber, status, releaseStatus, executionStatus, orderType, orderCategory,
    materialCode, materialVersion, materialDescription, bomNumber, bomVersion, bomType,
    routingNumber, routingVersion, routingType,
    productionQuantity, productionUnitOfMeasure, buildQuantity, orderedQuantity, releasedQuantity,
    doneQuantity, goodsReceiptQuantity, priority,
    plannedStartDate, plannedCompletionDate, scheduledStartDate, scheduledCompletionDate,
    productionVersion, putawayStorageLocation, erpRoutingGroup, warehouseNumber,
    workCenter, workCenterDesc,

    workDate,
    zcf_shift_cd, zcf_hh, zcf_seq, zcf_op_cd, zcf_op_nm,
    zcf_line_cd, zcf_line_nm, zcf_machine_cd, zcf_machine_nm,

    zcf_nt_line_cd, zcf_nt_line_nm, zcf_nt_machine_cd, zcf_nt_machine_nm,

    zcf_size_cd, zcf_model_cd, zcf_model_nm, zcf_style_cd, zcf_style_nm, zcf_gender_cd, zcf_part_nm,

    zcf_mcs_cd, zcf_mc_mcs_cd, zcf_mcs_nm, zcf_mcs_color_cd, zcf_mcs_color_nm, zcf_mcs_cd_option,

    zcf_batch_size, zcf_batch_type, zcf_batch_er_strd,
    zcf_nt_order_number,

    sfc, mv_order_yn, pop_if_yn
  } = req.body || {};

  const S = (v) => {
    const s = (v ?? "").toString().trim();
    return s.length ? s : "N/A";
  };
  const N = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

  try {
    const pool = await poolPromise;

    await pool
      .request()
      // 기본 메타
      .input("PLANT", sql.NVarChar, S(plant))
      .input("ORDER_NUMBER", sql.NVarChar, S(orderNumber))
      .input("STATUS", sql.NVarChar, S(status))
      .input("RELEASESTATUS", sql.NVarChar, S(releaseStatus ?? "RELEASED"))
      .input("EXECUTIONSTATUS", sql.NVarChar, S(executionStatus))
      .input("ORDERTYPE", sql.NVarChar, S(orderType))
      .input("ORDERCATEGORY", sql.NVarChar, S(orderCategory))
      .input("MATERIAL_CODE", sql.NVarChar, S(materialCode))
      .input("MATERIAL_VERSION", sql.NVarChar, S(materialVersion))
      .input("MATERIAL_DESCRIPTION", sql.NVarChar, S(materialDescription))
      .input("BOM_NUMBER", sql.NVarChar, S(bomNumber))
      .input("BOM_VERSION", sql.NVarChar, S(bomVersion))
      .input("BOM_TYPE", sql.NVarChar, S(bomType))
      .input("ROUTING_NUMBER", sql.NVarChar, S(routingNumber))
      .input("ROUTING_VERSION", sql.NVarChar, S(routingVersion))
      .input("ROUTING_TYPE", sql.NVarChar, S(routingType))
      .input("PRODUCTIONQUANTITY", sql.Float, N(productionQuantity))
      .input("PRODUCTIONUNITOFMEASURE", sql.NVarChar, S(productionUnitOfMeasure))
      .input("BUILDQUANTITY", sql.Float, N(buildQuantity))
      .input("ORDEREDQUANTITY", sql.Float, N(orderedQuantity))
      .input("RELEASEDQUANTITY", sql.Float, N(releasedQuantity))
      .input("DONEQUANTITY", sql.Float, N(doneQuantity))
      .input("GOODSRECEIPTQUANTITY", sql.Float, N(goodsReceiptQuantity))
      .input("PRIORITY", sql.Int, N(priority))
      // 날짜 필드: SP와 맞춰 NVARCHAR로 전달
      .input("PLANNEDSTARTDATE", sql.NVarChar, S(plannedStartDate))
      .input("PLANNEDCOMPLETIONDATE", sql.NVarChar, S(plannedCompletionDate))
      .input("WORK_DATE", sql.Char(8), null) 
      .input("SCHEDULEDSTARTDATE", sql.NVarChar, S(scheduledStartDate))
      .input("SCHEDULEDCOMPLETIONDATE", sql.NVarChar, S(scheduledCompletionDate))
      .input("WORK_CENTER", sql.NVarChar, workCenter ?? "")
      .input("WORK_CENTER_DESCRIPTION", sql.NVarChar, S(workCenterDesc))
      .input("PRODUCTIONVERSION", sql.NVarChar, S(productionVersion))
      .input("PUTAWAYSTORAGELOCATION", sql.NVarChar, S(putawayStorageLocation))
      .input("ERPROUTINGGROUP", sql.NVarChar, S(erpRoutingGroup))
      .input("WAREHOUSENUMBER", sql.NVarChar, S(warehouseNumber))

      // ✅ 불필요/미존재 파라미터 제거 (이 두 줄 삭제가 핵심)
      // .input("ZCF_MACHINE", sql.NVarChar, null)
      // .input("ZCF_EQUIPMENT", sql.NVarChar, null)

      // 확장 메타
      .input("ZCF_SHIFT_CD", sql.NVarChar, S(zcf_shift_cd))
      .input("ZCF_HH", sql.NVarChar, S(zcf_hh))
      .input("ZCF_SEQ", sql.Float, N(zcf_seq))
      .input("ZCF_OP_CD", sql.NVarChar, S(zcf_op_cd))
      .input("ZCF_OP_NM", sql.NVarChar, S(zcf_op_nm))
      .input("ZCF_LINE_CD", sql.NVarChar, S(zcf_line_cd))
      .input("ZCF_LINE_NM", sql.NVarChar, S(zcf_line_nm))
      .input("ZCF_MACHINE_CD", sql.NVarChar, S(zcf_machine_cd))
      .input("ZCF_MACHINE_NM", sql.NVarChar, S(zcf_machine_nm))

      .input("ZCF_NT_LINE_CD", sql.NVarChar, S(zcf_nt_line_cd))
      .input("ZCF_NT_LINE_NM", sql.NVarChar, S(zcf_nt_line_nm))
      .input("ZCF_NT_MACHINE_CD", sql.NVarChar, S(zcf_nt_machine_cd))
      .input("ZCF_NT_MACHINE_NM", sql.NVarChar, S(zcf_nt_machine_nm))

      .input("ZCF_SIZE_CD", sql.NVarChar, S(zcf_size_cd))
      .input("ZCF_MODEL_CD", sql.NVarChar, S(zcf_model_cd))
      .input("ZCF_MODEL_NM", sql.NVarChar, S(zcf_model_nm))
      .input("ZCF_STYLE_CD", sql.NVarChar, S(zcf_style_cd))
      .input("ZCF_STYLE_NM", sql.NVarChar, S(zcf_style_nm))
      .input("ZCF_GENDER_CD", sql.NVarChar, S(zcf_gender_cd))
      .input("ZCF_PART_NM", sql.NVarChar, S(zcf_part_nm))

      .input("ZCF_MCS_CD", sql.NVarChar, S(zcf_mcs_cd))
      .input("ZCF_MC_MCS_CD", sql.NVarChar, S(zcf_mc_mcs_cd))
      .input("ZCF_MCS_NM", sql.NVarChar, S(zcf_mcs_nm))
      .input("ZCF_MCS_COLOR_CD", sql.NVarChar, S(zcf_mcs_color_cd))
      .input("ZCF_MCS_COLOR_NM", sql.NVarChar, S(zcf_mcs_color_nm))
      .input("ZCF_MCS_CD_OPTION", sql.NVarChar, S(zcf_mcs_cd_option))

      .input("ZCF_BATCH_SIZE", sql.Int, N(zcf_batch_size))
      .input("ZCF_BATCH_TYPE", sql.NVarChar, S(zcf_batch_type))
      .input("ZCF_BATCH_ER_STRD", sql.Int, N(zcf_batch_er_strd))

      .input("ZCF_NT_ORDER_NUMBER", sql.NVarChar, S(zcf_nt_order_number))

      .input("SFC", sql.NVarChar, S(sfc))
      .input("MV_ORDER_YN", sql.NVarChar, S(mv_order_yn))
      .input("POP_IF_YN", sql.NVarChar, S(pop_if_yn))

      .execute("SP_INTERFACE_INSERT_ORDER");

    res.status(200).json({ result: "ORDER 저장 완료" });
  } catch (err) {
    const message = (err && err.message) ? err.message : String(err);
    res.status(500).json({ error: "ORDER 저장 실패", message });
  }
});




//api/mssql/interface-insert-sfc

router.post("/interface-insert-sfc", async (req, res) => {
  const {
    plant,
    sfc,
    workCenter,
    materialCode,
    materialVersion,
    materialDescription,
    bomNumber,
    bomVersion,
    bomType,
    routingNumber,
    routingVersion,
    routingType,
    orderNumber,
    orderType,
    status,
    plannedStartDate,
    plannedCompletionDate,
    quantity,
  } = req.body;

  try {
    const qty = quantity ?? 0;
    const sizeCd = materialDescription?.trim().slice(-2) ?? "";
    const pool = await poolPromise;

    await pool.request()
      .input("PLANT_CD", sql.NVarChar, plant)
      .input("SFC", sql.NVarChar, sfc)
      .input("WORK_CENTER", sql.NVarChar, workCenter)
      .input("MATERIAL_CODE", sql.NVarChar, materialCode)
      .input("MATERIAL_VERSION", sql.NVarChar, materialVersion)
      .input("MATERIAL_DESCRIPTION", sql.NVarChar, materialDescription)
      .input("SIZE_CD", sql.NVarChar, sizeCd)
      .input("BOM_NUMBER", sql.NVarChar, bomNumber)
      .input("BOM_VERSION", sql.NVarChar, bomVersion)
      .input("BOM_TYPE", sql.NVarChar, bomType)
      .input("ROUTING_NUMBER", sql.NVarChar, routingNumber)
      .input("ROUTING_VERSION", sql.NVarChar, routingVersion)
      .input("ROUTING_TYPE", sql.NVarChar, routingType)
      .input("ORDER_NUMBER", sql.NVarChar, orderNumber)
      .input("ORDER_TYPE", sql.NVarChar, orderType)
      .input("ORDER_STATUS", sql.NVarChar, status)
      .input("WORK_DATE", sql.Char(8), null) 
      .input("ORDER_PLANNED_START", sql.DateTime, plannedStartDate)
      .input("ORDER_PLANNED_COMPLETE", sql.DateTime, plannedCompletionDate)
      .input("STATUS_CODE", sql.Int, 401) // 기본값 NEW
      .input("STATUS_DESCRIPTION", sql.NVarChar, "NEW")
      .input("QUANTITY", sql.Float, qty)
      .input("DEFAULTBATCHID", sql.NVarChar, null)
      .execute("SP_INTERFACE_INSERT_SFC");

    res.status(200).json({ result: "SFC 저장 완료", sfc });
  } catch (err) {
    console.error("❌ SFC 저장 오류:", err);
    res.status(500).json({ error: "SFC 저장 실패", message: err.message });
  }
});


/////////////////////////////TCP///////////////////////////

// 🔽 이 코드를 맨 아래에 추가 (router 정의 아래)
router.post("/save-tcp-log", async (req, res) => {
  const { deviceName, ipAddress, port, data } = req.body;

  if (!deviceName || !ipAddress || !port || !data) {
    return res.status(400).json({ error: "필수 필드(deviceName, ipAddress, port, data)가 누락되었습니다" });
  }

  try {
    const pool = await poolPromise;

    await pool.request()
      .input("DEVICE_NAME", sql.VarChar(50), deviceName)
      .input("IP_ADDRESS", sql.VarChar(50), ipAddress)
      .input("PORT", sql.Int, port)
      .input("DATA", sql.VarChar(sql.MAX), data)
      .input("CREATE_DT", sql.DateTime, new Date())
      .query(`
        INSERT INTO TCP_DATA_LOG (DEVICE_NAME, IP_ADDRESS, PORT, DATA, CREATE_DT)
        VALUES (@DEVICE_NAME, @IP_ADDRESS, @PORT, @DATA, @CREATE_DT)
      `);

    res.status(200).json({ message: "✅ TCP 로그 저장 완료" });
  } catch (err) {
    console.error("❌ TCP 로그 저장 실패:", err);
    res.status(500).json({ error: "TCP 로그 저장 실패", detail: err.message });
  }
});




/////////////////////////////Print///////////////////////////

// =============================================
// src/main/routes/mssqlRoutes.js (최종본)
// - /epcard/print-bulk
// - /epcard/print-start
// - /epcard/print-result
// =============================================
// 헬퍼
const asStr = (v) => String(v ?? '');
const cut = (v, n) => asStr(v).slice(0, n);
const nz  = (v, d) => (v ?? d);

// '1H' | '01H' | '10H' -> 항상 'NNH'
function normalizeDaySeq3(v) {
  const raw = asStr(v).trim().toUpperCase();
  const base = raw.endsWith('H') ? raw.slice(0, -1) : raw;
  const n = Math.max(0, Math.min(99, Number(base) || 0));
  return `${String(n).padStart(2, '0')}H`;
}

/**
 * PASSCARD 저장(업서트 전용) — 상태전이 하지 않음
 * body: { list: EPCardInsert[] }
 *   SP 시그니처: SP_ESCAN_DETAIL_PRINT (질문에 주신 ALTER 정의와 동일)
 */
router.post('/epcard/print-bulk', async (req, res) => {
  try {
    const list = Array.isArray(req.body?.list) ? req.body.list : [];
    if (list.length === 0) {
      return res.status(400).json({ error: 'list 비어 있음' });
    }

    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();

    for (const it of list) {
      // ▼ SP 파라미터 길이에 맞춰 컷팅
      const PLANT_CD         = cut(it.PLANT_CD, 4);
      const SFC_CD           = cut(it.SFC_CD ?? it.SFC, 10);           // NVARCHAR(10)
      const ORDER_NUMBER     = cut(it.ORDER_NUMBER, 10);               // NVARCHAR(10)
      const BAR_KEY          = cut(it.BAR_KEY, 100);                   // NVARCHAR(100)
      const PCARD_SEQ        = cut(it.PCARD_SEQ ?? it.SEQ, 10);        // NVARCHAR(10)

      const DAY_SEQ          = normalizeDaySeq3(it.DAY_SEQ);           // NVARCHAR(3)
      const PCARD_QTY        = Number(it.PCARD_QTY ?? it.QTY ?? 0);    // DECIMAL(10,3)

      const BD_CD            = cut(it.BD_CD, 3) || null;               // NVARCHAR(3) NULL
      const WORK_CENTER      = cut(it.WORK_CENTER, 50);                // NVARCHAR(50)

      // ✅ MATERIAL_CODE 추가(NVARCHAR(50)), NEXT_ORDER_NUMBER 없음
      const MATERIAL_CODE    = cut(it.MATERIAL_CODE ?? it.MATERIAL, 50) || null;
      const RESOURCE_CD      = cut(it.RESOURCE_CD, 10);                // NVARCHAR(10)
      const NEXT_RESOURCE_CD = cut(it.NEXT_RESOURCE_CD, 10) || null;   // NVARCHAR(10) NULL

      const STYLE_CD         = cut(it.STYLE_CD, 10);                   // NVARCHAR(10)
      const STYLE_NAME       = nz(it.STYLE_NAME, null);                // NVARCHAR(100) NULL
      const SIZE_CD          = cut(it.SIZE_CD ?? it.SIZE, 3);          // NVARCHAR(3)
      const GENDER_CD        = cut(it.GENDER_CD ?? 'WO', 3);           // NVARCHAR(3)
      const OP_CD            = cut(it.OP_CD ?? 'IPI', 3);              // NVARCHAR(3)
      const OP_NAME          = nz(it.OP_NAME ?? 'IP Injection', null); // NVARCHAR(100) NULL
      const PART_NAME        = nz(it.PART_NAME ?? 'MIDSOLE', null);    // NVARCHAR(100) NULL

      const DEVICE_ID        = cut(it.DEVICE_ID ?? 'POP_DEVICE_01', 20); // NVARCHAR(20)
      const USER_IP          = nz(it.USER_IP, null);                     // NVARCHAR(50) NULL

      // 하위호환(무시되지만 SP 파라미터 존재)
      const PRINT_YN         = 'N';
      const PRINT_CNT        = '0';
      const MARK_PRINTED     = 0;

      await new sql.Request(tx)
        .input('PLANT_CD',         sql.NVarChar(4),   PLANT_CD)
        .input('SFC_CD',           sql.NVarChar(10),  SFC_CD)
        .input('ORDER_NUMBER',     sql.NVarChar(10),  ORDER_NUMBER)
        .input('BAR_KEY',          sql.NVarChar(100), BAR_KEY)
        .input('PCARD_SEQ',        sql.NVarChar(10),  PCARD_SEQ)

        .input('DAY_SEQ',          sql.NVarChar(3),   DAY_SEQ)
        .input('PCARD_QTY',        sql.Decimal(10, 3), PCARD_QTY)

        .input('BD_CD',            sql.NVarChar(3),   BD_CD)
        .input('WORK_CENTER',      sql.NVarChar(50),  WORK_CENTER)

        // ❌ NEXT_ORDER_NUMBER 제거 (SP에 없음)
        .input('MATERIAL_CODE',    sql.NVarChar(50),  MATERIAL_CODE)
        .input('RESOURCE_CD',      sql.NVarChar(10),  RESOURCE_CD)
        .input('NEXT_RESOURCE_CD', sql.NVarChar(10),  NEXT_RESOURCE_CD)

        .input('STYLE_CD',         sql.NVarChar(10),  STYLE_CD)
        .input('STYLE_NAME',       sql.NVarChar(100), STYLE_NAME)
        .input('SIZE_CD',          sql.NVarChar(3),   SIZE_CD)
        .input('GENDER_CD',        sql.NVarChar(3),   GENDER_CD)
        .input('OP_CD',            sql.NVarChar(3),   OP_CD)
        .input('OP_NAME',          sql.NVarChar(100), OP_NAME)
        .input('PART_NAME',        sql.NVarChar(100), PART_NAME)

        .input('DEVICE_ID',        sql.NVarChar(20),  DEVICE_ID)
        .input('USER_IP',          sql.NVarChar(50),  USER_IP)

        // 하위호환
        .input('PRINT_YN',         sql.NVarChar(1),   PRINT_YN)
        .input('PRINT_CNT',        sql.NVarChar(3),   PRINT_CNT)
        .input('MARK_PRINTED',     sql.Bit,           MARK_PRINTED)

        .execute('SP_ESCAN_DETAIL_PRINT');
    }

    await tx.commit();
    return res.json({ ok: true, message: `✅ ${list.length}건 업서트 완료(PENDING)` });
  } catch (err) {
    try { /* ignore */ await sql.Transaction.prototype.rollback?.(); } catch {}
    console.error('❌ /epcard/print-bulk 실패:', err);
    return res.status(500).json({
      error: 'PASSCARD 벌크 저장 실패',
      detail: err?.message ?? String(err),
    });
  }
});


// src/main/routes/mssqlRoutes.js
router.post("/epcard/print-start", async (req, res) => {
  try {
    const b = req.body || {};
    const daySeq = normalizeDaySeq(b.DAY_SEQ);

    const pool = await poolPromise;
    const r = await pool.request()
      .input("PLANT_CD",     sql.NVarChar(4),    String(b.PLANT_CD ?? ""))
      .input("SFC_CD",       sql.NVarChar(10),   String(b.SFC_CD ?? ""))
      .input("ORDER_NUMBER", sql.NVarChar(10),   String(b.ORDER_NUMBER ?? ""))
      .input("BAR_KEY",      sql.NVarChar(100),   String(b.BAR_KEY ?? ""))
      .input("PCARD_SEQ",    sql.NVarChar(10),   String(b.PCARD_SEQ ?? ""))

      // ⬇️ 추가: BD_CD 전달 (없으면 'IP')
      .input("BD_CD",        sql.NVarChar(3),    String(b.BD_CD ?? "IP"))

      .input("DEVICE",       sql.NVarChar(80),   String(b.DEVICE ?? b.PRINT_DEVICE ?? ""))
      .input("STATE",        sql.NVarChar(16),   b.STATE ?? null)
      .input("ERR_CODE",     sql.NVarChar(100),  b.ERR_CODE ?? null)
      .input("ERR_MSG",      sql.NVarChar(4000), b.ERR_MSG ?? null)
      .input("DAY_SEQ",      sql.NVarChar(6),    daySeq)
      .execute("SP_EPCARD_PRINT_START");

    const affected = r.recordset?.[0]?.affected ?? r.rowsAffected?.[0] ?? 0;
    res.json({ ok: true, affected });
  } catch (err) {
    console.error("❌ /epcard/print-start 실패:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


router.post("/epcard/print-result", async (req, res) => {
  try {
    const b = req.body || {};
    const key = {
      PLANT_CD:     String(b.PLANT_CD ?? ""),
      SFC_CD:       String(b.SFC_CD ?? ""),
      ORDER_NUMBER: String(b.ORDER_NUMBER ?? ""),
      BAR_KEY:      String(b.BAR_KEY ?? ""),
      PCARD_SEQ:    String(b.PCARD_SEQ ?? "")
    };

    const OK      = !!b.OK;
    const errCode = b.ERR_CODE ?? null;
    const errMsg  = b.ERR_MSG  ?? null;
    const device  = b.DEVICE   ?? b.PRINT_DEVICE ?? null;
    const daySeq  = normalizeDaySeq(b.DAY_SEQ);

    const errU = String(errCode || "").toUpperCase();
    const stateHint =
      OK ? "SUCCESS" :
      (String(b.STATE || "").toUpperCase() === "SPOOLED" ||
      errU === "UNVERIFIED" || errU.startsWith("SPOOLED_"))
        ? "SPOOLED"
        : "ERROR";

    const pool = await poolPromise;
    const r = await pool.request()
      .input("PLANT_CD",     sql.NVarChar(4),    key.PLANT_CD)
      .input("SFC_CD",       sql.NVarChar(10),   key.SFC_CD)
      .input("ORDER_NUMBER", sql.NVarChar(10),   key.ORDER_NUMBER)
      .input("BAR_KEY",      sql.NVarChar(100),   key.BAR_KEY)
      .input("PCARD_SEQ",    sql.NVarChar(10),   key.PCARD_SEQ)
      .input("OK",           sql.Bit,            OK ? 1 : 0)
      .input("ERR_CODE",     sql.NVarChar(100),  errCode)
      .input("ERR_MSG",      sql.NVarChar(4000), errMsg)
      .input("STATE",        sql.NVarChar(16),   stateHint)
      .input("DEVICE",       sql.NVarChar(100),  device)
      .input("DAY_SEQ",      sql.NVarChar(6),    daySeq)
      .execute("SP_EPCARD_PRINT_RESULT");

    const affected =
      Array.isArray(r.rowsAffected) ? r.rowsAffected.reduce((a, c) => a + c, 0) : (r.rowsAffected ?? 0);

    console.log("[/epcard/print-result] OK", { key, state: stateHint, affected });
    res.json({ ok: true, state: stateHint, affected });
  } catch (err) {
    console.error("❌ /epcard/print-result 실패:", err);
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});







// 재출력 조회: SP_ESCAN_REPRINT_SEARCH_MIN 호출 (POST, req.body 사용)
router.post("/epcard/reprint-search", async (req, res) => {
  const {
    plant_cd,
    print_from,     // 'YYYYMMDD' 혹은 'YYYY-MM-DD' 가능
    print_to,       // 'YYYYMMDD' 혹은 'YYYY-MM-DD' 가능
    order_like,
    bar_key_like,
    style_like,
  } = req.body || {};

  if (!plant_cd) {
    return res.status(400).json({ error: "필수 필드(plant_cd)가 누락되었습니다" });
  }

  // 'YYYY-MM-DD' → 'YYYYMMDD' 정규화(이미 YYYYMMDD면 그대로 사용)
  const toYmd = (v) => {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})$/); // 2025-08-27 or 20250827
    return m ? `${m[1]}${m[2]}${m[3]}` : s;
  };

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT_CD",      sql.NVarChar(10), plant_cd)
      .input("PRINT_FROM",    sql.Char(8),      toYmd(print_from))
      .input("PRINT_TO",      sql.Char(8),      toYmd(print_to))
      .input("ORDER_NO_LIKE", sql.NVarChar(50), order_like || null)
      .input("BAR_KEY_LIKE",  sql.NVarChar(80), bar_key_like || null)
      .input("STYLE_LIKE",    sql.NVarChar(50), style_like || null)
      .execute("dbo.SP_ESCAN_REPRINT_SEARCH_MIN");

    res.status(200).json({
      message: "✅ 재출력 조회 완료",
      count: result.recordset?.length ?? 0,
      rows: result.recordset ?? [],
    });
  } catch (err) {
    console.error("❌ 재출력 조회 실패:", err);
    res.status(500).json({ error: "재출력 조회 실패", detail: err.message });
  }
});


// 재출력 커밋: PRINT_YN = 'Y', PRINT_DATE/PRINT_DT 갱신 + PRINT_CNT +1
router.post("/epcard/reprint-commit", async (req, res) => {
  const { plant_cd, items } = req.body || {};

  if (!plant_cd || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "필수 필드(plant_cd, items[])가 누락되었습니다" });
  }

  try {
    const pool = await poolPromise;

    let updated = 0;
    /** @type {Array<{ORDER_NUMBER:string,SFC_CD:string,BAR_KEY:string,PCARD_SEQ:string}>} */
    const notFound = [];

    // items: [{ ORDER_NUMBER, SFC_CD, BAR_KEY, PCARD_SEQ }]
    for (const it of items) {
      const ORDER_NUMBER = it.ORDER_NUMBER ?? it.order_number;
      const SFC_CD       = it.SFC_CD ?? it.sfc_cd ?? it.SFC;
      const BAR_KEY      = it.BAR_KEY ?? it.bar_key;
      const PCARD_SEQ    = String(it.PCARD_SEQ ?? it.pcard_seq ?? it.SEQ);

      const r = await pool.request()
        .input("PLANT_CD",     sql.NVarChar(10),  plant_cd)
        .input("ORDER_NUMBER", sql.NVarChar(20),  ORDER_NUMBER)
        .input("SFC_CD",       sql.NVarChar(128), SFC_CD)     // 스키마에 맞게 128
        .input("BAR_KEY",      sql.NVarChar(80),  BAR_KEY)
        .input("PCARD_SEQ",    sql.NVarChar(10),  PCARD_SEQ)
        .query(`
          UPDATE DMPD_EPCARD
             SET PRINT_DATE = CONVERT(char(8), GETDATE(), 112), -- YYYYMMDD
                 PRINT_DT   = GETDATE(),
                 PRINT_CNT  = CAST(COALESCE(NULLIF(PRINT_CNT,''),'0') AS int) + 1
           WHERE PLANT_CD     = @PLANT_CD
             AND ORDER_NUMBER = @ORDER_NUMBER
             AND SFC_CD       = @SFC_CD
             AND BAR_KEY      = @BAR_KEY
             AND PCARD_SEQ    = @PCARD_SEQ
        `);

      const aff = Array.isArray(r.rowsAffected) ? r.rowsAffected[0] : 0;
      updated += aff;
      if (!aff) notFound.push({ ORDER_NUMBER, SFC_CD, BAR_KEY, PCARD_SEQ });
    }

    return res.status(200).json({ message: "✅ PRINT_* 업데이트 완료", updated, notFound });
  } catch (err) {
    console.error("❌ 재출력 커밋 실패:", err);
    return res.status(500).json({ error: "재출력 커밋 실패", detail: err && err.message ? err.message : String(err) });
  }
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// ✅ 4. P_PDES_GET_HEADER_MAIN  (PG: fn_pdes_get_header_main 대응)
//    쿼리 예시:
//    GET /api/mssql/pdes-header-main?plant=C200&work_date=20251124&workCenter=OSOSP&line=LINE01&machine=M001&material_code=XXXXX&size_cd=260&order_number=YAPS00000123
router.get("/pdes-header-main", async (req, res) => {
  try {
    const {
      plant,
      work_date,
      workCenter,
      line,
      machine,
      material_code,
      size_cd,
      order_number,
    } = req.query || {};

    const plantCd = (plant || "").toString().trim();
    const workDateRaw = (work_date || "").toString().trim();
    const workDate = workDateRaw.replace(/-/g, ""); // 'YYYY-MM-DD' → 'YYYYMMDD' 도 허용

    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT_CD",     sql.VarChar(4),  plantCd)
      .input("WORK_DATE",    sql.VarChar(8),  workDate)
      .input("WORK_CENTER",  sql.VarChar(50), (workCenter || "").toString().trim())
      .input("LINE_CD",      sql.VarChar(50), (line || "").toString().trim())
      .input("MACHINE_CD",   sql.VarChar(50), (machine || "").toString().trim())
      .input("MATERIAL_CODE",sql.VarChar(50), (material_code || "").toString().trim())
      .input("SIZE_CD",      sql.VarChar(20), (size_cd || "").toString().trim())
      .input("ORDER_NUMBER", sql.VarChar(20), (order_number || "").toString().trim())
      .execute("P_PDES_GET_HEADER_MAIN");

    // recordset 전체 그대로 반환 (프론트에서 rows 그대로 받도록)
    res.json(result.recordset || []);
  } catch (err) {
    console.error("❌ /pdes-header-main 실패:", err);
    res.status(500).json({
      error: "MSSQL pdes-header-main 실패",
      detail: err.message,
    });
  }
});


// ✅ 5. P_PDES_GET_HEADER_ORDERS  (PG: fn_pdes_get_header_orders 대응)
router.get("/pdes-header-orders", async (req, res) => {
  const {
    plant,
    work_center,
    work_date,
    zcf_line_cd,
    zcf_machine_cd,
    only_done_zero,
    zcf_style_cd,
    zcf_size_cd,
    zcf_part_nm,
    for_work_date,
    material_code,
  } = req.query;

  console.log("📦 [MSSQL] /pdes-header-orders 호출됨:", {
    plant,
    work_center,
    work_date,
    zcf_line_cd,
    zcf_machine_cd,
    only_done_zero,
    zcf_style_cd,
    zcf_size_cd,
    zcf_part_nm,
    for_work_date,
    material_code,
  });

  const onlyDoneZeroBit =
    String(only_done_zero ?? "").trim() === "0" ? 0 : 1;

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT",          sql.VarChar(4),   plant || "")
      .input("WORK_CENTER",    sql.VarChar(5),   work_center || "")
      .input("WORK_DATE",      sql.VarChar(10),  work_date || "")
      .input("ZCF_LINE_CD",    sql.VarChar(10),  zcf_line_cd || null)
      .input("ZCF_MACHINE_CD", sql.VarChar(10),  zcf_machine_cd || null)
      .input("ONLY_DONE_ZERO", sql.Bit,          onlyDoneZeroBit)
      .input("ZCF_STYLE_CD",   sql.VarChar(30),  zcf_style_cd || null)
      .input("ZCF_SIZE_CD",    sql.VarChar(20),  zcf_size_cd || null)
      .input("ZCF_PART_NM",    sql.VarChar(200), zcf_part_nm || null)
      .input("FOR_WORK_DATE",  sql.VarChar(10),  for_work_date || null)
      .input("MATERIAL_CODE",  sql.VarChar(50),  material_code || null)
      .execute("P_PDES_GET_HEADER_ORDERS");

    res.json(result.recordset || []);
  } catch (err) {
    console.error("❌ /pdes-header-orders 실패:", err);
    res.status(500).json({ error: "MSSQL pdes-header-orders 실패", detail: err.message });
  }
});


// ✅ 6. P_PDES_GET_HEADER_SUMMARY  (PG: fn_pdes_get_header_summary 대응)
router.get("/pdes-header-summary", async (req, res) => {
  const {
    plant,
    work_center,
    work_date,
    zcf_line_cd,
    zcf_machine_cd,
  } = req.query;

  console.log("📦 [MSSQL] /pdes-header-summary 호출됨:", {
    plant,
    work_center,
    work_date,
    zcf_line_cd,
    zcf_machine_cd,
  });

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT",          sql.VarChar(4),  plant || "")
      .input("WORK_CENTER",    sql.VarChar(5),  work_center || "")
      .input("WORK_DATE",      sql.VarChar(10), work_date || "")
      .input("ZCF_LINE_CD",    sql.VarChar(10), zcf_line_cd || null)
      .input("ZCF_MACHINE_CD", sql.VarChar(10), zcf_machine_cd || null)
      .execute("P_PDES_GET_HEADER_SUMMARY");

    res.json(result.recordset || []);
  } catch (err) {
    console.error("❌ /pdes-header-summary 실패:", err);
    res.status(500).json({
      error: "MSSQL pdes-header-summary 실패",
      detail: err.message,
    });
  }
});

// ✅ 3. P_PDES_GET_DETAIL  (PG: fn_pdes_get_detail 대응)
router.get("/pdes-detail", async (req, res) => {
  const { plant_cd, sfc_cd, work_center } = req.query;

  console.log("📦 [MSSQL] /pdes-detail 호출됨:", {
    plant_cd,
    sfc_cd,
    work_center,
  });

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT_CD",    sql.VarChar(4),  plant_cd || "")
      .input("SFC_CD",      sql.VarChar(15), sfc_cd || "")
      .input("WORK_CENTER", sql.VarChar(50), work_center || "")
      .execute("P_PDES_GET_DETAIL");

    res.json(result.recordset || []);
  } catch (err) {
    console.error("❌ /pdes-detail 실패:", err);
    res.status(500).json({ error: "MSSQL pdes-detail 실패", detail: err.message });
  }
});

// ✅ 3. P_PDES_GET_DETAIL  (PG: fn_pdes_get_detail 대응)
router.get("/pdes-detail", async (req, res) => {
  const { plant_cd, sfc_cd, work_center } = req.query;

  console.log("📦 [MSSQL] /pdes-detail 호출됨:", {
    plant_cd,
    sfc_cd,
    work_center,
  });

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT_CD",    sql.VarChar(4),  plant_cd || "")
      .input("SFC_CD",      sql.VarChar(15), sfc_cd || "")
      .input("WORK_CENTER", sql.VarChar(50), work_center || "")
      .execute("P_PDES_GET_DETAIL");

    res.json(result.recordset || []);
  } catch (err) {
    console.error("❌ /pdes-detail 실패:", err);
    res
      .status(500)
      .json({ error: "MSSQL pdes-detail 실패", detail: err.message });
  }
});

/**
 * PASSCARD 디테일 저장 (MSSQL)
 * SP: dbo.P_PDES_POST_DETAIL_LIST
 * 파라미터:
 *   @LIST_JSON NVARCHAR(MAX)
 *   @SYNC_YN   NVARCHAR(1)
 *   @ERROR_MSG NVARCHAR(MAX)
 */
router.post("/pdes-post-detail-list", async (req, res) => {
  try {
    const body = req.body || {};
    const params = body.params || {};
    const query = req.query || {};

    // 여러 케이스 지원
    let listJson =
      params.LIST_JSON ||
      params.list_json ||
      params.listJson ||
      body.LIST_JSON ||
      body.list_json ||
      body.listJson ||
      query.LIST_JSON ||
      query.list_json ||
      query.listJson;

    // 객체/배열이면 JSON 문자열화
    if (listJson && typeof listJson !== "string") {
      try {
        listJson = JSON.stringify(listJson);
      } catch (e) {
        console.error("[MSSQL] LIST_JSON stringify 실패:", e);
        listJson = undefined;
      }
    }

    /* -------------------------------------------------------
     * 🔥 (5-1) JSON 내용/길이 로그 — 핵심 추가 부분
     * ------------------------------------------------------- */
    console.log("[MSSQL] RAW body(최대 500자):", JSON.stringify(body).slice(0, 500));

    console.log("[MSSQL] params/query:", {
      params,
      query,
    });

    console.log("[MSSQL] LIST_JSON preview =>", {
      type: typeof listJson,
      length: listJson ? listJson.length : 0,
      head: listJson ? listJson.slice(0, 200) : null,
    });
    /* ------------------------------------------------------- */

    // syncYn
    let syncYn =
      params.SYNC_YN ||
      params.sync_yn ||
      params.syncYn ||
      body.SYNC_YN ||
      body.sync_yn ||
      body.syncYn ||
      query.SYNC_YN ||
      query.sync_yn ||
      query.syncYn ||
      "N";

    syncYn = String(syncYn || "N").toUpperCase() === "Y" ? "Y" : "N";

    // errorMsg
    let errorMsg =
      params.ERROR_MSG ||
      params.error_msg ||
      body.ERROR_MSG ||
      body.error_msg ||
      query.ERROR_MSG ||
      query.error_msg ||
      null;

    console.log("[MSSQL] syncYn/errorMsg:", {
      syncYn,
      hasErrorMsg: !!errorMsg,
    });

    // 필수값 체크
    if (!listJson || typeof listJson !== "string" || !listJson.trim()) {
      console.error("[MSSQL] LIST_JSON 누락!");
      return res.status(400).json({
        ok: false,
        error: "LIST_JSON is required",
      });
    }

    const pool = await poolPromise;
    const request = pool.request();

    request.input("LIST_JSON", sql.NVarChar(sql.MAX), listJson);
    request.input("SYNC_YN", sql.NVarChar(1), syncYn);
    request.input("ERROR_MSG", sql.NVarChar(sql.MAX), errorMsg);

    const result = await request.execute("dbo.P_PDES_POST_DETAIL_LIST");

    const rows =
      (result &&
        (result.recordset ||
          (Array.isArray(result.recordsets) && result.recordsets[0]))) ||
      [];

    console.log("[MSSQL] SP Result row0:", Array.isArray(rows) ? rows[0] : rows);

    return res.json({
      ok: true,
      rows,
    });
  } catch (err) {
    console.error("[MSSQL] /pdes-post-detail-list ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "P_PDES_POST_DETAIL_LIST failed",
    });
  }
});




/**
 * PASSCARD 출력용 디테일 목록 조회 (MSSQL)
 * SP: dbo.P_PDES_GET_DETAIL_PRINT_LIST
 *  쿼리:
 *   plant, work_center, user_ip, limit
 */
router.get("/pdes-detail-print-list", async (req, res) => {
  try {
    const q = req.query || {};

    const plant = (q.plant || q.PLANT_CD || q.plant_cd || "").toString().trim();
    const workCenter = (q.work_center || q.WORK_CENTER || q.workcenter || "")
      .toString()
      .trim();
    const userIp = (q.user_ip || q.USER_IP || q.userIp || "")
      .toString()
      .trim();

    const limitRaw = q.limit || q.LIMIT;
    const limitNum = Number(limitRaw);
    const pLimit =
      isFinite(limitNum) && limitNum > 0 ? limitNum : 9999; // 기본 9999

    console.log("[MSSQL] /pdes-detail-print-list 호출:", {
      plant,
      workCenter,
      userIp,
      pLimit,
    });

    const pool = await poolPromise;
    const request = pool.request();

    request.input("P_PLANT_CD", sql.VarChar(4), plant || "");
    request.input("P_WORK_CENTER", sql.VarChar(50), workCenter || "");
    request.input("P_USER_IP", sql.VarChar(50), userIp || "");
    request.input("P_LIMIT", sql.BigInt, pLimit);

    const result = await request.execute("dbo.P_PDES_GET_DETAIL_PRINT_LIST");

    const rows = result.recordset || [];

    console.log(
      "[MSSQL] P_PDES_GET_DETAIL_PRINT_LIST rows:",
      rows.length,
      "건"
    );

    return res.json(rows);
  } catch (err) {
    console.error("[MSSQL] /pdes-detail-print-list error:", err);
    return res.status(500).json({
      error: "MSSQL pdes-detail-print-list 실패",
      detail: (err && err.message) || "",
    });
  }
});




// ✅ 9. P_PDES_POST_REPRINT (재출력 시 PRINT_CNT / PRINT_LAST_TRY_AT 갱신)
// body 예시:
// {
//   plant_cd: "C200",
//   items: [ { BAR_KEY: "..." }, ... ],
//   syncYn: "Y" | "N",
//   errorMsg: "...."
// }
router.post("/pdes-reprint", async (req, res) => {
  try {
    const { plant_cd, items, itemsJson, syncYn, errorMsg } = req.body || {};

    const payload =
      typeof itemsJson === "string"
        ? itemsJson
        : JSON.stringify(items ?? []);

    const syncYN = (syncYn ?? "").toString().trim() || "N";
    const errMsg = errorMsg ?? null;

    console.log("📦 [MSSQL] /pdes-reprint(POST) 호출됨:", {
      plant_cd,
      itemsCount: Array.isArray(items) ? items.length : undefined,
      payloadLength: payload.length,
      syncYN,
      hasErrorMsg: !!errMsg,
    });

    const pool = await poolPromise;

    const result = await pool.request()
      .input("PLANT_CD", sql.VarChar(4), (plant_cd || "").toString().trim())
      .input("ITEMS",    sql.NVarChar(sql.MAX), payload)
      .input("SYNC_YN",  sql.NVarChar(1),       syncYN)
      .input("ERROR_MSG",sql.NVarChar(sql.MAX), errMsg)
      .execute("P_PDES_POST_REPRINT");

    const row = (result.recordset && result.recordset[0]) || {};
    res.json({
      affected_rows: row.AFFECTED_ROWS ?? row.affected_rows ?? 0,
    });
  } catch (err) {
    console.error("❌ /pdes-reprint(POST) 실패:", err);
    res.status(500).json({
      error: "MSSQL pdes-reprint(POST) 실패",
      detail: err.message,
    });
  }
});


// ✅ P_PDBS_GET_BASIC_INFO 라우터 (PT / SL / WC 공통 조회)
router.get("/pdbs-basic-info", async (req, res) => {
  const { type, plant_cd } = req.query;

  console.log("📦 [MSSQL] /pdbs-basic-info 호출됨:", { type, plant_cd });

  if (!type) {
    return res
      .status(400)
      .json({ error: "필수 파라미터(type)가 누락되었습니다." });
  }

  try {
    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("P_TYPE", sql.VarChar(10), String(type).toUpperCase())
      .input("P_PLANT_CD", sql.VarChar(10), plant_cd || null)
      .execute("P_PDBS_GET_BASIC_INFO");

    res.json(result.recordset || []);
  } catch (err) {
    console.error("❌ /pdbs-basic-info 실패:", err);
    res.status(500).json({
      error: "MSSQL P_PDBS_GET_BASIC_INFO 실행 실패",
      detail: err.message,
    });
  }
});


export default router;
