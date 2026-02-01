// src/data/Postgre/fetchFgaWorkCenters.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

// FGA Work Center 한 건
export interface FgaWorkCenterItem {
  code: string
  name: string
}

// FGA Work Center 응답
// 백엔드 응답 형식:
// {
//   success: true,
//   data: FgaWorkCenterItem[],
//   meta: { count: number }
// }
export interface FgaWorkCenterResponse {
  success: true
  data: FgaWorkCenterItem[]
  meta: {
    count: number
  }
}

// =========================
// 파라미터 타입
// =========================

export interface FetchFgaWorkCentersParams {
  plant: string
}

// =========================
// API 호출 함수
// =========================

/**
 * FGA Work Center 조회
 * GET /api/postgres/work-centers/fga
 *
 * 백엔드 쿼리 파라미터:
 *  - plant : 필수
 */
export async function fetchFgaWorkCenters(
  params: FetchFgaWorkCentersParams
): Promise<FgaWorkCenterResponse> {
  const qs = new URLSearchParams()

  qs.set('plant', params.plant)

  // const url = 'http://localhost:4000/api/postgres/work-centers/fga'
  // const url = 'http://203.228.135.28:4000/api/postgres/work-centers/fga'
  // const url = '/api/postgres/work-centers/fga'
   const url = `${API_BASE_URL}/api/postgres/work-centers/fga`

  try {
    const response: AxiosResponse<FgaWorkCenterResponse> = await axios.get(
      url,
      {
        params: qs
      }
    )
    return response.data
  } catch (error) {
    console.error('Error fetching FGA work-centers:', error)
    throw error
  }
}
