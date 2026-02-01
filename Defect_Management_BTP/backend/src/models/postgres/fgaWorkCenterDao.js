// src/models/postgres/fgaWorkCenterDao.js

/**
 * FGA Work Center 목록 조회
 *
 * 조건:
 *  - plant = $1
 *  - workcenter LIKE '%FGA'
 *
 * 반환:
 *  - [{ code, name }]
 */
export async function findFgaWorkCenters(client, { plant }) {
  const sql = `
    SELECT
      A.workcenter AS code,
      A.wc_name    AS name
    FROM MES.DMBS_WORK_CENTER A
    WHERE A.plant = $1
      AND A.workcenter LIKE '%FGA'
    ORDER BY A.workcenter
  `;

  const values = [plant];

  const { rows } = await client.query(sql, values);
  return rows;
}
