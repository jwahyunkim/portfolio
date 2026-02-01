// src/data/Postgre/fetchHFPADefectCode.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

// HFPA Defect Code 한 건
export interface HfpaDefectCodeItem {
  plant_cd: string
  code_class_cd: string
  sub_code: string | null
  code_name: string | null
  value_1: string | null
  value_2: string | null
}

// HFPA Defect Code 응답
// 백엔드 응답 형식:
// {
//   success: true,
//   data: HfpaDefectCodeItem[],
//   message: string | null
// }
export interface HfpaDefectCodeResponse {
  success: true
  data: HfpaDefectCodeItem[]
  message: string | null
}

// =========================
// 파라미터 타입
// =========================

export interface FetchHFPADefectCodeParams {
  plant_cd: string
  code_class_cd: string
}

// =========================
// API 호출 함수
// =========================

/**
 * HFPA Defect Code 조회
 * GET /api/postgres/hfpa/defect-code
 *
 * 백엔드 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - code_class_cd : 필수
 */
export async function fetchHFPADefectCode(
  params: FetchHFPADefectCodeParams
): Promise<HfpaDefectCodeResponse> {
  const qs = new URLSearchParams()

  qs.set('plant_cd', params.plant_cd)
  qs.set('code_class_cd', params.code_class_cd)

  // const url = 'http://localhost:4000/api/postgres/hfpa/defect-code'
  // const url = 'http://203.228.135.28:4000/api/postgres/hfpa/defect-code'
  // const url = '/api/postgres/hfpa/defect-code'
   const url = `${API_BASE_URL}/api/postgres/hfpa/defect-code`

  try {
    const response: AxiosResponse<HfpaDefectCodeResponse> = await axios.get(
      url,
      {
        params: qs
      }
    )
    return response.data
  } catch (error) {
    console.error('Error fetching hfpa-defect-code:', error)
    throw error
  }
}
