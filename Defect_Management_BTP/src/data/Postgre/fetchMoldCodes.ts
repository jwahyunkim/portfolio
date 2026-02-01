// src/data/Postgre/fetchMoldCodes.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'

// =========================
// 타입 정의
// =========================

export interface MoldCodeItem {
  mold_code: string
}

export interface MoldCodesMeta {
  count: number
}

export interface MoldCodesResponse {
  success: boolean
  data: MoldCodeItem[]
  meta: MoldCodesMeta
}

// =========================
// 파라미터 타입
// =========================

export interface FetchMoldCodesParams {
  plant: string
  work_center: string
  line: string
  material_code: string
}

// =========================
// API 호출 함수
// =========================

/**
 * Mold Code 옵션 조회 (연쇄 1단계)
 * GET /api/postgres/molds/codes
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - work_center   : 필수
 *  - line          : 필수
 *  - material_code : 필수
 *
 * 응답:
 *  - data: [{ mold_code }]
 *  - meta: { count }
 */
export async function fetchMoldCodes(
  params: FetchMoldCodesParams
): Promise<MoldCodesResponse> {
  const qs = new URLSearchParams()
  qs.set('plant', params.plant)
  qs.set('work_center', params.work_center)
  qs.set('line', params.line)
  qs.set('material_code', params.material_code)

  const url = `${API_BASE_URL}/api/postgres/molds/codes`

  try {
    const response: AxiosResponse<MoldCodesResponse> = await axios.get(url, {
      params: qs,
    })
    return response.data
  } catch (error) {
    console.error('Error fetching mold codes:', error)
    throw error
  }
}
