// src/data/Postgre/fetchHFPAMisspackingScan.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// =========================
// 타입 정의
// =========================

export interface HfpaMisspackingScanItem {
  ebeln: string
  ebelp: string
  po: string
  style_cd: string
  size_cd: string
  exidv: string
}

export interface HfpaMisspackingScanResponse {
  success: boolean
  data: HfpaMisspackingScanItem[]
  message: string | null
}

export interface FetchHFPAMisspackingScanParams {
  exidv: string
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
 * HFPA Misspacking Scan 조회
 * GET /api/postgres/hfpa/misspacking-scan
 *
 * 쿼리 파라미터:
 *  - exidv : 필수
 */
export async function fetchHFPAMisspackingScan(
  params: FetchHFPAMisspackingScanParams
): Promise<HfpaMisspackingScanResponse> {
  const qs = new URLSearchParams()
  qs.set('exidv', params.exidv)

  // const url = 'http://localhost:4000/api/postgres/hfpa/misspacking-scan'
  // const url = 'http://203.228.135.28:4000/api/postgres/hfpa/misspacking-scan'
  // const url = '/api/postgres/hfpa/misspacking-scan'
   const url = `${API_BASE_URL}/api/postgres/hfpa/misspacking-scan`

  try {
    const response: AxiosResponse<HfpaMisspackingScanResponse> = await axios.get(url, {
      params: qs
    })

    if (response.data?.success) {
      return response.data
    }

    return {
      success: false,
      data: [],
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
        data: [],
        message: serverMessage ?? error.message ?? 'Network error'
      }
    }

    // 일반 Error 객체
    if (error instanceof Error) {
      return {
        success: false,
        data: [],
        message: error.message
      }
    }

    // 알 수 없는 예외
    return {
      success: false,
      data: [],
      message: 'Unknown error'
    }
  }
}
