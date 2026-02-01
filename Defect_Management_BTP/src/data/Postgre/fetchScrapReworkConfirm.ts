import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// Plant 조회
export interface Plant {
  plant_cd: string
  plant_nm: string
}

export interface ScrapConfirmPlantsResponse {
  success: boolean
  data: Plant[]
  meta: {
    count: number
  }
}

export async function fetchScrapConfirmPlants(): Promise<ScrapConfirmPlantsResponse> {
  // const url = 'http://localhost:4000/api/postgres/scrap-management/plants'
  // const url = 'http://203.228.135.28:4000/api/postgres/scrap-management/plants'
  // const url = '/api/postgres/scrap-management/plants'
   const url = `${API_BASE_URL}/api/postgres/scrap-management/plants`

  try {
    const response: AxiosResponse<ScrapConfirmPlantsResponse> = await axios.get(url)
    return response.data
  } catch (error) {
    console.error('Error fetching scrap confirm plants:', error)
    throw error
  }
}

// Work Center p�
export interface WorkCenter {
  code: string
  name: string
}

export interface ScrapConfirmWorkCentersResponse {
  success: boolean
  data: WorkCenter[]
  meta: {
    count: number
  }
}

export async function fetchScrapConfirmWorkCenters(
  params: { plant: string }
): Promise<ScrapConfirmWorkCentersResponse> {
  // const url = 'http://localhost:4000/api/postgres/scrap-management/work-centers'
  // const url = 'http://203.228.135.28:4000/api/postgres/scrap-management/work-centers'
  // const url = '/api/postgres/scrap-management/work-centers'
   const url = `${API_BASE_URL}/api/postgres/scrap-management/work-centers`

  try {
    const response: AxiosResponse<ScrapConfirmWorkCentersResponse> = await axios.get(url, {
      params: { plant: params.plant }
    })
    return response.data
  } catch (error) {
    console.error('Error fetching scrap confirm work centers:', error)
    throw error
  }
}

// Process p�
export interface Process {
  op_cd: string
  op_nm: string
}

export interface ScrapConfirmProcessesResponse {
  success: boolean
  data: Process[]
  meta: {
    count: number
  }
}

export async function fetchScrapConfirmProcesses(
  params: { plant: string }
): Promise<ScrapConfirmProcessesResponse> {
  // const url = 'http://localhost:4000/api/postgres/scrap-management/processes'
  // const url = 'http://203.228.135.28:4000/api/postgres/scrap-management/processes'
  // const url = '/api/postgres/scrap-management/processes'
   const url = `${API_BASE_URL}/api/postgres/scrap-management/processes`

  try {
    const response: AxiosResponse<ScrapConfirmProcessesResponse> = await axios.get(url, {
      params: { plant: params.plant }
    })
    return response.data
  } catch (error) {
    console.error('Error fetching scrap confirm processes:', error)
    throw error
  }
}

/**
 * Scrap Management� �� p�
 */
export interface ScrapResultParams {
  date_from: string // YYYYMMDD
  date_to: string // YYYYMMDD
  plant_cd: string
  work_center?: string
  confirm_status?: 'ALL' | 'Confirmed' | 'Not yet confirm'
}

export interface ScrapResultRow {
  plant_cd: string
  defect_form: string
  defect_no: string
  defect_date: string
  create_time: string
  plant_nm: string
  work_center_name: string
  line_cd: string
  process_name: string
  supplier_name: string
  material_name: string
  component_name: string
  style_name: string
  style_code: string
  type: string
  reason_name: string
  size: string
  division: string
  quantity: number
  scrap_qty: number
  rework_qty: number
  cfm_yn: string
  decision_dt: string | null
  decision_user: string | null
  // UPDATE용 (PK)
  work_center: string
  dr_line_cd: string
  create_dt: string
  order_number: string
  defect_type: string
  // OData 호출용 필드
  po_id: string | null
  aps_id: string | null
  prev_po_id: string | null
  prev_aps_id: string | null
  prev_plant_cd: string | null
  material_code: string | null
  component_code: string | null
}

export interface ScrapConfirmResultsResponse {
  success: boolean
  data: ScrapResultRow[]
  meta: {
    count: number
  }
}

export async function fetchScrapConfirmResults(
  params: ScrapResultParams
): Promise<ScrapConfirmResultsResponse> {
  // const url = 'http://localhost:4000/api/postgres/scrap-management/scrap-results'
  // const url = 'http://203.228.135.28:4000/api/postgres/scrap-management/scrap-results'
  // const url = '/api/postgres/scrap-management/scrap-results'
   const url = `${API_BASE_URL}/api/postgres/scrap-management/scrap-results`


  const qs = new URLSearchParams()
  qs.set('date_from', params.date_from)
  qs.set('date_to', params.date_to)
  qs.set('plant_cd', params.plant_cd)

  if (params.work_center) qs.set('work_center', params.work_center)
  if (params.confirm_status) qs.set('confirm_status', params.confirm_status)

  try {
    const response: AxiosResponse<ScrapConfirmResultsResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching scrap confirm results:', error)
    throw error
  }
}

export interface ScrapItem {
  plant_cd: string
  defect_form: string
  defect_no: string
  scrap_qty: number
  rework_qty: number
}

export interface SaveScrapRequest {
  scrap_items: ScrapItem[]
  decision_user: string
}

export interface SaveScrapResponse {
  status: string
  updated_count: number
}

export async function saveScrapConfirmData(
  request: SaveScrapRequest
): Promise<SaveScrapResponse> {
  // const url = 'http://localhost:4000/api/postgres/scrap-management/save'
  // const url = 'http://203.228.135.28:4000/api/postgres/scrap-management/save'
  // const url = '/api/postgres/scrap-management/save'
   const url = `${API_BASE_URL}/api/postgres/scrap-management/save`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const errorData: unknown = await response.json()
      const msg = (errorData as { message?: string })?.message || `HTTP error ${response.status}`
      throw new Error(msg)
    }

    const data: unknown = await response.json()

    if (!isSaveScrapResponse(data)) {
      throw new Error('Invalid response format')
    }

    // 백엔드 응답 구조에서 추출
    const responseData = data as { success: boolean; data: { updated_count: number } }
    return {
      status: 'OK',
      updated_count: responseData.data.updated_count
    }

  } catch (error) {
    console.error('Error saving scrap confirm data:', error)
    throw error
  }
}

function isSaveScrapResponse(x: unknown): x is { success: boolean; data: { updated_count: number } } {
  if (typeof x !== "object" || x === null) return false
  const o = x as Record<string, unknown>

  // success 필드 체크
  if (typeof o.success !== "boolean") return false

  // data 객체 체크
  if (typeof o.data !== "object" || o.data === null) return false

  const data = o.data as Record<string, unknown>
  return typeof data.updated_count === "number"
}

/**
 * Rework 저장 API
 * 추후 개선 : updateReworkResult 와 합치면 중복 배제 가능
 */
export interface ReworkSaveRequest {
  data: string 
  user: string
}

export interface ReworkRecord {
  rwreq: string   // Rework 요청 번호
  werks: string   // Plant 코드
  oaufnr: string  // 이전 PO ID
  apsid: string   // 이전 APS ID
  naufnr: string  // 새 PO ID
  zdpeg: string   // 새 APS ID
  menge: number   // Rework 수량
  meins: string   // 단위 (PR)
  psttr: string   // 시작일 (YYYYMMDD)
  pedtr: string   // 종료일 (YYMMDD, SAP ODATA로 받은 다음 근무일)
  gsuzs: string   // 시작 시간 (HHmmss)
  gluzs: string   // 종료 시간 (HHmmss)
  raufnr?: string // SAP : Rework Order Number (생성된 오더 번호)
  process_type?: string // SAP : Type (S=성공, E=에러, W=경고)
  message?: string  //  SAP : Message (에러/ 경고 메시지)
  creator: string   // 생성자 ID
  create_dt: string // 생성 일시
}

/**
 * Rework 저장 응답
 */
export interface ReworkSaveResponse {
  status : string // "OK"
  total_items: number // 전체 Rework 항목 수
  sap_success_count: number // SAP 성공 건수 
  sap_failed_count: number  // SAP 실패 건수
  rework_records: ReworkRecord[] // Rework 레코드
  errors?: Array<{
    rwreq: string
    error: string
  }>
}

/**
 * Rework 저장 API 호출
 */
export async function saveReworkData(
  request: ReworkSaveRequest
) : Promise<ReworkSaveResponse> {
  // const url = 'http://localhost:4000/api/postgres/scrap-management/rework-save'
  // const url = 'http://203.228.135.28:4000/api/postgres/scrap-management/rework-save'
  // const url = '/api/postgres/scrap-management/rework-save'
   const url = `${API_BASE_URL}/api/postgres/scrap-management/rework-save`
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const errorData: unknown = await response.json()
      const msg = (errorData as { message?: string })?.message || `HTTP error ${response.status}`
      throw new Error(msg)
    }

    const data: unknown = await response.json()

    // 타입 가드로 런타임 검증
    if (!isReworkSaveResponse(data)) {
      throw new Error('Invalid response format')
    }

    // 응답구조에서 data 추출
    return data.data
  } catch (error) {
    console.error('Error saving rework data:', error)
    throw error
  }
}

/**
 * ReworkSaveResponse 타입 가드
 */
function isReworkSaveResponse(x: unknown): x is {
  success: boolean; data: ReworkSaveResponse
} {
  if (typeof x !== "object" || x === null) return false
  const o = x as Record<string, unknown>

  // success 필드 체크
  if (typeof o.success !== "boolean") return false

  // data 객체 체크
  if (typeof o.data !== "object" || o.data === null) return false

  const data = o.data as Record<string, unknown>

  // 필수 필드 체크
  return (
    typeof data.status === "string" &&
    typeof data.total_items === "number" &&
    typeof data.sap_success_count === "number" &&
    typeof data.sap_failed_count === "number" &&
    Array.isArray(data.rework_records)
  )
}

/**
 * SAP S/4HANA OData: Scrap STO 호출 (Scrap용)
 *
 * 예)
 * await putScrapStoForScrap([
 *   { defectno: '202511140052', proctype: 'S', werks: 'C200', lgort: '5200', ... }
 * ])
 */
export interface ScrapStoInputItem {
  defectno: string
  proctype: 'R' | 'S'
  budat?: string      // YYYY-MM-DD (미지정시 당일)
  bldat?: string      // YYYY-MM-DD (미지정시 당일)
  poid?: string       // prev_po_id
  apsid?: string      // prev_aps_id
  matnr?: string      // component_code
  werks?: string      // prev_plant_cd
  lgort?: string      // Storage Location (From) - prev_plant_cd 기준 조회
  umwrk?: string      // prev_plant_cd
  umlgo?: string      // Storage Location (To) - prev_plant_cd 기준 조회
  menge?: number      // scrap_qty
  meins?: string      // 단위 (기본 PR)
}

export interface ScrapStoResponse {
  success: boolean
  data: unknown
}

export async function putScrapStoForScrap(
  items: ScrapStoInputItem[]
): Promise<ScrapStoResponse> {
  const url = `${API_BASE_URL}/api/sap-s4hana/scrap-sto/put`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IT_INPUT: items })
    })

    if (!response.ok) {
      const errorData: unknown = await response.json()
      const msg = (errorData as { message?: string })?.message || `HTTP error ${response.status}`
      throw new Error(msg)
    }

    const data: unknown = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('Error calling scrap STO OData:', error)
    throw error
  }
}