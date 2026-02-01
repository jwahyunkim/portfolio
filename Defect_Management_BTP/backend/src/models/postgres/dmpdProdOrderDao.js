// src/models/postgres/dmpdProdOrderDao.js

// Query filter whitelist for dmpd_prod_order_detail.
export const ALLOWED_COLUMNS = [
  'plant',
  'order_number',
  'status',
  'releasestatus',
  'executionstatus',
  'ordertype',
  'ordercategory',
  'material_code',
  'material_version',
  'bom_number',
  'bom_version',
  'bom_type',
  'routing_number',
  'routing_version',
  'routing_type',
  'productionquantity',
  'productionunitofmeasure',
  'buildquantity',
  'order_qty',
  'releasedquantity',
  'donequantity',
  'priority',
  'plannedstartdate',
  'plannedcompletiondate',
  'scheduledstartdate',
  'scheduledcompletiondate',
  'work_center',
  'work_center_description',
  'productionversion',
  'putawaystoragelocation',
  'erproutinggroup',
  'warehousenumber',
  'zcf_work_date',
  'zcf_shift_cd',
  'zcf_hh',
  'zcf_seq',
  'zcf_op_cd',
  'zcf_op_nm',
  'zcf_line_cd',
  'zcf_line_nm',
  'zcf_machine_cd',
  'zcf_machine_nm',
  'zcf_nt_order_number',
  'zcf_nt_order_quantity',
  'zcf_nt_order_start_date',
  'zcf_nt_line_cd',
  'zcf_nt_line_nm',
  'zcf_nt_machine_cd',
  'zcf_nt_machine_nm',
  'zcf_size_cd',
  'zcf_model_cd',
  'zcf_model_nm',
  'zcf_style_cd',
  'zcf_style_nm',
  'zcf_gender_cd',
  'zcf_part_cd',
  'zcf_part_nm',
  'zcf_mcs_cd',
  'zcf_mcs_color_cd',
  'zcf_mcs_color_nm',
  'zcf_mcs_cd_option',
  'zcf_batch_size',
  'dcf_mc_mcs_cd',
  'dcf_batch_type',
  'dcf_batch_er_strd',
  'dcf_sfc',
  'dcf_status',
  'dcf_actual',
  'dcf_good_qty',
  'dcf_defect_qty',
  'dcf_labtest_qty',
  'dcf_return_qty',
  'dcf_qty_update_date',
  'dcf_mv_order_yn',
  'dcf_pop_if_yn',
];

function buildWhereAndValues({ plant, filters }) {
  const where = [];
  const values = [];
  where.push(`plant = $${values.length + 1}`);
  values.push(plant);

  if (filters && typeof filters === 'object') {
    for (const key of Object.keys(filters)) {
      if (!ALLOWED_COLUMNS.includes(key)) continue;
      if (key === 'plant') continue;
      where.push(`${key} = $${values.length + 1}`);
      values.push(filters[key]);
    }
  }

  return { whereSql: where.join(' AND '), values };
}

export async function queryDmpdProdOrderAgg(client, { plant, filters, limit }) {
  const { whereSql, values } = buildWhereAndValues({ plant, filters });
  const params = [...values, limit];

  const sql = `
    WITH base AS (
      SELECT *
      FROM mes.dmpd_prod_order_detail
      WHERE ${whereSql}
    ),
    summed AS (
      SELECT
        material_code,
        COALESCE(SUM(order_qty), 0)      AS sum_order_qty,
        COALESCE(SUM(dcf_good_qty), 0)   AS sum_dcf_good_qty,
        COALESCE(SUM(dcf_defect_qty), 0) AS sum_dcf_defect_qty,
        COALESCE(SUM(dcf_return_qty), 0) AS sum_dcf_return_qty,
        COALESCE(SUM(dcf_labtest_qty), 0) AS sum_dcf_labtest_qty
      FROM base
      GROUP BY material_code
    ),
    ranked AS (
      SELECT
        material_code,
        order_number,
        zcf_work_date,
        zcf_seq,
        zcf_mcs_cd,
        zcf_mcs_color_cd,
        ROW_NUMBER() OVER (
          PARTITION BY material_code
          ORDER BY zcf_work_date , zcf_seq , order_number
        ) AS rn
      FROM base
    ),
    remain_filtered AS (
      SELECT
        s.material_code,
        s.sum_order_qty,
        s.sum_dcf_good_qty,
        s.sum_dcf_defect_qty,
        s.sum_dcf_return_qty,
        s.sum_dcf_labtest_qty,
        (s.sum_order_qty - s.sum_dcf_good_qty - s.sum_dcf_defect_qty - s.sum_dcf_return_qty - s.sum_dcf_labtest_qty) AS remain
      FROM summed s
      WHERE (s.sum_order_qty - s.sum_dcf_good_qty - s.sum_dcf_defect_qty - s.sum_dcf_return_qty - s.sum_dcf_labtest_qty) > 0
    )
    SELECT
      r.material_code,
      rf.sum_order_qty,
      rf.sum_dcf_good_qty,
      rf.sum_dcf_defect_qty,
      rf.sum_dcf_return_qty,
      rf.sum_dcf_labtest_qty,
      rf.remain,
      r.order_number,
      r.zcf_work_date,
      r.zcf_seq,
      r.zcf_mcs_cd,
      r.zcf_mcs_color_cd
    FROM remain_filtered rf
    JOIN ranked r
      ON r.material_code = rf.material_code AND r.rn = 1
    ORDER BY r.material_code ASC
    LIMIT $${params.length}
  `;

  const { rows } = await client.query(sql, params);
  return rows;
}

export async function queryDmpdProdOrderOptions(client, { plant, filters }) {
  const { whereSql, values } = buildWhereAndValues({ plant, filters });

  const sqlMat = `
    SELECT DISTINCT material_code
    FROM mes.dmpd_prod_order_detail
    WHERE ${whereSql} AND material_code IS NOT NULL
    ORDER BY material_code ASC
  `;
  const { rows: matRows } = await client.query(sqlMat, values);

  const sqlWc = `
    SELECT DISTINCT work_center
    FROM mes.dmpd_prod_order_detail
    WHERE ${whereSql} AND work_center IS NOT NULL
    ORDER BY work_center ASC
  `;
  const { rows: wcRows } = await client.query(sqlWc, values);

  const sqlLine = `
    SELECT DISTINCT zcf_line_cd
    FROM mes.dmpd_prod_order_detail
    WHERE ${whereSql} AND zcf_line_cd IS NOT NULL
    ORDER BY zcf_line_cd ASC
  `;
  const { rows: lineRows } = await client.query(sqlLine, values);

  const sqlComb = `
    SELECT DISTINCT material_code, work_center, zcf_line_cd
    FROM mes.dmpd_prod_order_detail
    WHERE ${whereSql}
      AND material_code IS NOT NULL
      AND work_center IS NOT NULL
      AND zcf_line_cd IS NOT NULL
    ORDER BY material_code ASC, work_center ASC, zcf_line_cd ASC
  `;
  const { rows: combRows } = await client.query(sqlComb, values);

  return {
    material_code: matRows.map(r => r.material_code),
    work_center: wcRows.map(r => r.work_center),
    zcf_line_cd: lineRows.map(r => r.zcf_line_cd),
    combinations: combRows,
  };
}

export async function queryDmpdProdOrderComponents(client, { plant, parentOrderNumbers }) {
  if (!Array.isArray(parentOrderNumbers) || parentOrderNumbers.length === 0) {
    return [];
  }

  const sql = `
    WITH comp AS (
      SELECT
        zcf_nt_order_number AS parent_order_number,
        material_code,
        order_number,
        po_id,
        aps_id,
        zcf_work_date,
        zcf_seq,
        (
          order_qty
          - COALESCE(dcf_good_qty, 0)
          - COALESCE(dcf_defect_qty, 0)
          - COALESCE(dcf_return_qty, 0)
          - COALESCE(dcf_labtest_qty, 0)
        ) AS remain
      FROM mes.dmpd_prod_order_detail
      WHERE plant = $1
        AND zcf_nt_order_number = ANY($2::text[])
        AND material_code IS NOT NULL
    )
    SELECT
      parent_order_number,
      material_code,
      ARRAY_AGG(order_number ORDER BY zcf_work_date , zcf_seq , order_number) AS order_numbers,
      ARRAY_AGG(po_id ORDER BY zcf_work_date , zcf_seq , order_number) AS po_ids,
      ARRAY_AGG(aps_id ORDER BY zcf_work_date , zcf_seq , order_number) AS aps_ids,
      SUM(remain) AS remain
    FROM comp
    GROUP BY parent_order_number, material_code
  `;

  const params = [plant, parentOrderNumbers];
  const { rows } = await client.query(sql, params);
  return rows;
}

/**
 * Material 옵션 조회 (remain > 0)
 * - plant 필수
 * - workCenter / line / styleCd / sizeCd 옵션 필터
 * - remain = ordered - goodsreceipt - defect - return - labtest
 * - 모든 NULL은 0으로 처리
 * - zcf_style_cd, zcf_style_nm, zcf_size_cd 포함
 */
export async function findMaterialsWithRemain(client, { plant, workCenter, line, styleCd, sizeCd }) {
  const values = [];
  const where = [];

  values.push(plant);
  where.push(`plant = $${values.length}`);

  if (typeof workCenter === 'string' && workCenter.trim() !== '') {
    values.push(workCenter.trim());
    where.push(`work_center = $${values.length}`);
  }

  if (typeof line === 'string' && line.trim() !== '') {
    values.push(line.trim());
    where.push(`zcf_line_cd = $${values.length}`);
  }

  if (typeof styleCd === 'string' && styleCd.trim() !== '') {
    values.push(styleCd.trim());
    where.push(`zcf_style_cd = $${values.length}`);
  }

  if (typeof sizeCd === 'string' && sizeCd.trim() !== '') {
    values.push(sizeCd.trim());
    where.push(`zcf_size_cd = $${values.length}`);
  }

  const sql = `
    SELECT
      d.material_code,
      MAX(d.material_nm) AS material_name,
      MAX(d.zcf_mcs_cd) AS zcf_mcs_cd,
      MAX(d.zcf_mcs_color_nm) AS zcf_mcs_color_nm,
      MAX(d.zcf_style_cd) AS zcf_style_cd,
      MAX(d.zcf_style_nm) AS zcf_style_nm,
      MAX(d.zcf_size_cd) AS zcf_size_cd
    FROM mes.dmpd_prod_order_detail d
    WHERE ${where.join(' AND ')}
    GROUP BY d.material_code
    HAVING SUM(COALESCE(d.order_qty, 0)) >
      SUM(COALESCE(d.dcf_good_qty, 0))
      + SUM(COALESCE(d.dcf_defect_qty, 0))
      + SUM(COALESCE(d.dcf_return_qty, 0))
      + SUM(COALESCE(d.dcf_labtest_qty, 0))
    ORDER BY d.material_code
`;

  const { rows } = await client.query(sql, values);
  return rows;
}

/**
 * Component 조회
 * - remain 계산 시 모든 NULL은 0으로 처리
 */
export async function findComponents(client, { plant, workCenter, line, materialCode, limit }) {
  // 기본 limit 방어
  let safeLimit = Number.parseInt(limit, 10);
  if (!Number.isFinite(safeLimit) || safeLimit <= 0) safeLimit = 5000;
  if (safeLimit > 5000) safeLimit = 5000;

  const values = [];
  const whereA = [];

  values.push(plant);
  whereA.push(`A.plant = $${values.length}`);

  if (typeof materialCode === 'string' && materialCode.trim() !== '') {
    values.push(materialCode.trim());
    whereA.push(`A.material_code = $${values.length}`);
  }

  if (typeof workCenter === 'string' && workCenter.trim() !== '') {
    values.push(workCenter.trim());
    whereA.push(`A.work_center = $${values.length}`);
  }

  if (typeof line === 'string' && line.trim() !== '') {
    values.push(line.trim());
    whereA.push(`A.zcf_line_cd = $${values.length}`);
  }

  values.push(safeLimit);
  const limitParamIndex = values.length;

  const sql = `
    SELECT
      MIN(A.order_number) AS parent_order_number,
      B.material_code,
      MIN(B.order_number) AS order_number,
      MIN(B.po_id) AS po_id,
      MIN(B.aps_id) AS aps_id,
      SUM(
        COALESCE(B.order_qty, 0)
        - COALESCE(B.dcf_good_qty, 0)
        - COALESCE(B.dcf_defect_qty, 0)
        - COALESCE(B.dcf_return_qty, 0)
        - COALESCE(B.dcf_labtest_qty, 0)
      ) AS remain
    FROM mes.dmpd_prod_order_detail A
    JOIN mes.dmpd_prod_order_detail B
      ON A.plant = B.plant
     AND A.zcf_child_mat IS NOT NULL
     AND POSITION(B.material_code IN A.zcf_child_mat) > 0
    WHERE ${whereA.join(' AND ')}
      AND COALESCE(A.order_qty, 0) > COALESCE(A.dcf_good_qty, 0)
        + COALESCE(A.dcf_defect_qty, 0)
        + COALESCE(A.dcf_labtest_qty, 0)
        + COALESCE(A.dcf_return_qty, 0)
      AND B.material_code IS NOT NULL
    GROUP BY B.material_code
    ORDER BY B.material_code
    LIMIT $${limitParamIndex}
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}

/**
 * 스타일/사이즈로 material 결정
 * - remain > 0 기준으로 고유 material_code 추출
 * - 결과: 0개 / 1개 / 2개 이상
 */
export async function resolveMaterialByStyleSize(client, { plant, workCenter, line, styleCd, sizeCd }) {
  const sql = `
    WITH base AS (
      SELECT
        d.material_code,
        COALESCE(d.order_qty, 0)      AS o,
        COALESCE(d.dcf_good_qty, 0)   AS g,
        COALESCE(d.dcf_defect_qty, 0) AS dqty,
        COALESCE(d.dcf_return_qty, 0) AS r,
        COALESCE(d.dcf_labtest_qty, 0) AS l
      FROM mes.dmpd_prod_order_detail d
      WHERE d.plant = $1
        AND d.work_center = $2
        AND d.zcf_line_cd = $3
        AND d.zcf_style_cd = $4
        AND d.zcf_size_cd  = $5
        AND d.material_code IS NOT NULL
    ),
    per_material AS (
      SELECT
        material_code,
        (SUM(o) - SUM(g) - SUM(dqty) - SUM(r) - SUM(l)) AS remain
      FROM base
      GROUP BY material_code
    )
    SELECT DISTINCT material_code
    FROM per_material
    WHERE remain > 0
    ORDER BY material_code
  `;
  const values = [plant, workCenter, line, styleCd, sizeCd];
  const { rows } = await client.query(sql, values);
  return rows.map(r => r.material_code);
}
