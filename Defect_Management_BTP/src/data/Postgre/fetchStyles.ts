// src/data/Postgre/fetchStyles.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

export interface StyleItem {
  style_cd: string
  style_nm: string
  material_count: number
}

export interface StylesResponse {
  success: true
  data: StyleItem[]
  meta: {
    count: number
  }
}

// =========================
// 파라미터 타입
// =========================

export interface FetchStylesParams {
  plant: string
  work_center: string
  line: string
}

// =========================
// API 호출 함수
// =========================

/**
 * 스타일 옵션 조회
 * GET /api/postgres/styles
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *
 * 응답:
 *  - data: [{ style_cd, style_nm, material_count }]
 */
export async function fetchStyles(
  params: FetchStylesParams
): Promise<StylesResponse> {
  const qs = new URLSearchParams()
  qs.set('plant', params.plant)
  qs.set('work_center', params.work_center)
  qs.set('line', params.line)

  // const url = 'http://localhost:4000/api/postgres/styles'
  // const url = 'http://203.228.135.28:4000/api/postgres/styles'
  // const url = '/api/postgres/styles'
   const url = `${API_BASE_URL}/api/postgres/styles`

  try {
    const response: AxiosResponse<StylesResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching styles:', error)
    throw error
  }
}
