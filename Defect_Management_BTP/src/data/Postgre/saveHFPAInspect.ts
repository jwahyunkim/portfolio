// src/data/Postgre/saveHFPAInspect.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

// 요청용 불량 항목 (한 건)
export interface HfpaInspectDefectItem {
  defect_cd: string
  // defect_qty 는 서버에서 항상 1로 처리하므로 받지 않는다.
}

// 요청 바디
export interface HfpaInspectRequestBody {
  inspect_date: string
  plant_cd: string
  work_center: string
  line_cd: string
  hour_cd: string
  po_no: string
  po_seq: string
  ucc_no: string
  style_cd?: string
  size_cd?: string
  inspector_no: string
  creator: string
  create_pc: string
  defects: HfpaInspectDefectItem[]
}

// 백엔드에서 돌려주는 INSP/CRTN 행 타입(간단히 맵 타입으로 정의)
export type HfpaInspectRow = Record<string, unknown>

// 백엔드 data 필드 구조
export interface HfpaInspectData {
  inspRowCount: number
  crtnRowCount: number
  errorCode: string
  inspect_no: string
  insp: HfpaInspectRow | null
  inspList: HfpaInspectRow[]
  crtn: HfpaInspectRow | null
}

// 전체 응답 타입
export interface HfpaInspectResponse {
  success: boolean
  data: HfpaInspectData | null
  message: string | null
}

// 서버 에러 바디 안전 접근용(옵셔널 필드)
type BackendError = {
  success?: boolean
  message?: string | null
}

// =========================
// API 호출 함수
// =========================

/**
 * HFPA 검사 저장
 * POST /api/postgres/hfpa/inspect
 *
 * 바디 파라미터:
 *  - inspect_date : YYYYMMDD (필수)
 *  - plant_cd     : 필수
 *  - work_center  : 필수
 *  - line_cd      : 필수
 *  - hour_cd      : 필수
 *  - po_no        : 필수
 *  - po_seq       : 필수
 *  - ucc_no       : 필수
 *  - style_cd     : 선택
 *  - size_cd      : 선택
 *  - inspector_no : 필수
 *  - creator      : 필수
 *  - create_pc    : 필수
 *  - defects      : 필수, 최소 1개 이상 배열
 *      - defects[].defect_cd : 필수 (불량 코드)
 *
 * 처리 내용(백엔드 기준 요약):
 *  - inspect_no 는 서버에서 자동 생성 (VARCHAR(3), 0 패딩, 한 요청당 1개)
 *  - quality.dmqm_hfpa_insp 에 defects 개수만큼 여러 행 INSERT
 *    (각 행의 defect_qty 는 서버에서 1로 고정)
 *  - quality.dmqm_hfpa_crtn 에 집계 INSERT 또는 DEFECT_QTY UPDATE
 *    (DEFECT_QTY = INSP 행 COUNT(*))
 */
export async function saveHFPAInspect(
  body: HfpaInspectRequestBody
): Promise<HfpaInspectResponse> {
  // const url = 'http://localhost:4000/api/postgres/hfpa/inspect'
  // const url = 'http://203.228.135.28:4000/api/postgres/hfpa/inspect'
  // const url = '/api/postgres/hfpa/inspect'
   const url = `${API_BASE_URL}/api/postgres/hfpa/inspect`

  try {
    const response: AxiosResponse<HfpaInspectResponse> = await axios.post(url, body)

    // 백엔드 success 플래그 기준으로 분기
    if (response.data?.success) {
      return response.data
    }

    return {
      success: false,
      data: null,
      message: response.data?.message ?? 'Request failed'
    }
  } catch (error: unknown) {
    // AxiosError 여부 판단
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as BackendError | undefined
      const serverMessage =
        typeof data?.message === 'string' ? data.message : undefined

      return {
        success: false,
        data: null,
        message: serverMessage ?? error.message ?? 'Network error'
      }
    }

    // 일반 Error 객체
    if (error instanceof Error) {
      return {
        success: false,
        data: null,
        message: error.message
      }
    }

    // 알 수 없는 예외
    return {
      success: false,
      data: null,
      message: 'Unknown error'
    }
  }
}
