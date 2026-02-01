// 변경된 import 영역: pool 제거
import { findDefectResults, findDefectResultsBySize } from "../../models/postgres/defectResultDao.js";
import { normalizeIntColumn } from "../../utils/normalizeIntColumn.js";
import { toYYYYMMDDDash } from "../../utils/time.js";


/**
 * Defect Result 조회 서비스
 *
 * - plant_cd    : 필수
 * - defect_form : 필수
 * - work_center : 옵션
 */
export async function getDefectResults(
  client,
  { plant_cd, work_center, defect_form, start_date, end_date }
) {
  const plantCd = typeof plant_cd === "string" ? plant_cd.trim() : "";
  const workCenter = typeof work_center === "string" ? work_center.trim() : "";
  const defectForm = typeof defect_form === "string" ? defect_form.trim() : "";
  const startDate = typeof start_date === "string" ? start_date.trim() : "";
  const endDate = typeof end_date === "string" ? end_date.trim() : "";

  if (!plantCd || !defectForm) {
    const err = new Error("plant_cd and defect_form are required");
    err.statusCode = 400;
    throw err;
  }

  if ((startDate && !endDate) || (!startDate && endDate)) {
    const err = new Error("start_date and end_date are required together");
    err.statusCode = 400;
    throw err;
  }

  const rows = await findDefectResults(client, {
    plant_cd: plantCd,
    work_center: workCenter || undefined,
    defect_form: defectForm,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  });

  // defect_qty 정수 변환
  const normalizedRows = normalizeIntColumn(rows, "defect_qty");

  // defect_date 변환 (YYYYMMDD → YYYY-MM-DD)
  // division 변환 (L → Left, R → Right)
  // defect_decision 변환 (S → Scrap, R → Rework)
  // 그 외 값/null/""은 그대로 반환
  const formattedRows = normalizedRows.map(row => ({
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

  return formattedRows;
}

/**
 * Defect Result 사이즈별 집계 조회 서비스
 *
 * - plant_cd    : 필수
 * - defect_form : 필수
 * - work_center : 옵션
 * - start_date  : 옵션 (end_date와 함께 사용)
 * - end_date    : 옵션 (start_date와 함께 사용)
 */
export async function getDefectResultsBySize(
  client,
  { plant_cd, work_center, defect_form, start_date, end_date }
) {
  const plantCd = typeof plant_cd === "string" ? plant_cd.trim() : "";
  const workCenter = typeof work_center === "string" ? work_center.trim() : "";
  const defectForm = typeof defect_form === "string" ? defect_form.trim() : "";
  const startDate = typeof start_date === "string" ? start_date.trim() : "";
  const endDate = typeof end_date === "string" ? end_date.trim() : "";

  if (!plantCd || !defectForm) {
    const err = new Error("plant_cd and defect_form are required");
    err.statusCode = 400;
    throw err;
  }

  if (!startDate && !endDate) {
    const err = new Error("date range is required");
    err.statusCode = 400;
    throw err;
  }

  if ((startDate && !endDate) || (!startDate && endDate)) {
    const err = new Error("start_date and end_date are required together");
    err.statusCode = 400;
    throw err;
  }

  const rows = await findDefectResultsBySize(client, {
    plant_cd: plantCd,
    work_center: workCenter || undefined,
    defect_form: defectForm,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  });

  // 1차: Total 컬럼 정수 변환
  let normalizedRows = normalizeIntColumn(rows, "defect_qty_sum");
  // 2차: size_others 컬럼 정수 변환
  normalizedRows = normalizeIntColumn(normalizedRows, "size_others");
  return normalizedRows;
}
