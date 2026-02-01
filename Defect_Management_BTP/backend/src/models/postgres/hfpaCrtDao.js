// src/models/postgres/hfpaCrtDao.js

/**
 * quality.dmqm_hfpa_crtn DAO
 *
 * 키:
 *  - inspect_date
 *  - plant_cd
 *  - work_center
 *  - line_cd
 *  - po_no
 *  - po_seq
 *  - ucc_no
 *  - inspect_no (VARCHAR(3), 0 패딩)
 */

/**
 * 같은 (inspect_date, plant_cd, work_center, line_cd, po_no, po_seq, ucc_no) 그룹에서
 * 다음 inspect_no 값을 계산한다.
 *
 * - 컬럼 타입: VARCHAR(3)
 * - 규칙:
 *   - MAX(inspect_no)를 숫자로 해석한 뒤 +1
 *   - 3자리 0 패딩 (예: "001", "002", ..., "999")
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   po_no: string,
 *   po_seq: string,
 *   ucc_no: string
 * }} key
 * @returns {Promise<string>} next inspect_no (예: "001")
 */
export async function getNextInspectNo(client, key) {
  const sql = `
    SELECT MAX(inspect_no) AS max_no
      FROM quality.dmqm_hfpa_crtn
     WHERE inspect_date = $1
       AND plant_cd     = $2
       AND work_center  = $3
       AND line_cd      = $4
       AND po_no        = $5
       AND po_seq       = $6
       AND ucc_no       = $7
  `

  const params = [
    key.inspect_date,
    key.plant_cd,
    key.work_center,
    key.line_cd,
    key.po_no,
    key.po_seq,
    key.ucc_no,
  ]

  const { rows } = await client.query(sql, params)
  const maxNoRaw = rows[0]?.max_no

  const currentNum = typeof maxNoRaw === 'string' && maxNoRaw.trim() !== ''
    ? Number(maxNoRaw)
    : 0

  const base = Number.isFinite(currentNum) ? currentNum : 0
  const nextNum = base + 1

  if (nextNum <= 0 || nextNum > 999) {
    const err = new Error('inspect_no overflow (valid range: 001~999)')
    err.statusCode = 500
    throw err
  }

  const nextStr = String(nextNum).padStart(3, '0')
  return nextStr
}

/**
 * CRTN 테이블에 같은 키가 몇 건 있는지 조회
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   po_no: string,
 *   po_seq: string,
 *   ucc_no: string,
 *   inspect_no: string
 * }} key
 * @returns {Promise<number>}
 */
export async function countHfpaCrtByKey(client, key) {
  const sql = `
    SELECT COUNT(*) AS cnt
      FROM quality.dmqm_hfpa_crtn
     WHERE inspect_date = $1
       AND plant_cd     = $2
       AND work_center  = $3
       AND line_cd      = $4
       AND po_no        = $5
       AND po_seq       = $6
       AND ucc_no       = $7
       AND inspect_no   = $8
  `

  const params = [
    key.inspect_date,
    key.plant_cd,
    key.work_center,
    key.line_cd,
    key.po_no,
    key.po_seq,
    key.ucc_no,
    key.inspect_no,
  ]

  const { rows } = await client.query(sql, params)
  return Number(rows[0]?.cnt || 0)
}

/**
 * INSP 테이블에서 DEFECT_QTY (COUNT(*)) 계산
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   po_no: string,
 *   po_seq: string,
 *   ucc_no: string,
 *   inspect_no: string
 * }} key
 * @returns {Promise<number>}
 */
export async function countDefectQtyFromInsp(client, key) {
  const sql = `
    SELECT COALESCE(COUNT(*), 0) AS defect_qty
      FROM quality.dmqm_hfpa_insp
     WHERE inspect_date = $1
       AND plant_cd     = $2
       AND work_center  = $3
       AND line_cd      = $4
       AND po_no        = $5
       AND po_seq       = $6
       AND ucc_no       = $7
       AND inspect_no   = $8
  `

  const params = [
    key.inspect_date,
    key.plant_cd,
    key.work_center,
    key.line_cd,
    key.po_no,
    key.po_seq,
    key.ucc_no,
    key.inspect_no,
  ]

  const { rows } = await client.query(sql, params)
  return Number(rows[0]?.defect_qty || 0)
}

/**
 * CRTN 새 행 INSERT
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   po_no: string,
 *   po_seq: string,
 *   ucc_no: string,
 *   inspect_no: string,
 *   hour_cd: string,
 *   style_cd: string,
 *   defect_qty: number,
 *   inspector_no: string,
 *   creator: string,
 *   create_pc: string
 * }} data
 * @returns {Promise<number>}
 */
export async function insertHfpaCrt(client, data) {
  const sql = `
    INSERT INTO quality.dmqm_hfpa_crtn (
      inspect_date,
      plant_cd,
      work_center,
      line_cd,
      po_no,
      po_seq,
      ucc_no,
      inspect_no,
      hour_cd,
      style_cd,
      crtn_qty,
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
      $5,  -- po_no
      $6,  -- po_seq
      $7,  -- ucc_no
      $8,  -- inspect_no
      $9,  -- hour_cd
      $10, -- style_cd
      1,   -- crtn_qty
      COALESCE($11, 0), -- defect_qty
      $12, -- inspector_no
      $13, -- creator
      NOW(), -- create_dt
      $14  -- create_pc
    )
  `

  const params = [
    data.inspect_date,
    data.plant_cd,
    data.work_center,
    data.line_cd,
    data.po_no,
    data.po_seq,
    data.ucc_no,
    data.inspect_no,
    data.hour_cd,
    data.style_cd,
    data.defect_qty,
    data.inspector_no,
    data.creator,
    data.create_pc,
  ]

  const result = await client.query(sql, params)
  return result.rowCount
}

/**
 * CRTN DEFECT_QTY 업데이트
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   po_no: string,
 *   po_seq: string,
 *   ucc_no: string,
 *   inspect_no: string,
 *   defect_qty: number
 * }} data
 * @returns {Promise<number>}
 */
export async function updateHfpaCrtDefectQty(client, data) {
  const sql = `
    UPDATE quality.dmqm_hfpa_crtn
       SET defect_qty = $9
     WHERE inspect_date = $1
       AND plant_cd     = $2
       AND work_center  = $3
       AND line_cd      = $4
       AND po_no        = $5
       AND po_seq       = $6
       AND ucc_no       = $7
       AND inspect_no   = $8
  `

  const params = [
    data.inspect_date,
    data.plant_cd,
    data.work_center,
    data.line_cd,
    data.po_no,
    data.po_seq,
    data.ucc_no,
    data.inspect_no,
    data.defect_qty,
  ]

  const result = await client.query(sql, params)
  return result.rowCount
}

/**
 * CRTN 한 행 전체 조회
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   inspect_date: string,
 *   plant_cd: string,
 *   work_center: string,
 *   line_cd: string,
 *   po_no: string,
 *   po_seq: string,
 *   ucc_no: string,
 *   inspect_no: string
 * }} key
 * @returns {Promise<object | null>}
 */
export async function findHfpaCrtByKey(client, key) {
  const sql = `
    SELECT *
      FROM quality.dmqm_hfpa_crtn
     WHERE inspect_date = $1
       AND plant_cd     = $2
       AND work_center  = $3
       AND line_cd      = $4
       AND po_no        = $5
       AND po_seq       = $6
       AND ucc_no       = $7
       AND inspect_no   = $8
  `

  const params = [
    key.inspect_date,
    key.plant_cd,
    key.work_center,
    key.line_cd,
    key.po_no,
    key.po_seq,
    key.ucc_no,
    key.inspect_no,
  ]

  const { rows } = await client.query(sql, params)
  return rows[0] ?? null
}
