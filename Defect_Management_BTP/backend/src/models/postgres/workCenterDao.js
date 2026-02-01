// src/models/postgres/workCenterDao.js

/**
 * Work Center 목록 조회
 * - 뷰: quality.v_dmqm_form_work_center 사용
 * - 필수 필터: plant, codeClassCd(form_type)
 * - 옵션 필터: line, materialCode (요구에 따라 비활성 유지)
 */
export async function findWorkCenters(client, { plant, codeClassCd, line, materialCode }) {
  const values = [];
  const where = [];

  // V.plant_cd = :plant
  values.push(plant);
  where.push(`V.plant_cd = $${values.length}`);

  // V.form_type = :codeClassCd
  values.push(codeClassCd);
  where.push(`V.form_type = $${values.length}`);

  // 옵션 EXISTS 필터(비활성 유지)
  // const hasLineFilter = typeof line === 'string' && line.trim() !== '';
  // const hasMaterialFilter = typeof materialCode === 'string' && materialCode.trim() !== '';
  // if (hasLineFilter || hasMaterialFilter) {
  //   const existsConds = [
  //     'P.plant = V.plant_cd',
  //     'P.work_center = V.code',
  //   ];
  //   if (hasLineFilter) {
  //     values.push(line.trim());
  //     existsConds.push(`P.zcf_line_cd = $${values.length}`);
  //   }
  //   if (hasMaterialFilter) {
  //     values.push(materialCode.trim());
  //     existsConds.push(`P.material_code = $${values.length}`);
  //   }
  //   where.push(
  //     `EXISTS (SELECT 1 FROM mes.dmpd_prod_order_detail P WHERE ${existsConds.join(' AND ')})`
  //   );
  // }

  const sql = `
    SELECT
      V.code AS code,
      V.name AS name
    FROM quality.v_dmqm_form_work_center V
    WHERE ${where.join(' AND ')}
    ORDER BY V.name
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}
