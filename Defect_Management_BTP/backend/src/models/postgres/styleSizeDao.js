// src/models/postgres/styleSizeDao.js

/**
 * 스타일 옵션 조회 (remain > 0, 중복 제거)
 * - 필수: plant, workCenter, line
 * - 응답: [{ style_cd, style_nm, material_count }]
 */
export async function findStyles(client, { plant, workCenter, line }) {
  const sql = `
    WITH base AS (
      SELECT
        d.zcf_style_cd,
        d.zcf_style_nm,
        d.material_code,
        COALESCE(d.order_qty, 0)      AS order_qty,
        COALESCE(d.dcf_good_qty, 0)   AS dcf_good_qty,
        COALESCE(d.dcf_defect_qty, 0) AS dcf_defect_qty,
        COALESCE(d.dcf_return_qty, 0) AS dcf_return_qty,
        COALESCE(d.dcf_labtest_qty, 0) AS dcf_labtest_qty
      FROM mes.dmpd_prod_order_detail d
      WHERE d.plant = $1
        AND d.work_center = $2
        AND d.zcf_line_cd = $3
        AND d.zcf_style_cd IS NOT NULL
        AND d.material_code IS NOT NULL
    ),
    summed AS (
      SELECT
        zcf_style_cd,
        MAX(zcf_style_nm) AS zcf_style_nm,
        material_code,
        (SUM(order_qty) - SUM(dcf_good_qty) - SUM(dcf_defect_qty) - SUM(dcf_return_qty) - SUM(dcf_labtest_qty)) AS remain
      FROM base
      GROUP BY zcf_style_cd, material_code
    ),
    with_remain AS (
      SELECT zcf_style_cd, zcf_style_nm, material_code, remain
      FROM summed
      WHERE remain > 0
    )
    SELECT
      zcf_style_cd AS style_cd,
      COALESCE(MAX(zcf_style_nm), '') AS style_nm,
      COUNT(DISTINCT material_code)    AS material_count
    FROM with_remain
    GROUP BY zcf_style_cd
    ORDER BY zcf_style_cd
  `;
  const values = [plant, workCenter, line];
  const { rows } = await client.query(sql, values);
  return rows;
}

/**
 * 사이즈 옵션 조회 (remain > 0, 중복 제거)
 * - 필수: plant, workCenter, line, styleCd
 * - 응답: [{ size_cd, material_count }]
 */
export async function findSizes(client, { plant, workCenter, line, styleCd }) {
  const sql = `
    WITH base AS (
      SELECT
        d.zcf_size_cd,
        d.material_code,
        COALESCE(d.order_qty, 0)      AS order_qty,
        COALESCE(d.dcf_good_qty, 0)   AS dcf_good_qty,
        COALESCE(d.dcf_defect_qty, 0) AS dcf_defect_qty,
        COALESCE(d.dcf_return_qty, 0) AS dcf_return_qty,
        COALESCE(d.dcf_labtest_qty, 0) AS dcf_labtest_qty
      FROM mes.dmpd_prod_order_detail d
      WHERE d.plant = $1
        AND d.work_center = $2
        AND d.zcf_line_cd = $3
        AND d.zcf_style_cd = $4
        AND d.zcf_size_cd IS NOT NULL
        AND d.material_code IS NOT NULL
    ),
    summed AS (
      SELECT
        zcf_size_cd,
        material_code,
        (SUM(order_qty) - SUM(dcf_good_qty) - SUM(dcf_defect_qty) - SUM(dcf_return_qty) - SUM(dcf_labtest_qty)) AS remain
      FROM base
      GROUP BY zcf_size_cd, material_code
    ),
    with_remain AS (
      SELECT zcf_size_cd, material_code, remain
      FROM summed
      WHERE remain > 0
    )
    SELECT
      zcf_size_cd AS size_cd,
      COUNT(DISTINCT material_code) AS material_count
    FROM with_remain
    GROUP BY zcf_size_cd
    ORDER BY zcf_size_cd
  `;
  const values = [plant, workCenter, line, styleCd];
  const { rows } = await client.query(sql, values);
  return rows;
}

/**
 * plant + workCenter + line + styleCd + sizeCd 로 material_code 해상
 * - remain > 0 인 material만 대상
 * - 중복 제거
 * - 응답: [{ material_code }]
 */
export async function findMaterialCodesByStyleSize(
  client,
  { plant, workCenter, line, styleCd, sizeCd }
) {
  const sql = `
    WITH base AS (
      SELECT
        d.material_code,
        COALESCE(d.order_qty, 0)      AS order_qty,
        COALESCE(d.dcf_good_qty, 0)   AS dcf_good_qty,
        COALESCE(d.dcf_defect_qty, 0) AS dcf_defect_qty,
        COALESCE(d.dcf_return_qty, 0) AS dcf_return_qty,
        COALESCE(d.dcf_labtest_qty, 0) AS dcf_labtest_qty
      FROM mes.dmpd_prod_order_detail d
      WHERE d.plant = $1
        AND d.work_center = $2
        AND d.zcf_line_cd = $3
        AND d.zcf_style_cd = $4
        AND d.zcf_size_cd = $5
        AND d.material_code IS NOT NULL
    ),
    summed AS (
      SELECT
        material_code,
        (SUM(order_qty) - SUM(dcf_good_qty) - SUM(dcf_defect_qty) - SUM(dcf_return_qty) - SUM(dcf_labtest_qty)) AS remain
      FROM base
      GROUP BY material_code
    ),
    with_remain AS (
      SELECT material_code
      FROM summed
      WHERE remain > 0
    )
    SELECT
      material_code
    FROM with_remain
    ORDER BY material_code
  `;

  const values = [plant, workCenter, line, styleCd, sizeCd];
  const { rows } = await client.query(sql, values);
  return rows;
}
