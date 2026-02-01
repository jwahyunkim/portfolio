// src/models/postgres/moldDao.js

/**
 * Mold Code 목록 조회 (연쇄 1단계)
 * - 필수 필터: plant, work_center, line(zcf_line_cd), material_code
 * - 내부 조건: 당일 기준(zcf_work_date), 배분 기준(order_qty > good+defect+labtest+return)
 */
export async function findMoldCodes(
  client,
  { plant, workCenter, line, materialCode }
) {
  const values = [];
  const where = [];

  // a.plant = :plant
  values.push(plant);
  where.push(`a.plant = $${values.length}`);

  // a.work_center = :workCenter
  values.push(workCenter);
  where.push(`a.work_center = $${values.length}`);

  // a.zcf_line_cd = :line
  values.push(line);
  where.push(`a.zcf_line_cd = $${values.length}`);

  // a.material_code = :materialCode
  values.push(materialCode);
  where.push(`a.material_code = $${values.length}`);

  const sql = `
    SELECT DISTINCT
      b.mold_tool AS mold_code
    FROM mes.dmpd_prod_order_detail a, mes.dmif_erp_dispatching b
    WHERE a.plant = b.plant
      AND a.po_id = b.prod_order
      AND a.aps_id = b.apsid
      AND ${where.join(' AND ')}
      AND COALESCE(a.order_qty, 0) > COALESCE(a.dcf_good_qty, 0)
        + COALESCE(a.dcf_defect_qty, 0)
        + COALESCE(a.dcf_labtest_qty, 0)
        + COALESCE(a.dcf_return_qty, 0)
    ORDER BY b.mold_tool
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}

/**
 * Mold Size 목록 조회 (연쇄 2단계)
 * - 필수 필터: plant, work_center, line(zcf_line_cd), material_code, mold_code
 * - 내부 조건: 당일 기준(zcf_work_date), 배분 기준(order_qty > good+defect+labtest+return)
 */
export async function findMoldSizes(
  client,
  { plant, workCenter, line, materialCode, moldCode }
) {
  const values = [];
  const where = [];

  // a.plant = :plant
  values.push(plant);
  where.push(`a.plant = $${values.length}`);

  // a.work_center = :workCenter
  values.push(workCenter);
  where.push(`a.work_center = $${values.length}`);

  // a.zcf_line_cd = :line
  values.push(line);
  where.push(`a.zcf_line_cd = $${values.length}`);

  // a.material_code = :materialCode
  values.push(materialCode);
  where.push(`a.material_code = $${values.length}`);

  // b.mold_tool = :moldCode
  values.push(moldCode);
  where.push(`b.mold_tool = $${values.length}`);

  const sql = `
    SELECT DISTINCT
      RIGHT(b.mold_prt, LENGTH(b.mold_prt) - LENGTH(b.mold_tool)) AS mold_size_cd,
      b.mat_size  AS mold_size_nm,
      b.mold_prt
    FROM mes.dmpd_prod_order_detail a, mes.dmif_erp_dispatching b
    WHERE a.plant = b.plant
      AND a.po_id = b.prod_order
      AND a.aps_id = b.apsid
      AND ${where.join(' AND ')}
      AND COALESCE(a.order_qty, 0) > COALESCE(a.dcf_good_qty, 0)
        + COALESCE(a.dcf_defect_qty, 0)
        + COALESCE(a.dcf_labtest_qty, 0)
        + COALESCE(a.dcf_return_qty, 0)
    ORDER BY b.mold_prt
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}
