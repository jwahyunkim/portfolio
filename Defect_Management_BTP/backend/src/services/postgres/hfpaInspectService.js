// src/services/postgres/hfpaInspectService.js

import {
  getNextInspectSeq,
  insertHfpaInsp,
  findHfpaInspByKey,
} from '../../models/postgres/hfpaInspDao.js'

import {
  getNextInspectNo,
  countHfpaCrtByKey,
  countDefectQtyFromInsp,
  insertHfpaCrt,
  updateHfpaCrtDefectQty,
  findHfpaCrtByKey,
} from '../../models/postgres/hfpaCrtDao.js'

/**
 * HFPA 검사 저장 서비스 (다건 불량 처리 + 무불량 허용)
 *
 * 한 번 호출로:
 *  1) quality.dmqm_hfpa_insp 에 불량 여러 건 INSERT
 *     - inspect_no : 서버에서 MAX + 1 (한 번만 생성, 모든 불량에 동일)
 *     - inspect_seq: 각 행마다 MAX + 1 (순번 증가)
 *  2) quality.dmqm_hfpa_crtn 에 집계 INSERT 또는 UPDATE
 *     - defect_qty: INSP 테이블에서 COUNT(*) 로 재계산
 *
 * 모두 같은 트랜잭션 안에서 처리한다.
 *
 * 요청 파라미터(요약):
 *  - 필수: inspect_date, plant_cd, work_center, line_cd, po_no, po_seq, ucc_no, hour_cd
 *  - 선택: style_cd, size_cd, inspector_no, creator, create_pc
 *  - defects: 선택(없거나 빈 배열 허용)
 *      각 요소: { defect_cd?: string }  // 없거나 공백이면 '' 저장, defect_qty는 항상 1
 *
 * 무불량 처리:
 *  - defects가 없거나 빈 배열이면 INSP INSERT 0건
 *  - CRTN은 crtn_qty = 1, defect_qty = 0 으로 INSERT/UPDATE
 *  - 매 요청마다 inspect_no 새 발번
 *
 * 반환:
 *  - inspRowCount: INSP에 INSERT된 행 수
 *  - crtnRowCount: CRTN INSERT/UPDATE 행 수
 *  - errorCode   : MSG0004(성공) / MSG0030(변경 없음)
 *  - inspect_no  : 이번에 사용된 검사 번호
 *  - insp        : 방금 저장된 INSP 중 첫 행(없으면 null)
 *  - inspList    : 방금 저장된 INSP 행 전체 배열(없으면 [])
 *  - crtn        : CRTN 헤더 행
 *
 * @param {import('pg').PoolClient} client
 * @param {object} params
 */
export async function saveHfpaInspect(client, params) {
  const inspect_date = typeof params.inspect_date === 'string' ? params.inspect_date.trim() : ''
  const plant_cd     = typeof params.plant_cd     === 'string' ? params.plant_cd.trim()     : ''
  const work_center  = typeof params.work_center  === 'string' ? params.work_center.trim()  : ''
  const line_cd      = typeof params.line_cd      === 'string' ? params.line_cd.trim()      : ''
  const po_no        = typeof params.po_no        === 'string' ? params.po_no.trim()        : ''
  const po_seq       = typeof params.po_seq       === 'string' ? params.po_seq.trim()       : ''
  const ucc_no       = typeof params.ucc_no       === 'string' ? params.ucc_no.trim()       : ''
  const style_cd     = typeof params.style_cd     === 'string' ? params.style_cd.trim()     : ''
  const size_cd      = typeof params.size_cd      === 'string' ? params.size_cd.trim()      : ''
  const inspector_no = typeof params.inspector_no === 'string' ? params.inspector_no.trim() : ''
  const creator      = typeof params.creator      === 'string' ? params.creator.trim()      : ''
  const create_pc    = typeof params.create_pc    === 'string' ? params.create_pc.trim()    : ''
  const hour_cd      = typeof params.hour_cd      === 'string' ? params.hour_cd.trim()      : ''

  // TODO: hour_cd 형식(예: "00"~"23") 검증은 추후 별도 validator 함수에서 수행

  const defectsRaw = Array.isArray(params.defects) ? params.defects : []

  // 기본 필수 키 검증 (inspect_no는 서버에서 계산)
  if (
    !inspect_date ||
    !plant_cd ||
    !work_center ||
    !line_cd ||
    !po_no ||
    !po_seq ||
    !ucc_no ||
    !hour_cd
  ) {
    const err = new Error(
      'inspect_date, plant_cd, work_center, line_cd, po_no, po_seq, ucc_no, hour_cd are required'
    )
    err.statusCode = 400
    throw err
  }

  // defects: 선택 처리 (없거나 빈 배열 가능)
  const defects = defectsRaw.map((d) => {
    const defect_cd = typeof d?.defect_cd === 'string' ? d.defect_cd.trim() : ''
    const defect_qty = 1 // 항상 1
    return { defect_cd, defect_qty }
  })

  const groupKeyForInspectNo = {
    inspect_date,
    plant_cd,
    work_center,
    line_cd,
    po_no,
    po_seq,
    ucc_no,
  }

  let inspRowCountTotal = 0
  let crtnRowCount = 0
  let crtnRow = null
  let inspect_no = ''
  const inspRows = []

  await client.query('BEGIN')

  try {
    // 0) inspect_no 생성 (VARCHAR(3), 0 패딩) - 한 번만
    inspect_no = await getNextInspectNo(client, groupKeyForInspectNo)

    const headerKey = {
      ...groupKeyForInspectNo,
      inspect_no,
    }

    // 1) INSP에 여러 줄 INSERT (defects 배열 기준)
    for (const defect of defects) {
      const nextSeq = await getNextInspectSeq(client, {
        inspect_date,
        plant_cd,
        work_center,
        line_cd,
      })

      const insertedCount = await insertHfpaInsp(client, {
        inspect_date,
        plant_cd,
        work_center,
        line_cd,
        inspect_seq: nextSeq,
        po_no,
        po_seq,
        ucc_no,
        inspect_no,
        hour_cd,
        style_cd,
        size_cd,
        defect_cd: defect.defect_cd,   // 공백 허용
        defect_qty: defect.defect_qty, // 항상 1
        inspector_no,
        creator,
        create_pc,
      })

      inspRowCountTotal += insertedCount

      // 방금 INSERT한 행 조회해서 배열에 담기
      const row = await findHfpaInspByKey(client, {
        inspect_date,
        plant_cd,
        work_center,
        line_cd,
        inspect_seq: nextSeq,
      })

      if (row) {
        inspRows.push(row)
      }
    }

    // 2) CRTN 집계 INSERT/UPDATE
    //    INSP 테이블 기준으로 DEFECT_QTY 재계산 (COUNT(*))
    const calcDefectQty = await countDefectQtyFromInsp(client, headerKey) // 무불량이면 0

    const existingCount = await countHfpaCrtByKey(client, headerKey)

    if (existingCount === 0) {
      // 첫 헤더 생성: crtn_qty = 1, defect_qty = 재계산값(무불량이면 0)
      crtnRowCount = await insertHfpaCrt(client, {
        ...headerKey,
        hour_cd,
        style_cd,
        defect_qty: calcDefectQty,
        inspector_no,
        creator,
        create_pc,
      })
    } else {
      // 기존 헤더 있으면: DEFECT_QTY 재계산해서 UPDATE
      crtnRowCount = await updateHfpaCrtDefectQty(client, {
        ...headerKey,
        defect_qty: calcDefectQty,
      })

      // 혹시 UPDATE 대상이 없으면 INSERT (보수적 처리)
      if (crtnRowCount === 0) {
        crtnRowCount = await insertHfpaCrt(client, {
          ...headerKey,
          hour_cd,
          style_cd,
          defect_qty: calcDefectQty,
          inspector_no,
          creator,
          create_pc,
        })
      }
    }

    // 3) 지금 저장된 CRTN 헤더 조회
    crtnRow = await findHfpaCrtByKey(client, headerKey)

    await client.query('COMMIT')

    const errorCode =
      (inspRowCountTotal > 0 || crtnRowCount > 0) ? 'MSG0004' : 'MSG0030'

    return {
      inspRowCount: inspRowCountTotal,
      crtnRowCount,
      errorCode,
      inspect_no,
      // 호환용 (첫 번째 INSP 행)
      insp: inspRows[0] ?? null,
      // 방금 저장된 INSP 행 전체
      inspList: inspRows,
      // CRTN 헤더
      crtn: crtnRow,
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}
