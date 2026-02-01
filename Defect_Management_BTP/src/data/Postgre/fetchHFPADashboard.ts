// src/data/Postgre/fetchHFPADashboard.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

// HFPA Dashboard 한 행
// 백엔드 쿼리 컬럼:
//   div, H_00 ~ H_23, TOTAL
export interface HfpaDashboardItem {
  div: string
  H_00: string
  H_01: string
  H_02: string
  H_03: string
  H_04: string
  H_05: string
  H_06: string
  H_07: string
  H_08: string
  H_09: string
  H_10: string
  H_11: string
  H_12: string
  H_13: string
  H_14: string
  H_15: string
  H_16: string
  H_17: string
  H_18: string
  H_19: string
  H_20: string
  H_21: string
  H_22: string
  H_23: string
  TOTAL: string
}

// HFPA Dashboard 응답
// 백엔드 응답 형식:
// {
//   success: true,
//   data: HfpaDashboardItem[],
//   message: string | null
// }
export interface HfpaDashboardResponse {
  success: true
  data: HfpaDashboardItem[]
  message: string | null
}

// =========================
// 파라미터 타입
// =========================

export interface FetchHFPADashboardParams {
  plant_cd: string
  inspect_date: string // YYYYMMDD
  work_center: string
  line_cd: string
}

// =========================
// API 호출 함수
// =========================

/**
 * HFPA Dashboard 시간대/불량/합계 조회
 * GET /api/postgres/hfpa/dashboard
 *
 * 백엔드 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - inspect_date  : 필수 (YYYYMMDD)
 *  - work_center   : 필수
 *  - line_cd       : 필수
 */
export async function fetchHFPADashboard(
  params: FetchHFPADashboardParams
): Promise<HfpaDashboardResponse> {
  const qs = new URLSearchParams()

  qs.set('plant_cd', params.plant_cd)
  qs.set('inspect_date', params.inspect_date)
  qs.set('work_center', params.work_center)
  qs.set('line_cd', params.line_cd)

  // const url = 'http://localhost:4000/api/postgres/hfpa/dashboard'
  // const url = 'http://203.228.135.28:4000/api/postgres/hfpa/dashboard'
  // const url = '/api/postgres/hfpa/dashboard'
   const url = `${API_BASE_URL}/api/postgres/hfpa/dashboard`

  try {
    const response: AxiosResponse<HfpaDashboardResponse> = await axios.get(
      url,
      {
        params: qs
      }
    )
    return response.data
  } catch (error) {
    console.error('Error fetching hfpa-dashboard:', error)
    throw error
  }
}
