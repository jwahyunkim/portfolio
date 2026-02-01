// backend/src/models/postgres/returnConfirmDao.js

/**
 * DAO: Return Management (Return Confirm) 쿼리 모음
 */

/**
 * Plant 마스터 조회
 */
export async function findPlants(client) {
  const sql = `
    SELECT
      plant_id AS plant_cd,
      plant_nm AS plant_nm
    FROM master.dmbs_plant_master
    ORDER BY plant_id
  `;

  const { rows } = await client.query(sql);
  return rows;
}

/**
 * Return Management용 Defect Result 조회
 *
 *  - date_from: 시작일 (defect_date)
 *  - date_to: 종료일 (defect_date)
 *  - plant_cd: Plant 코드
 *  - work_center: Work Center (선택)
 *  - line_cd: Line 코드 (선택)
 *  - confirm_status: 'ALL', 'Y', 'N' (Confirmed, Not yet confirm)
 */
export async function findDefectResultForReturn(client, params) {
  const {
    date_from,
    date_to,
    plant_cd,
    work_center,
    line_cd,
    confirm_status
  } = params

  // WHERE 절
  const conditions = [];
  const values = [];
  let paramIndex = 1;

  // 필수 파라미터 (date_from, date_to)
  if (date_from) {
    conditions.push(`dr.defect_date >= $${paramIndex++}`);
    values.push(date_from);
  }
  if (date_to) {
    conditions.push(`dr.defect_date <= $${paramIndex++}`);
    values.push(date_to);
  }
  
  // 필수 파라미터 (plant_cd)
  conditions.push(`dr.plant_cd = $${paramIndex++}`);
  values.push(plant_cd)

  // 필수 조건 : defect_decision IN ('R', 'S') - Return 또는 Scrap 대상
  conditions.push(`dr.defect_decision IN ('R', 'S')`);

  // 선택 파라미터 (work_center)
  if (work_center) {
    conditions.push(`dr.work_center = $${paramIndex++}`);
    values.push(work_center);
  }

  // 선택 파라미터 (line_cd)
  if (line_cd) {
    conditions.push(`dr.line_cd = $${paramIndex++}`);
    values.push(line_cd);
  }

  // Confirm 상태 필터
  if (confirm_status === 'Y') {
    conditions.push(`COALESCE(dr.cfm_yn, 'N') = 'Y'`);
  } else if (confirm_status === 'N') {
    conditions.push(`COALESCE(dr.cfm_yn, 'N') = 'N'`);
  }
  // ALL 인 경우 조건 추가 X

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT * FROM (
      SELECT DISTINCT ON (dr.defect_no)
        dr.defect_no,
        dr.defect_form,
        dr.defect_date,
        TO_CHAR(dr.create_dt, 'HH24:MI:SS') AS create_time,
        pm.plant_nm,
        wc.ktext1 AS work_center_name,
        fl.lvcd AS line_cd,
        po1.zcf_op_nm AS process_name,
        po2.zcf_op_nm AS supplier_name,
        pod_mat.material_nm AS material,
        pod_comp.material_nm AS component,
        po1.zcf_style_nm AS style_name,
        po1.zcf_style_cd AS style_code,
        cm_type.code_name AS type,
        cm.code_name AS reason_name,
        po1.zcf_size_cd AS size,
        dr.division,
        dr.defect_qty AS quantity,
        dr.cfm_yn,
        dr.cfm_dt,
        dr.cfm_user,
        dr.plant_cd,
        dr.work_center,
        dr.line_cd AS dr_line_cd,
        dr.create_dt,
        dr.order_number,
        dr.defect_type,
        dr.po_id,
        dr.aps_id,
        dr.prev_po_id,
        dr.prev_aps_id,
        dr.prev_plant_cd,
        dr.material_code,
        dr.component_code,
        dr.defect_decision
      FROM quality.dmqm_defect_result dr
      LEFT JOIN master.dmbs_plant_master pm
        ON dr.plant_cd = pm.plant_id
      LEFT JOIN master.dmbs_workcenter_master wc
        ON dr.plant_cd = wc.werks
        AND dr.work_center = wc.arbpl
      LEFT JOIN master.dmbs_funcloc_master fl
        ON dr.plant_cd = fl.werks
        AND dr.work_center = fl.arbpl
        AND dr.line_cd = fl.lvcd
        AND fl.level = '4'
      LEFT JOIN mes.dmpd_prod_order_detail po1
        ON dr.order_number = po1.order_number
      LEFT JOIN (
        SELECT DISTINCT ON (po_id, aps_id)
          po_id, aps_id, zcf_op_nm, zcf_op_cd
        FROM mes.dmpd_prod_order_detail
      ) po2 ON po2.po_id = dr.prev_po_id
        AND po2.aps_id = dr.prev_aps_id
      LEFT JOIN mes.dmpd_prod_order_detail pod_mat
        ON dr.po_id = pod_mat.po_id
        AND dr.aps_id = pod_mat.aps_id
      LEFT JOIN mes.dmpd_prod_order_detail pod_comp
        ON dr.prev_po_id = pod_comp.po_id
        AND dr.prev_aps_id = pod_comp.aps_id
      LEFT JOIN mes.dmpd_prod_order_detail pod_reason
        ON pod_reason.po_id = CASE dr.defect_decision
                                WHEN 'S' THEN dr.po_id
                                WHEN 'R' THEN dr.prev_po_id
                              END
        AND pod_reason.aps_id = CASE dr.defect_decision
                                  WHEN 'S' THEN dr.aps_id
                                  WHEN 'R' THEN dr.prev_aps_id
                                END
      LEFT JOIN quality.dmbs_code_master_temp cm
        ON cm.code_class_cd = pod_reason.zcf_op_cd
        AND cm.plant_cd = dr.plant_cd
        AND cm.sub_code = dr.defect_type
      LEFT JOIN quality.dmbs_code_master_temp cm_type
        ON cm_type.plant_cd = dr.plant_cd
        AND cm_type.sub_code = dr.defect_source
        AND cm_type.code_class_cd = CASE
          WHEN dr.defect_form IN ('BTM_INT', 'VSM_INT', 'ETC_INT', 'UPSTREAM')
          THEN 'GRADE_TYPE'
          ELSE 'DEFECTIVE_TYPE'
        END
      ${whereSql}
      ORDER BY dr.defect_no, dr.create_dt DESC
    ) AS unique_rows
    ORDER BY defect_date DESC, create_dt DESC
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}

/**
 * Defect Result Confirm 업데이트 (PK 3개)
 *
 * PK: plant_cd, defect_form, defect_no
 */
export async function updateDefectResultConfirm(client, params) {
  const { defect_items, cfm_user } = params;
  let updated_count = 0;
  const updated_items = []; // Update 성공한 항목 수집용 (defect_no, defect_decision 포함)

  // 각 항목에 대해 개별 UPDATE (PK 3개)
  for (const item of defect_items) {
    const sql = `
      UPDATE quality.dmqm_defect_result
      SET
        cfm_yn = 'Y',
        cfm_dt = NOW(),
        cfm_user = $3
      WHERE plant_cd = $1
        AND defect_no = $2
        AND COALESCE(cfm_yn, 'N') = 'N'
      RETURNING defect_no, defect_decision
    `;

    const values = [
      item.plant_cd,
      item.defect_no,
      cfm_user
    ];

    // 디버깅: WHERE 조건값 출력
    console.log('[updateDefectResultConfirm] Trying to update with:', {
      plant_cd: values[0],
      defect_no: values[1],
      cfm_user: values[2]
    });

    const { rows } = await client.query(sql, values);
    console.log('[updateDefectResultConfirm] Updated rows:', rows.length);

    if (rows.length > 0) {
      updated_count += rows.length;
      updated_items.push({
        defect_no: rows[0].defect_no,
        defect_decision: rows[0].defect_decision
      });
    }
  }

  return { updated_count, updated_items };
}

/**
 * Stored Procedure 호출: sp_dmqm_defect_return_save
 *
 * - defect_no를 파라미터로 받아 quality.dmif_defect_return 테이블에 데이터 INSERT
 * - Procedure는 두 개의 INSERT문 실행 (UNION ALL):
 *   1) RTN (proc_typ='RTN'): material_code 일치
 *   2) INV (proc_typ='INV'): material_code 불일치
 */

export async function callDefectReturnSave(client, { defect_no }) {
  const sql = `CALL quality.sp_dmqm_defect_return_save($1)`;
  const values = [defect_no];

  try {
    await client.query(sql, values);
    console.log(`[callDefectReturnSave] Successfully called procedure for defect_no: ${defect_no}`);
  } catch (err) {
    console.error(`[callDefectReturnSave] Error calling procedure for defect_no ${defect_no}:`, err);
    throw err;
  }
}

/**
 * Work Center 목록 조회 (Return Management 전용)
 */
export async function findWorkCenters(client, { plant }) {
  const sql = `
    SELECT
      workcenter AS code,
      wc_name AS name
    FROM MES.DMBS_WORK_CENTER
    WHERE plant = $1
    ORDER BY workcenter
  `;

  const { rows } = await client.query(sql, [plant]);
  return rows;
}

/**
 * Line 목록 조회 (Return Management 전용)
 *
 * - plant: 필수
 * - work_center: 필수 (arbpl 필터)
 */
export async function findLines(client, { plant, work_center }) {
  const conditions = ["level = '4'", "werks = $1", "arbpl = $2"];
  const values = [plant, work_center];

  const sql = `
    SELECT DISTINCT
      lvcd AS line_cd,
      pltxt AS line_name
    FROM MASTER.DMBS_FUNCLOC_MASTER
    WHERE ${conditions.join(' AND ')}
    ORDER BY lvcd
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}
