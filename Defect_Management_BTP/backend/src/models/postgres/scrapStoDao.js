// src/models/postgres/scrapStoDao.js

export async function findDefectResultsByDefectNos(client, defectNos) {
  if (!Array.isArray(defectNos) || defectNos.length === 0) {
    return [];
  }

  const sql = `
    SELECT DISTINCT ON (dr.defect_no)
      dr.defect_no,
      dr.defect_qty,
      dr.scrap_qty,
      dr.po_id,
      dr.aps_id,
      dr.material_code,
      dr.plant_cd,
      dr.prev_po_id,
      dr.prev_aps_id,
      dr.prev_plant_cd,
      dr.component_code,
      dr.defect_form,
      dr.defect_decision,
      dr.create_dt
    FROM quality.dmqm_defect_result dr
    WHERE dr.defect_no = ANY($1)
    ORDER BY dr.defect_no, dr.create_dt DESC
  `;

  const { rows } = await client.query(sql, [defectNos]);
  return rows;
}

export async function findStorageLocation(client, { plant_cd, sub_code }) {
  if (!plant_cd || !sub_code) {
    return null;
  }

  const sql = `
    SELECT value_1, value_2
    FROM quality.dmbs_code_master_temp
    WHERE plant_cd = $1
      AND code_class_cd = 'ST_LOC'
      AND sub_code = $2
    LIMIT 1
  `;

  const { rows } = await client.query(sql, [plant_cd, sub_code]);

  // rows가 비어있으면 null 반환
  if (!rows[0]) return null;

  return {
      value_1: rows[0].value_1 ?? null,
      value_2: rows[0].value_2 ?? null
  };
}
