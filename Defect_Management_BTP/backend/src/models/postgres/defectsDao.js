// src/models/postgres/defectsDao.js
/**
 * DAO: PostgreSQL 쿼리 모음
 */

// 후보 오더 조회(단순 페이징)
export async function getCandidates(
  client,
  { plant, work_center, line_cd, material_code, limit = 200, offset = 0 },
) {
  const sql = `
    SELECT
      order_number,
      po_id,
      aps_id,
      order_qty,
      dcf_good_qty,
      dcf_defect_qty,
      dcf_return_qty,
      dcf_labtest_qty,
      zcf_work_date,
      zcf_seq
    FROM mes.dmpd_prod_order_detail
    WHERE plant = $1
      AND work_center = $2
      AND zcf_line_cd = $3
      AND material_code = $4
      AND (
        COALESCE(order_qty, 0)
        - COALESCE(dcf_good_qty, 0)
        - COALESCE(dcf_defect_qty, 0)
        - COALESCE(dcf_return_qty, 0)
        - COALESCE(dcf_labtest_qty, 0)
      ) > 0
    ORDER BY zcf_work_date , zcf_seq , order_number 
    LIMIT $5 OFFSET $6
  `;
  const params = [plant, work_center, line_cd, material_code, limit, offset];
  const { rows } = await client.query(sql, params);
  return rows;
}

// 잔여 조건을 포함하여 안전하게 불량/반품 수량 증가
// mode: 'DEFECT' → dcf_defect_qty 증가, 'RETURN' → dcf_return_qty 증가
export async function applyDefectToOrder(
  client,
  { plant, order_number, applyQty, mode },
) {
  const sql = `
    UPDATE mes.dmpd_prod_order_detail
       SET
         dcf_defect_qty = COALESCE(dcf_defect_qty, 0)
                          + CASE WHEN $4 = 'DEFECT' THEN $1 ELSE 0 END,
         dcf_return_qty = COALESCE(dcf_return_qty, 0)
                          + CASE WHEN $4 = 'RETURN' THEN $1 ELSE 0 END,
         dcf_qty_update_date = TO_CHAR(CURRENT_DATE, 'YYYYMMDD')
     WHERE plant = $2
       AND order_number = $3
       AND (
         COALESCE(order_qty, 0)
         - COALESCE(dcf_good_qty, 0)
         - COALESCE(dcf_defect_qty, 0)
         - COALESCE(dcf_return_qty, 0)
         - COALESCE(dcf_labtest_qty, 0)
       ) >= $1
  `;
  const params = [applyQty, plant, order_number, mode];
  const result = await client.query(sql, params);
  return result.rowCount; // 0이면 경합/잔여부족 등으로 실패
}

// 최신 값 재계산용 단건 조회
export async function getOrderForUpdateCalc(client, { plant, order_number }) {
  const sql = `
    SELECT
      order_number,
      po_id,
      aps_id,
      order_qty,
      dcf_good_qty,
      dcf_defect_qty,
      dcf_return_qty,
      dcf_labtest_qty
    FROM mes.dmpd_prod_order_detail
    WHERE plant = $1 AND order_number = $2
  `;
  const params = [plant, order_number];
  const { rows } = await client.query(sql, params);
  return rows[0] ?? null;
}
export async function getComponentPrevIds(
  client,
  { plant, component_order_number },
) {
    const sql = `
      SELECT
        po_id AS prev_po_id,
        aps_id AS prev_aps_id,
        plant AS prev_plant_cd
      FROM mes.dmpd_prod_order_detail
      WHERE plant = $1
        AND order_number = $2
    `;
  const params = [plant, component_order_number];
  const { rows } = await client.query(sql, params);
  return rows[0] ?? null;
}

export async function getComponentOrderNumber(
  client,
  { plant, parent_order_number, component_code },
) {
  const sql = `
    SELECT
      order_number
    FROM mes.dmpd_prod_order_detail
    WHERE plant = $1
      AND material_code = $3
      AND POSITION($2 IN zcf_nt_order_number) > 0
    ORDER BY zcf_work_date , zcf_seq , order_number
    LIMIT 1
  `;
  const params = [plant, parent_order_number, component_code];
  const { rows } = await client.query(sql, params);
  return rows[0]?.order_number ?? null;
}

// b테이블 INSERT
export async function insertDefectLog(client, row) {
  const sql = `
    INSERT INTO quality.dmqm_defect_result (
      plant_cd, defect_form, defect_no, defect_date,
      work_center, line_cd, machine_cd, material_code, component_code,
      division, defect_qty, defect_type, defect_decision,
      defect_source, defect_check, mold_code, mold_size,
      mold_set, mold_id, obs_nu, obs_seq_nu, order_number,
      po_id, aps_id, prev_po_id, prev_aps_id, prev_plant_cd,
      creator, create_dt, create_pc
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22,
      $23,$24,$25,$26,$27,$28, NOW(), $29
    )
  `;
  const p = [
    row.plant_cd,
    row.defect_form,
    row.defect_no,
    row.defect_date,
    row.work_center,
    row.line_cd,
    row.machine_cd,
    row.material_code,
    row.component_code,
    row.division,
    row.defect_qty,
    row.defect_type,
    row.defect_decision,
    row.defect_source,
    row.defect_check,
    row.mold_code,
    row.mold_size,
    row.mold_set,
    row.mold_id,
    row.obs_nu,
    row.obs_seq_nu,
    row.order_number,
    row.po_id,
    row.aps_id,
    row.prev_po_id,
    row.prev_aps_id,
    row.prev_plant_cd,
    row.creator,
    row.create_pc,
  ];
  await client.query(sql, p);
}

// 날짜별 전역 최대 시퀀스 조회(YYYYMMDD 접두)
export async function getTodayMaxSeq(client, { yyyymmdd }) {
  const sql = `
    SELECT MAX(defect_no) AS max_no
      FROM quality.dmqm_defect_result
     WHERE defect_no LIKE $1
  `;
  const like = `${yyyymmdd}%`;
  const { rows } = await client.query(sql, [like]);
  const maxNo = rows[0]?.max_no;
  if (!maxNo) return 0;
  const seqStr = String(maxNo).slice(-4);
  const seq = Number(seqStr);
  return Number.isFinite(seq) ? seq : 0;
}

// 시퀀스 기반 defect_no 생성용 파트 조회(오늘 날짜 + nextval)
export async function getNextDefectNoParts(client) {
  const sql = `
    SELECT
      TO_CHAR(CURRENT_DATE, 'YYYYMMDD') AS yyyymmdd,
      nextval('quality.dmqm_defect_result_seq') AS seq
  `;
  const { rows } = await client.query(sql);
  return rows[0] ?? { yyyymmdd: null, seq: null };
}
