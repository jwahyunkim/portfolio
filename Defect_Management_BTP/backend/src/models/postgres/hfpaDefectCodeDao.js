// src/models/postgres/hfpaDefectCodeDao.js

/**
 * quality.dmbs_code_master_temp 조회 DAO
 *
 * 파라미터:
 *  - plant_cd      : 필수
 *  - code_class_cd : 필수
 *
 * 반환:
 *  - 조건에 맞는 모든 컬럼(plant_cd, code_class_cd, sub_code, code_name, value_1, value_2)
 *    을 포함한 rows 배열
 */
export async function findHfpaDefectCode(client, { plant_cd, code_class_cd }) {
  const sql = `
    SELECT
      plant_cd,
      code_class_cd,
      sub_code,
      code_name,
      value_1,
      value_2
    FROM quality.dmbs_code_master_temp
    WHERE plant_cd = $1
      AND code_class_cd = $2
    ORDER BY
  CASE WHEN value_2 ~ '^[0-9]+$' THEN 0 ELSE 1 END,
  CASE WHEN value_2 ~ '^[0-9]+$' THEN CAST(value_2 AS INT) END,
  CASE WHEN value_2 ~ '^[0-9]+$' THEN NULL ELSE value_2 END

  `;

  const params = [plant_cd, code_class_cd];

  const { rows } = await client.query(sql, params);
  return rows;
}
