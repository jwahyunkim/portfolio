// src/data/Postgre/fetchSizes.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

export interface SizeItem {
  size_cd: string
  material_count: number
}

export interface SizesResponse {
  success: true
  data: SizeItem[]
  meta: {
    count: number
  }
}

// =========================
// 파라미터 타입
// =========================

export interface FetchSizesParams {
  plant: string
  work_center: string
  line: string
  style_cd: string
}

// =========================
// API 호출 함수
// =========================

/**
 * 사이즈 옵션 조회(스타일 선택 후)
 * GET /api/postgres/sizes
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *  - style_cd    : 필수
 *
 * 응답:
 *  - data: [{ size_cd, material_count }]
 */
export async function fetchSizes(
  params: FetchSizesParams
): Promise<SizesResponse> {
  const qs = new URLSearchParams()
  qs.set('plant', params.plant)
  qs.set('work_center', params.work_center)
  qs.set('line', params.line)
  qs.set('style_cd', params.style_cd)

  // const url = 'http://localhost:4000/api/postgres/sizes'
  // const url = 'http://203.228.135.28:4000/api/postgres/sizes'
  // const url = '/api/postgres/sizes'
   const url = `${API_BASE_URL}/api/postgres/sizes`

  try {
    const response: AxiosResponse<SizesResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching sizes:', error)
    throw error
  }
}
