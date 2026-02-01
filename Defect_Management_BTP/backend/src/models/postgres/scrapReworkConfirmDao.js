// backend/src/models/postgres/scrapManagementDao.js

/**
 * DAO: Scrap Management 쿼리 모음
 */


/**
 * Plant 마스터 조회
 */
export async function findScrapPlants(client) {
  const sql = `
    SELECT
      plant_id AS plant_cd,
      plant_nm
    FROM master.dmbs_plant_master
    ORDER BY plant_id
  `;

  const { rows } = await client.query(sql);
  return rows;
}

/**
 * Work Center 목록 조회
 */
export async function findScrapWorkCenters(client, {plant}) {
  const sql = `
    SELECT
      workcenter AS code,
      wc_name AS name
    FROM MES.DMBS_WORK_CENTER
    WHERE plant = $1
    ORDER BY workcenter
  `

  const { rows } = await client.query(sql, [plant]);
  return rows;
}

/**
 * Process 목록 조회
 *
 * - plant: 필수 (필터링 위해)
 */
export async function findScrapProcesses(client, { plant }) {
  const sql = `
    SELECT
      operation_cd AS op_cd,
      operation_name AS op_nm
    FROM master.dmbs_operation_master
    WHERE plant = $1
    ORDER BY operation_name
  `;

  const { rows } = await client.query(sql, [plant]);
  return rows;
}


/**
 * Scrap Management용 결과 조회
 *  - date_from: 시작일 (defect_date)
 *  - date_to: 종료일 (defect_date)
 *  - plant_cd: Plant 코드
 *  - work_center: Work Center (선택)
 *  - confirm_status: 'ALL', 'Confirmed', 'Not yet confirm'
 */
export async function findScrapResults(client, params) {
  const {
    date_from,
    date_to,
    plant_cd,
    work_center,
    confirm_status
  } = params;

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
  values.push(plant_cd);

  // 필수 조건 :  defect_decision = 'R' (01/12 수정 요청 사항)
  conditions.push(`dr.defect_decision = 'R'`)

  // 필수 조건 : cfm_yn = 'Y' (Retrun 페이지에서 Confirm 완료건만 Scrap 대상)
  conditions.push(`COALESCE(dr.cfm_yn, 'N') = 'Y'`)


  // 선택 파라미터 (work_center)
  if (work_center) {
    conditions.push(`dr.work_center = $${paramIndex++}`);
    values.push(work_center)
  }

  // Confirm 상태 필터
  if (confirm_status === 'Confirmed') {
    // conditions.push(`COALESCE(dr.cfm_yn, 'N') = 'Y'`);
    conditions.push(`dr.decision_dt IS NOT NULL`);
  } else if (confirm_status === 'Not yet confirm') {
    // conditions.push(`COALESCE(dr.cfm_yn, 'N') = 'Y'`);
    conditions.push(`dr.decision_dt IS NULL`);
  }

  // ALL 인 경우 추가 X

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      dr.plant_cd,
      dr.defect_form,
      dr.defect_no,
      dr.defect_date,
      TO_CHAR(dr.create_dt, 'HH24:MI:SS') AS create_time,
      pm.plant_nm,
      wc.ktext1 AS work_center_name,
      fl.lvcd AS line_cd,
      po1.zcf_op_nm AS process_name,
      po2.zcf_op_nm AS supplier_name,
      mat1.maktx AS material_name,
      mat2.maktx AS component_name,
      po1.zcf_style_nm AS style_name,
      po1.zcf_style_cd AS style_code,
      cm_type.code_name AS type,
      cm.code_name AS reason_name,
      po1.zcf_size_cd AS size,
      dr.division,
      dr.defect_qty AS quantity,
      COALESCE(dr.scrap_qty, 0) AS scrap_qty,
      COALESCE(dr.rework_qty, 0) AS rework_qty,
      dr.cfm_yn,
      dr.decision_dt,
      dr.decision_user,
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
      dr.component_code
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
    LEFT JOIN master.dmbs_material mat1
      ON dr.material_code = mat1.matnr
    LEFT JOIN master.dmbs_material mat2
      ON dr.component_code = mat2.matnr
    LEFT JOIN quality.dmbs_code_master_temp cm
      ON cm.code_class_cd = po2.zcf_op_cd
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
    ORDER BY dr.defect_date DESC, dr.create_dt DESC
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}

/**
 * Scrap/Rework 수량 업데이트
 *
 * PK : plant_cd, defect_form, defect_no
 */
export async function updateScrapData(client, params) {
  const { scrap_items, decision_user } = params;
  let updated_count = 0;

  // 각 항목에 대해 개별 UPDATE
  for (const item of scrap_items) {
    const sql = `
      UPDATE quality.dmqm_defect_result
      SET
        scrap_qty = $3,
        rework_qty = $4,
        decision_dt = NOW(),
        decision_user = $5
      WHERE plant_cd = $1
        AND defect_no = $2
        AND decision_dt IS NULL
      RETURNING defect_no --update 값 바로 받아오기
    `;

    const values = [
      item.plant_cd,  
      item.defect_no,     
      item.scrap_qty,    
      item.rework_qty,     
      decision_user      
    ];

    const { rows } = await client.query(sql, values);
    console.log('[updateScrapData] Updated rows:', rows.length);

    updated_count += rows.length;
  }

  return { updated_count };

}

/**
 * Rework 저장 sp 호출
 * 
 * - data: 'defect_no|rework_qty,defect_no|rework_qty' 형식
 * - nextWorkingDay: YYYYMMDD 형식 (SAP OData로 조회한 다음 근무일)
 * - user: 사용자 ID
 */
export async function callReworkSave(client, { data, nextWorkingDay, user, createPc = 'testPC'}) {
  const sql = `
    CALL quality.sp_dmqm_defect_rework_save(
      $1, -- v_type : 'save'
      $2, -- v_data
      $3, -- v_p_date (OData로 받은 다음 근무일)
      NULL, -- v_rework_no (save 에선 미사용)
      NULL, -- v_raufnr (save 에선 미사용)
      NULL, -- v_process_type (save 에선 미사용)
      NULL, -- v_message (save 에선 미사용)
      $4, -- v_user
      $5  -- v_create_pc
    )
  `;

  // 파라미터 순서대로 바인딩
  const params = ["save", data, nextWorkingDay, user, createPc];
  await client.query(sql, params);
}

/**
 * 최근 생성된 Rework 레코드 조회 (SP 는 return 을 반환하지 않기때문에 필요)
 * 생성자 ID와 최근 몇초 이내에 들어왔는지에 대한 값 사용
 */
export async function findRecentReworkRecords(client, { user, seconds = 60}) {
  const sql = `
    SELECT
      *
    FROM quality.dmqm_defect_rework
    WHERE creator = $1
      AND create_dt >= NOW() - INTERVAL '${seconds} seconds'
    ORDER BY create_dt DESC
  `;
  const { rows } = await client.query(sql, [user]);
  return rows;
}

export async function updateReworkResult(client, {
  rwreq, raufnr, processType, message
}) {
  const sql = `
    UPDATE quality.dmqm_defect_rework
      SET raufnr = $2,
          process_type = $3,
          message = $4
      WHERE rwreq = $1
  `;

  const params = [rwreq, raufnr, processType, message];
  const { rowCount } = await client.query(sql, params);

  // 업데이트 성공 여부 확인
  return rowCount > 0;
}



