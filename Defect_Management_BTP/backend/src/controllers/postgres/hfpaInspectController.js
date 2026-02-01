// src/controllers/postgres/hfpaInspectController.js

import pool from '../../models/postgres/pool.js'
import { saveHfpaInspect } from '../../services/postgres/hfpaInspectService.js'

/**
 * POST /api/postgres/hfpa/inspect
 *
 * HFPA 검사 저장
 *  - quality.dmqm_hfpa_insp + quality.dmqm_hfpa_crtn 둘 다 한 번에 처리
 *  - inspect_no 는 서버에서 자동 생성 (VARCHAR(3), 0 패딩)
 *
 * 바디 예시 (여러 불량 한 번에 또는 무불량):
 * {
 *   "inspect_date": "20251208",
 *   "plant_cd": "C200",
 *   "work_center": "11FGA",
 *   "line_cd": "LN01",
 *   "po_no": "2500542978",
 *   "po_seq": "00100",
 *   "ucc_no": "00500912014598168067",
 *   "hour_cd": "07",                // 프론트에서 필수로 전달
 *   "style_cd": "IQ0291-010",
 *   "size_cd": "7t",
 *   "inspector_no": "test",
 *   "creator": "test",
 *   "create_pc": "F4:4D:30:64:5B:3A@10.10.24.102",
 *   "defects": [
 *     { "defect_cd": "" }  // defect_cd 미입력 시 공백 저장 가능
 *   ]
 * }
 *
 * 규칙 업데이트:
 *  - defects: 선택(없거나 빈 배열 허용)
 *  - defects[].defect_cd: 선택, 없으면 공백('') 저장
 *
 * 응답:
 *  - 성공:
 *    {
 *      success: true,
 *      data: {
 *        inspRowCount: number,       // INSP INSERT 건수
 *        crtnRowCount: number,       // CRTN INSERT/UPDATE 건수
 *        errorCode: "MSG0004" | "MSG0030",
 *        inspect_no: "001",
 *        insp: { ...첫 번째 INSP 행 } | null,
 *        inspList: [ ...방금 저장된 INSP 행 배열 ],
 *        crtn: { ...quality.dmqm_hfpa_crtn 컬럼 전체 }
 *      },
 *      message: null
 *    }
 *
 *  - 실패:
 *    {
 *      success: false,
 *      message: "에러 메시지"
 *    }
 */
async function saveHfpaInspectHandler(req, res) {
  let client

  try {
    const body = req.body || {}

    // 1차 필수값 체크 (inspect_no 제외)
    const requiredKeys = [
      'inspect_date',
      'plant_cd',
      'work_center',
      'line_cd',
      'po_no',
      'po_seq',
      'ucc_no',
      'hour_cd',
    ]

    const missing = requiredKeys.filter((k) => !body[k])

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'inspect_date, plant_cd, work_center, line_cd, po_no, po_seq, ucc_no, hour_cd are required',
      })
    }

    // defects: 선택 항목이므로 존재/비어있음 검증 없음

    client = await pool.connect()

    const result = await saveHfpaInspect(client, body)

    return res.json({
      success: true,
      data: result,
      message: null,
    })
  } catch (err) {
    const status = err.statusCode || 500

    if (status === 400) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Invalid request',
      })
    }

    console.error('[saveHfpaInspectHandler] error:', err)

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    })
  } finally {
    if (client) {
      client.release()
    }
  }
}

export default {
  saveHfpaInspect: saveHfpaInspectHandler,
}
