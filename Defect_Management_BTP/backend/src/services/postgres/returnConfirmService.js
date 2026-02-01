// backend/src/services/postgres/returnConfirmService.js

import * as dao from "../../models/postgres/returnConfirmDao.js";
import { toYYYYMMDDDash } from "../../utils/time.js";
import { normalizeIntColumn } from "../../utils/normalizeIntColumn.js";

/**
 * Plant 목록 조회
 */
export async function getPlants(client) {
  const plants = await dao.findPlants(client);
  return plants;
}

/**
 * Return Management용 Defect Result 조회
 */
export async function getDefectResultsForReturn(client, params) {
  const {
    date_from,
    date_to,
    plant_cd,
    work_center,
    line_cd,
    confirm_status
  } = params;

  const results = await dao.findDefectResultForReturn(client, {
    date_from,
    date_to,
    plant_cd,
    work_center,
    line_cd,
    confirm_status
  });

  // quantity 정수 변환
  const normalizedRows = normalizeIntColumn(results, "quantity");

  // defect_date 변환 (YYYYMMDD → YYYY-MM-DD)
  // division 변환 (L → Left, R → Right)
  // defect_decision 변환 (S → Scrap, R → Return)
  const formattedResults = normalizedRows.map(row => ({
    ...row,
    defect_date: toYYYYMMDDDash(row.defect_date),
    division:
      row.division === "L" ? "Left"
      : row.division === "R" ? "Right"
      : row.division,
    defect_decision:
      row.defect_decision === "S" ? "Scrap"
      : row.defect_decision === "R" ? "Return"
      : row.defect_decision,
  }));

  return formattedResults;
}

/**
 * Defect Result Confirm 업데이트 (트랜잭션 관리)
 */
export async function updateConfirm(client, params) {
  const { defect_items, cfm_user } = params;

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = '30s'`);

    // 복합 키로 UPDATE
    const result = await dao.updateDefectResultConfirm(client, {
      defect_items,
      cfm_user
    });

    // Update 성공시 SP 호출 (defect_decision='R'인 경우만)
    for (const item of result.updated_items) {
      if (item.defect_decision === 'R') {
        console.log(`[updateConfirm] Calling SP for defect_no: ${item.defect_no} (defect_decision='R')`);
        await dao.callDefectReturnSave(client, {
          defect_no: item.defect_no
        });
      } else {
        console.log(`[updateConfirm] Skipping SP for defect_no: ${item.defect_no} (defect_decision='${item.defect_decision}')`);
      }
    }

    await client.query("COMMIT");

    return {
      status: "OK",
      updated_count: result.updated_count
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // ROLLBACK 실패 무시
    }
    throw err;
  }
}

/**
 * Work Center 목록 조회
 */
export async function getWorkCenters(client, { plant }) {
  return dao.findWorkCenters(client, { plant });
}

/**
 * Line 목록 조회
 */
export async function getLines(client, { plant, work_center }) {
  return dao.findLines(client, { plant, work_center });
}
