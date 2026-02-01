// src/services/postgres/hfpaUCCdetailService.js

import { findHfpaMisspackingScanByExidv } from "../../models/postgres/hfpaUCCdetailDao.js";

/**
 * HFPA Misspacking Scan 조회 서비스
 *
 * 파라미터:
 *  - exidv : 필수
 *
 * 검증:
 *  - 문자열이고, trim 후에도 빈 문자열이 아니어야 함
 *
 * 반환:
 *  - DAO 에서 조회한 rows 배열 그대로 반환
 */
export async function getHfpaMisspackingScanByExidv(client, { exidv }) {
  const exidvTrimmed = typeof exidv === "string" ? exidv.trim() : "";

  if (!exidvTrimmed) {
    const err = new Error("exidv is required");
    err.statusCode = 400;
    throw err;
  }

  const rows = await findHfpaMisspackingScanByExidv(client, {
    exidv: exidvTrimmed,
  });

  return rows;
}
