// src/data/sap-s4hana/putScrapSto.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'

export type ScrapStoProcType = 'S' | 'R'

export interface ScrapStoInputItem {
  defectno: string
  proctype?: ScrapStoProcType | string
  budat?: string
  bldat?: string
  poid?: string
  apsid?: string
  matnr?: string
  werks?: string
  lgort?: string
  umwrk?: string
  umlgo?: string
  menge?: number | string
  meins?: string
  use_prev?: boolean | string | number
}

export interface PutScrapStoRequestBody {
  IT_INPUT: ScrapStoInputItem[]
}

export interface ScrapStoOutputItem {
  MSGTY?: string
  MSGTX?: string
  ET_OUTPUT?: Array<{
    defectno?: string
    mblnr?: string
    mjahr?: string
  }>
  [key: string]: unknown
}

export interface ScrapStoSapResponse {
  '@odata.context'?: string
  '@odata.metadataEtag'?: string
  value?: ScrapStoOutputItem[]
  [key: string]: unknown
}

export interface PutScrapStoResponse {
  success: boolean
  data: ScrapStoSapResponse | null
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export async function putScrapSto(
  body: PutScrapStoRequestBody
): Promise<PutScrapStoResponse> {
  const url = `${API_BASE_URL}/api/sap-s4hana/scrap-sto/put`

  try {
    const response: AxiosResponse<PutScrapStoResponse> = await axios.post(url, body)
    return response.data
  } catch (error) {
    console.error('Error putting scrap STO:', error)
    throw error
  }
}
