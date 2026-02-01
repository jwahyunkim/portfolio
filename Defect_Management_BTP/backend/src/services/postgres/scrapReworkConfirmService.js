import { toYYYYMMDDDash } from "../../utils/time.js";
import { normalizeIntColumn } from "../../utils/normalizeIntColumn.js";
import * as scrapReworkDao from "../../models/postgres/scrapReworkConfirmDao.js"
import * as calendarOdataDao from "../../models/sap/calendarOdataDao.js";
import * as reworkOdataDao from "../../models/sap/reworkOdataDao.js";

/**
 * Plant 목록 조회
 */
export async function getScrapPlants(client) {
  const plants = await scrapReworkDao.findScrapPlants(client);
  return plants
}

/**
 * Work Center 목록 조회
 */
export async function getScrapWorkCenters(client, { plant }) {
  return scrapReworkDao.findScrapWorkCenters(client, { plant });
}

export async function getScrapProcesses(client, { plant }) {
  return scrapReworkDao.findScrapProcesses(client, { plant })
}

export async function getScrapResults(client, params) {
  const {
    date_from,
    date_to,
    plant_cd,
    work_center,
    confirm_status
  } = params;

  const results = await scrapReworkDao.findScrapResults(client, {
    date_from,
    date_to,
    plant_cd,
    work_center,
    confirm_status
  });

  // quantity, scrap_qty, rework_qty 정수 변환
  let normalizedRows = normalizeIntColumn(results, "quantity");
  normalizedRows = normalizeIntColumn(normalizedRows, "scrap_qty");
  normalizedRows = normalizeIntColumn(normalizedRows, "rework_qty");

  // defect_date 변환 (YYYYMMDD → YYYY-MM-DD)
  // division 변환 (L → Left, R → Right)
  const formattedResults = normalizedRows.map(row => ({
    ...row,
    defect_date: toYYYYMMDDDash(row.defect_date),
    division:
      row.division === "L" ? "Left"
      : row.division === "R" ? "Right"
      : row.division,
  }));

  return formattedResults;
}

/**
 * Scrap/Rework 수량 저장
 */
export async function saveScrapData(client, params) {
  const { scrap_items, decision_user } = params;

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '30s'`)

    // 복합 키로 UPDATE
    const result = await scrapReworkDao.updateScrapData(client, {
      scrap_items,
      decision_user
    });

    await client.query("COMMIT");

    return {
      status: "OK",
      updated_count: result.updated_count
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {

    }
    throw err;
  }
}

/**
 * Rework 저장
 * 흐름 (요구 사항)
 * - SAP Odata : 다음 근무일 조회 -> sp 호출 -> 생성된 rework 조회  -> commit
 *  -> OData Post : Rework Order 생성 -> SAP 응답 DB 반영
 */
export async function saveRework(client, params) {
  const { data, user} = params;

  try {
    // 트랜잭션 시작
    await client.query("BEGIN")
    await client.query(`SET LOCAL statement_timeout = '60s'`);

    // 다음 근무일 조회 (OData 호출)
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // 2026-01-05 -> '20260105'
    const nextWorkingDay = await calendarOdataDao.fetchNextWorkingDay(today);

    console.log(`[saveRework] 다음 근무일: ${nextWorkingDay}`);

    // sp 호출 (Rework 생성)
    await scrapReworkDao.callReworkSave(client, {
      data,
      nextWorkingDay,
      user,
      createPc: 'testPC',
    });

    // 생성된 Rework 레코드 조회
    const reworkRecords = await scrapReworkDao.findRecentReworkRecords(client, {
      user, seconds: 60,
    });

    if (!reworkRecords || reworkRecords.length === 0) {
      throw new Error("생성된 Rework 레코드를 찾을 수 없습니다");
    }

    console.log(`[saveRework] 생성된 Rework 개수: ${reworkRecords.length}`)

    // COMMIT
    await client.query("COMMIT");

    // POST 바디 구성
    const reworkInfoSet = reworkRecords.map(r => ({
      Rwreq: r.rwreq,
      Werks: r.werks,
      Oaufnr: r.oaufnr,
      Apsid: r.apsid,
      Naufnr: r.naufnr,
      Zdpeg: r.zdpeg,
      Menge: Number(r.menge),
      Meins: r.meins,
      Psttr: r.psttr,
      Pedtr: r.pedtr,
      Gsuzs: r.gsuzs,
      Gluzs: r.gluzs,
    }));

    let sapResponse;
    try {
      sapResponse = await reworkOdataDao.createReworkOrders(reworkInfoSet);
    } catch (sapError) {
      // SAP 호출 실패시 모든 레코드 실패
      console.error("[saveRework] SAP 호출 실패:", sapError.message);

      const rwreqList = reworkRecords.map(r => r.rwreq);
      await client.query("BEGIN");
      for (const rwreq of rwreqList) {
        // 에러 메시지를 220자로 제한 (DB VARCHAR(220) 제약)
        const errorMsg = `SAP 호출 실패: ${sapError.message}`;
        const truncatedMsg = errorMsg.length > 220 ? errorMsg.slice(0, 217) + '...' : errorMsg;

        await scrapReworkDao.updateReworkResult(client, {
          rwreq,
          raufnr: null,
          processType: "E",
          message: truncatedMsg,
        });
      }
      await client.query("COMMIT");

      // Error code (500)
      throw sapError
    }

    // SAP 응답 반영
    await client.query("BEGIN");

    const results = [];
    for (const sapItem of sapResponse) {
      const { Rwreq, Raufnr, Type, Message} = sapItem;

      // SAP Message도 220자로 제한 (DB VARCHAR(220) 제약)
      const sapMsg = Message || "";
      const truncatedSapMsg = sapMsg.length > 220 ? sapMsg.slice(0, 217) + '...' : sapMsg;

      // 개별 업데이트
      const updated = await scrapReworkDao.updateReworkResult(client, {
        rwreq: Rwreq,
        raufnr: Raufnr || null,
        processType: Type || "E", // 빈 문자열 E 처리
        message: truncatedSapMsg,
      });

      results.push({
        rwreq: Rwreq,
        raufnr: Raufnr,
        status: Type === "S" ? "SUCCESS" : "FAILED",
        message: Message,
        updated,
      });
    }

    await client.query("COMMIT");

    // 성공 / 실패 카운트
    const successCount = results.filter(r => r.status === "SUCCESS").length;
    const failedCount = results.filter(r => r.status === "FAILED").length;

    // 프론트엔드 타입에 맞춰 응답 형식 변환
    return {
      status: "OK",
      total_items: results.length,
      sap_success_count: successCount,
      sap_failed_count: failedCount,
      rework_records: results,
    };
  } catch (err) {
    // 에러 발생 시 롤백
    try {
      await client.query("ROLLBACK");
    } catch (_) {
    }
    throw err;    
  }
}