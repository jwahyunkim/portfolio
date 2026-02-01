// src/models/postgres/hfpaUCCdetailDao.js

/**
 * mes.dmpd_misspacking_scan 조회 DAO
 *
 * 파라미터:
 *  - exidv : 필수 (트림 후 빈 문자열 불가)
 *
 * 반환:
 *  - 조건에 맞는 모든 컬럼(ebeln, ebelp, po, style_cd, size_cd, exidv)
 *    을 포함한 rows 배열
 */
export async function findHfpaMisspackingScanByExidv(client, { exidv }) {
  const sql = `
    SELECT DISTINCT
      ebeln,
      ebelp,
      ebeln || '-' || ebelp AS po,
      style_cd,
      size_cd,
      exidv
    FROM mes.dmpd_misspacking_scan a
    WHERE exidv = $1
  `;

  const params = [exidv];

  const { rows } = await client.query(sql, params);
  return rows;
}
