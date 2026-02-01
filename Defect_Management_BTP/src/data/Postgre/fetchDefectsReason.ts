// src/data/Postgre/fetchDefectsReason.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'

// =========================
// 타입 정의
// =========================

export interface DefectReasonItem {
  value: string
  label: string
}

export interface DefectReasonMeta {
  count: number
}

export interface DefectReasonResponse {
  success: boolean
  data: DefectReasonItem[]
  meta: DefectReasonMeta
}

// =========================
// 파라미터 타입
// =========================

export interface FetchDefectReasonParams {
  plant_cd: string
  material_code: string
}

// =========================
// API 호출 함수
// =========================

/**
 * Defect Reason 옵션 조회
 * GET /api/postgres/defects/reason
 *
 * 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - material_code : 필수
 *
 * 응답:
 *  - data: [{ value, label }]
 *  - meta: { count }
 */
export async function fetchDefectsReason(
  params: FetchDefectReasonParams
): Promise<DefectReasonResponse> {
  const qs = new URLSearchParams()
  qs.set('plant_cd', params.plant_cd)
  qs.set('material_code', params.material_code)

  const url = `${API_BASE_URL}/api/postgres/defects/reason`

  try {
    const response: AxiosResponse<DefectReasonResponse> = await axios.get(url, {
      params: qs,
    })
    return response.data
  } catch (error) {
    console.error('Error fetching defects reason:', error)
    throw error
  }
}
