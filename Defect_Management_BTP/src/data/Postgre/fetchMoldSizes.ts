// src/data/Postgre/fetchMoldSizes.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'

// =========================
// 타입 정의
// =========================

export interface MoldSizeItem {
  mold_size_cd: string
  mold_size_nm: string
  mold_prt: string
}

export interface MoldSizesMeta {
  count: number
}

export interface MoldSizesResponse {
  success: boolean
  data: MoldSizeItem[]
  meta: MoldSizesMeta
}

// =========================
// 파라미터 타입
// =========================

export interface FetchMoldSizesParams {
  plant: string
  work_center: string
  line: string
  material_code: string
  mold_code: string
}

// =========================
// API 호출 함수
// =========================

/**
 * Mold Size 옵션 조회 (연쇄 2단계)
 * GET /api/postgres/molds/sizes
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - work_center   : 필수
 *  - line          : 필수
 *  - material_code : 필수
 *  - mold_code     : 필수
 *
 * 응답:
 *  - data: [{ mold_size_cd, mold_size_nm, mold_prt }]
 *  - meta: { count }
 */
export async function fetchMoldSizes(
  params: FetchMoldSizesParams
): Promise<MoldSizesResponse> {
  const qs = new URLSearchParams()
  qs.set('plant', params.plant)
  qs.set('work_center', params.work_center)
  qs.set('line', params.line)
  qs.set('material_code', params.material_code)
  qs.set('mold_code', params.mold_code)

  const url = `${API_BASE_URL}/api/postgres/molds/sizes`

  try {
    const response: AxiosResponse<MoldSizesResponse> = await axios.get(url, {
      params: qs,
    })
    return response.data
  } catch (error) {
    console.error('Error fetching mold sizes:', error)
    throw error
  }
}
