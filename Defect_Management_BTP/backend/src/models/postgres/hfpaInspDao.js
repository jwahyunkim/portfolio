// src/models/postgres/hfpaInspDao.js

/**
 * quality.dmqm_hfpa_insp DAO
 *
 * 사용 컬럼:
 *  - inspect_date
 *  - plant_cd
 *  - work_center
 *  - line_cd
 *  - inspect_seq
 *  - po_no
 *  - po_seq
 *  - ucc_no
 *  - inspect_no
 *  - hour_cd
 *  - style_cd
 *  - size_cd
 *  - defect_cd
 *  - defect_qty
 *  - inspector_no
 *  - creator
 *  - create_dt
 *  - create_pc
 */

/**
 * 같은 (inspect_date, plant_cd, work_center, line_cd) 그룹에서
 * 다음 inspect_seq 값 조회: MAX(inspect_seq) + 1
 *
 * @param {import('pg').PoolClient} client
 * @param {{ inspect_date: string, plant_cd: string, work_center: string, line_cd: string }} key
 * @returns {Promise<number>}
 */
export async function getNextInspectSeq(client, key) {
  const sql = `
    SELECT COALESCE(MAX(inspect_seq::integer), 0) + 1 AS next_seq
      FROM quality.dmqm_hfpa_insp
     WHERE inspect_date = $1
       AND plant_cd     = $2
       AND work_center  = $3
       AND line_cd      = $4
  `

  const params = [
    key.inspect_date,
    key.plant_cd,
    key.work_center,
    key.line_cd,
  ]

  const { rows } = await client.query(sql, params)
  const nextSeq = Number(rows[0]?.next_seq || 1)
  return nextSeq
}

/**
 * quality.dmqm_hfpa_insp 한 줄 INSERT
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   inspect_seq: number,
 *   po_no: string,
 *   po_seq: string,
 *   ucc_no: string,
 *   inspect_no: string,
 *   hour_cd: string,
 *   style_cd: string,
 *   size_cd: string,
 *   defect_cd: string,
 *   defect_qty: number,
 *   inspector_no: string,
 *   creator: string,
 *   create_pc: string
 * }} data
 * @returns {Promise<number>} rowCount
 */
export async function insertHfpaInsp(client, data) {
  const sql = `
    INSERT INTO quality.dmqm_hfpa_insp (
      inspect_date,
      plant_cd,
      work_center,
      line_cd,
      inspect_seq,
      po_no,
      po_seq,
      ucc_no,
      inspect_no,
      hour_cd,
      style_cd,
      size_cd,
      defect_cd,
      defect_qty,
      inspector_no,
      creator,
      create_dt,
      create_pc
    ) VALUES (
      $1,  -- inspect_date
      $2,  -- plant_cd
      $3,  -- work_center
      $4,  -- line_cd
      $5,  -- inspect_seq
      $6,  -- po_no
      $7,  -- po_seq
      $8,  -- ucc_no
      $9,  -- inspect_no
      $10, -- hour_cd
      $11, -- style_cd
      $12, -- size_cd
      $13, -- defect_cd
      $14, -- defect_qty
      $15, -- inspector_no
      $16, -- creator
      NOW(), -- create_dt
      $17  -- create_pc
    )
  `

  const params = [
    data.inspect_date,
    data.plant_cd,
    data.work_center,
    data.line_cd,
    data.inspect_seq,
    data.po_no,
    data.po_seq,
    data.ucc_no,
    data.inspect_no,
    data.hour_cd,
    data.style_cd,
    data.size_cd,
    data.defect_cd,
    data.defect_qty,
    data.inspector_no,
    data.creator,
    data.create_pc,
  ]

  const result = await client.query(sql, params)
  return result.rowCount
}

/**
 * 방금 INSERT 한 INSP 한 행 조회
 * PK 기준:
 *  - inspect_date, plant_cd, work_center, line_cd, inspect_seq
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   inspect_seq: number
 * }} key
 * @returns {Promise<object | null>}
 */
export async function findHfpaInspByKey(client, key) {
  const sql = `
    SELECT *
      FROM quality.dmqm_hfpa_insp
     WHERE inspect_date = $1
       AND plant_cd     = $2
       AND work_center  = $3
       AND line_cd      = $4
       AND inspect_seq  = $5
  `

  const params = [
    key.inspect_date,
    key.plant_cd,
    key.work_center,
    key.line_cd,
    key.inspect_seq,
  ]

  const { rows } = await client.query(sql, params)
  return rows[0] ?? null
}
