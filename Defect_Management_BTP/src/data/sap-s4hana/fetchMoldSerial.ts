// src/data/sap-s4hana/fetchMoldSerial.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'

// =========================
// 타입 정의
// =========================

export interface MoldSerialData {
  zz_mo_serial: string
}

export interface MoldSerialMeta {
  count: number
}

export interface MoldSerialResponse {
  success: boolean
  data: MoldSerialData
  meta: MoldSerialMeta
}

// =========================
// 파라미터 타입
// =========================

export interface FetchMoldSerialParams {
  plant: string
  mold_code: string
  mold_size: string
}

// =========================
// API 호출 함수
// =========================

/**
 * SAP S/4HANA OData 기반 ZZ_MO_SERIAL 조회 (백엔드 프록시)
 * GET /api/sap-s4hana/molds/serial
 *
 * 쿼리 파라미터:
 *  - plant      : 필수
 *  - mold_code  : 필수
 *  - mold_size  : 필수
 *
 * 응답:
 *  - success:true
 *  - data: { zz_mo_serial: string }
 *  - meta: { count: number } (0 or 1)
 */
export async function fetchMoldSerial(
  params: FetchMoldSerialParams
): Promise<MoldSerialResponse> {
  const qs = new URLSearchParams()
  qs.set('plant', params.plant)
  qs.set('mold_code', params.mold_code)
  qs.set('mold_size', params.mold_size)

  // const url = 'http://localhost:4000/api/sap-s4hana/molds/serial'
  // const url = 'http://203.228.135.28:4000/api/sap-s4hana/molds/serial'
  // const url = '/api/sap-s4hana/molds/serial'
  const url = `${API_BASE_URL}/api/sap-s4hana/molds/serial`

  try {
    const response: AxiosResponse<MoldSerialResponse> = await axios.get(url, {
      params: qs,
    })
    return response.data
  } catch (error) {
    console.error('Error fetching mold serial:', error)
    throw error
  }
}
