import { findHfpaDashboard } from "../../models/postgres/hfpaDashboardDao.js";

/**
 * HFPA 시간대/불량별 집계 서비스
 *
 * - plant_cd      : 필수
 * - inspect_date  : 필수 (YYYYMMDD)
 * - work_center   : 필수
 * - line_cd       : 필수
 *
 * 반환: DAO 결과 rows 그대로
 */
export async function getHfpaDashboard(
  client,
  { plant_cd, inspect_date, work_center, line_cd }
) {
  const plantCd = typeof plant_cd === "string" ? plant_cd.trim() : "";
  const inspectDate =
    typeof inspect_date === "string" ? inspect_date.trim() : "";
  const workCenter =
    typeof work_center === "string" ? work_center.trim() : "";
  const lineCd = typeof line_cd === "string" ? line_cd.trim() : "";

  if (!plantCd || !inspectDate || !workCenter || !lineCd) {
    const err = new Error(
      "plant_cd, inspect_date, work_center, line_cd are required"
    );
    err.statusCode = 400;
    throw err;
  }

  const rows = await findHfpaDashboard(client, {
    plant_cd: plantCd,
    inspect_date: inspectDate,
    work_center: workCenter,
    line_cd: lineCd,
  });

  // TO_CHAR로 이미 문자열 포맷이 되어 있으므로 추가 가공 없이 그대로 반환
  return rows;
}
