// src/services/postgres/hfpaDefectCodeService.js

import { findHfpaDefectCode } from "../../models/postgres/hfpaDefectCodeDao.js";

/**
 * HFPA Defect Code 조회 서비스
 *
 * 파라미터:
 *  - plant_cd      : 필수
 *  - code_class_cd : 필수
 *
 * 검증:
 *  - 세 값 모두 존재하고, trim 후에도 빈 문자열이 아니어야 함
 *
 * 반환:
 *  - DAO 에서 조회한 rows 배열 그대로 반환
 */
export async function getHfpaDefectCode(client, { plant_cd, code_class_cd }) {
  const plantCd = typeof plant_cd === "string" ? plant_cd.trim() : "";
  const codeClassCd = typeof code_class_cd === "string" ? code_class_cd.trim() : "";

  if (!plantCd || !codeClassCd ) {
    const err = new Error("plant_cd, code_class_cd are required");
    err.statusCode = 400;
    throw err;
  }

  const rows = await findHfpaDefectCode(client, {
    plant_cd: plantCd,
    code_class_cd: codeClassCd,
  });

  return rows;
}
