// src/data/Postgre/fetchMaterialResolve.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

export interface MaterialResolveData {
  // remain > 0 인 고유 material_code 목록
  material_codes: string[]
  // material_codes.length (백엔드에서 내려줌)
  count: number
}

export interface MaterialResolveMeta {
  // 중복 제거된 고유 material_code 개수
  material_count: number
}

export interface MaterialResolveResponse {
  success: boolean
  data: MaterialResolveData
  meta: MaterialResolveMeta
}

// =========================
// 파라미터 타입
// =========================

export interface FetchMaterialResolveParams {
  plant: string
  work_center: string
  line: string
  style_cd: string
  size_cd: string
}

// =========================
// API 호출 함수
// =========================

/**
 * 스타일 + 사이즈로 material_code 해상
 * GET /api/postgres/materials/resolve
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *  - style_cd    : 필수
 *  - size_cd     : 필수
 *
 * 응답:
 *  - data: { material_codes: string[], count: number }
 *  - meta: { material_count: number }
 */
export async function fetchMaterialResolve(
  params: FetchMaterialResolveParams
): Promise<MaterialResolveResponse> {
  const qs = new URLSearchParams()
  qs.set('plant', params.plant)
  qs.set('work_center', params.work_center)
  qs.set('line', params.line)
  qs.set('style_cd', params.style_cd)
  qs.set('size_cd', params.size_cd)

  // const url = 'http://localhost:4000/api/postgres/materials/resolve'
  // const url = 'http://203.228.135.28:4000/api/postgres/materials/resolve'
  // const url = '/api/postgres/materials/resolve'
   const url = `${API_BASE_URL}/api/postgres/materials/resolve`

  try {
    const response: AxiosResponse<MaterialResolveResponse> = await axios.get(
      url,
      {
        params: qs
      }
    )
    return response.data
  } catch (error) {
    console.error('Error resolving material by style/size:', error)
    throw error
  }
}
