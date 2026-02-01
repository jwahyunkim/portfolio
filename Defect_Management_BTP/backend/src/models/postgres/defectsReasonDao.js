// src/models/postgres/defectsReasonDao.js

/**
 * Defect Reason 목록 조회
 * - 필수 필터: plant_cd, material_code
 * - mes.dmpd_prod_order_detail 에서 zcf_op_cd(유일) 조회 후
 *   QUALITY.dmbs_code_master_temp 에서 SUB_CODE(value), CODE_NAME(label) 조회
 */
export async function findDefectReasons(client, { plantCd, materialCode }) {
  const values = [];

  values.push(plantCd);      // $1
  values.push(materialCode); // $2

  const sql = `
    SELECT
      SUB_CODE  AS value,
      CODE_NAME AS label
    FROM QUALITY.dmbs_code_master_temp
    WHERE plant_cd = $1
      AND CODE_CLASS_CD = (
        SELECT DISTINCT
          zcf_op_cd
        FROM mes.dmpd_prod_order_detail
        WHERE plant = $1
          AND material_code = $2
        LIMIT 1
      )
    ORDER BY SUB_CODE
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}
