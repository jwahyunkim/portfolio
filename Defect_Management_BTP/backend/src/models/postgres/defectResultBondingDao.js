// src/models/postgres/defectResultBondingDao.js

/**
 * quality.dmqm_defect_result 조회 DAO
 *
 * - plant_cd    : 필수
 * - defect_form : 필수
 * - work_center : 옵션
 *
 * order_number 조인 확장 가이드:
 *
 *   예시)
 *   SELECT
 *     dr.*,
 *     o.order_description,
 *     o.customer,
 *     o.style_code
 *   FROM quality.dmqm_defect_result dr
 *   JOIN mes.???? o
 *     ON dr.order_number = o.order_number
 *   WHERE ...
 *
 * 실제 조인 테이블/컬럼이 확정되면
 * 위 예시를 참고해서 FROM / JOIN / SELECT 부분만 교체하면 됨.
 */
export async function findDefectResultsBonding(client, { plant_cd, work_center, defect_form }) {
  if (!plant_cd || !defect_form) {
    throw new Error("plant_cd and defect_form are required");
  }

  const params = [plant_cd, defect_form];
  let whereSql = "dr.plant_cd = $1 AND dr.defect_form = $2";

  if (work_center) {
    params.push(work_center);
    whereSql += ` AND dr.work_center = $${params.length}`;
  }

  const sql = `
    SELECT
      dr.*,
      --po.material_description,
      po.zcf_style_nm,
      po.zcf_style_cd,
      po.zcf_mcs_cd,
      po.zcf_mcs_color_nm,
      po.zcf_op_nm AS process_op_nm,       -- Process
      po_child.zcf_op_nm AS supplier_op_nm,-- Supplier
      po_supply.zcf_op_nm AS supply_process_op_nm, -- Supply Process 추가
      po.zcf_gender_cd,
      po.zcf_size_cd,
      pm.plant_nm          AS plant_name,
      wc.ktext1            AS work_center_name,
      fl_line.lvcd         AS line_name,
      po.material_nm       AS material_name,
      po_child.material_nm AS component_name,
      type_cm.code_name    AS grade_type,
      defect_type_cm.code_name AS defect_type,
      reason_cm.code_name  AS defect_reason_name,
      po.zcf_model_nm      AS model_name,
      po.zcf_style_nm      AS style_name,
      fl_m.lvcd            AS machine_name
    FROM quality.dmqm_defect_result dr
    LEFT JOIN mes.dmpd_prod_order_detail po
      ON dr.order_number = po.order_number
    /* Supplier용 자기조인 (1건만 선택) */
    LEFT JOIN LATERAL (
      SELECT
        c.zcf_op_nm,
        c.material_nm
      FROM mes.dmpd_prod_order_detail c
      WHERE position(dr.order_number in c.zcf_nt_order_number) > 0
        AND c.plant         = dr.plant_cd
        AND c.material_code = dr.component_code
      LIMIT 1
    ) po_child ON true
    /* Supply Process용 자기조인 (1건만 선택) */
    LEFT JOIN LATERAL (
      SELECT
        s.zcf_op_nm
      FROM mes.dmpd_prod_order_detail s
      WHERE position(dr.order_number in s.zcf_nt_order_number) > 0
        AND s.plant         = po.plant
        AND s.material_code = dr.component_code
      LIMIT 1
    ) po_supply ON true
    LEFT JOIN master.dmbs_plant_master pm
      ON pm.plant_id = dr.plant_cd
    LEFT JOIN master.dmbs_workcenter_master wc
      ON wc.werks = dr.plant_cd
     AND wc.arbpl = dr.work_center
    LEFT JOIN master.dmbs_funcloc_master fl_line
      ON fl_line.level = '4'
     AND fl_line.werks = dr.plant_cd
     AND fl_line.arbpl = dr.work_center
     AND fl_line.lvcd  = dr.line_cd
    LEFT JOIN quality.dmbs_code_master_temp type_cm
      ON type_cm.plant_cd      = dr.plant_cd
     AND type_cm.code_class_cd = 'GRADE_TYPE'
     AND type_cm.sub_code      = dr.defect_source
    LEFT JOIN quality.dmbs_code_master_temp defect_type_cm
      ON defect_type_cm.plant_cd      = dr.plant_cd
     AND defect_type_cm.code_class_cd = 'DEFECTIVE_TYPE'
     AND defect_type_cm.sub_code      = dr.defect_source
    LEFT JOIN quality.dmbs_code_master_temp reason_cm
      ON reason_cm.plant_cd      = dr.plant_cd
     AND reason_cm.code_class_cd = po.zcf_op_cd
     AND reason_cm.sub_code      = dr.defect_type
    LEFT JOIN master.dmbs_funcloc_master fl_m
      ON fl_m.level = '5'
     AND fl_m.werks = dr.plant_cd
     AND fl_m.arbpl = dr.work_center
     AND fl_m.lvcd  = dr.machine_cd
    WHERE ${whereSql}
    ORDER BY dr.defect_no DESC
  `;

  const { rows } = await client.query(sql, params);
  return rows;
}
