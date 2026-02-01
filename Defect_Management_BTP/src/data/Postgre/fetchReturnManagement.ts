import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// Plant 조회
export interface Plant {
    plant_cd: string
    plant_nm: string
}

export interface ReturnPlantsResponse {
    success: boolean
    data: Plant[]
    meta: {
        count: number
    }
}

export async function fetchReturnPlants() : Promise<ReturnPlantsResponse> {
    // const url = 'http://localhost:4000/api/postgres/return-confirm/plants'
    // const url = 'http://203.228.135.28:4000/api/postgres/return-confirm/plants'
    // const url = '/api/postgres/return-confirm/plants'
     const url = `${API_BASE_URL}/api/postgres/return-confirm/plants`

    try {
        const response: AxiosResponse<ReturnPlantsResponse> = await axios.get(url)
        return response.data
    } catch (error) {
        console.error('Error fetching plants:', error)
        throw error
    }
}

// Work Center 조회
export interface WorkCenter {
    code: string
    name: string
}

export interface ReturnWorkCentersResponse {
    success: boolean
    data: WorkCenter[]
    meta: {
        count: number
    }
}

export async function fetchReturnWorkCenters(params: { plant: string }): Promise<ReturnWorkCentersResponse> {
    // const url = 'http://localhost:4000/api/postgres/return-confirm/work-centers'
    // const url = 'http://203.228.135.28:4000/api/postgres/return-confirm/work-centers'
    // const url = '/api/postgres/return-confirm/work-centers'
     const url = `${API_BASE_URL}/api/postgres/return-confirm/work-centers`

    try {
        const response: AxiosResponse<ReturnWorkCentersResponse> = await axios.get(url, {
            params: { plant: params.plant }
        })
        return response.data
    } catch (error) {
        console.error('Error fetching return work centers:', error)
        throw error
    }
}

// Line 조회
export interface Line {
    line_cd: string
    line_name: string
}

export interface ReturnLinesResponse {
    success: boolean
    data: Line[]
    meta: {
        count: number
    }
}

export async function fetchReturnLines(params: { plant: string; work_center?: string }): Promise<ReturnLinesResponse> {
    // const url = 'http://localhost:4000/api/postgres/return-confirm/lines'
    // const url = 'http://203.228.135.28:4000/api/postgres/return-confirm/lines'
    // const url = '/api/postgres/return-confirm/lines'
     const url = `${API_BASE_URL}/api/postgres/return-confirm/lines`

    const qs = new URLSearchParams()
    qs.set('plant', params.plant)
    if (params.work_center) {
        qs.set('work_center', params.work_center)
    }

    try {
        const response: AxiosResponse<ReturnLinesResponse> = await axios.get(url, {
            params: qs
        })
        return response.data
    } catch (error) {
        console.error('Error fetching return lines:', error)
        throw error
    }
}

/**
 * Return Management용 Defect Result 조회
 */
export interface DefectResultParams {
    date_from: string // YYYYMMDD
    date_to: string // YYYYMMDD
    plant_cd: string
    work_center?: string
    line_cd?: string
    confirm_status: 'ALL' | 'Y' | 'N'
}

export interface ReturnDefectResultRow {
    defect_no: string
    defect_form: string
    defect_date: string
    create_time: string // HH24:MI:SS
    plant_nm: string
    work_center_name: string
    line_cd: string
    process_name: string
    supplier_name: string
    material: string
    component: string
    style_name: string
    style_code: string
    type: string
    reason_name: string
    size: string
    division: string // 실제론 DB 참조 이야기는 사양서에 X
    quantity: number
    cfm_yn: string
    cfm_dt: string | null
    cfm_user: string | null
    // UPDATE 용 (특정 PK 값없어 where절 임시 대체)
    plant_cd: string
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
    defect_decision: string | null  // 'S' 또는 'R' - OData proctype 결정용
}

export interface ReturnDefectResultResponse {
    success: boolean
    data: ReturnDefectResultRow[]
    meta: {
        count: number
    }
}

export async function fetchDefectResults(
    params: DefectResultParams
) : Promise<ReturnDefectResultResponse> {
    // const url = 'http://localhost:4000/api/postgres/return-confirm/defect-results'
    // const url = 'http://203.228.135.28:4000/api/postgres/return-confirm/defect-results'
    // const url = '/api/postgres/return-confirm/defect-results'
     const url = `${API_BASE_URL}/api/postgres/return-confirm/defect-results`

    // 쿼리 파라미터 세팅
    const qs = new URLSearchParams()
    qs.set('date_from', params.date_from)
    qs.set('date_to', params.date_to)
    qs.set('plant_cd', params.plant_cd)
    
    if (params.work_center) qs.set('work_center', params.work_center)
    
    if (params.line_cd) qs.set('line_cd', params.line_cd)

    if (params.confirm_status) qs.set('confirm_status', params.confirm_status)
    
    try {
        const response: AxiosResponse<ReturnDefectResultResponse> = await axios.get(url, {
            params: qs
        })
        return response.data
    } catch (error) {
        console.error('Error fetching defect results:', error)
        throw error
    }
}

// Confirm 업데이트
export interface DefectItem {
    plant_cd: string
    defect_form: string
    defect_no: string
}

export interface ConfirmRequest {
    defect_items: DefectItem[]
    cfm_user: string
}

export interface ConfirmResponse {
    success: boolean
    data: {
        updated_count: number
    }
}

export async function updateConfirm(
    request: ConfirmRequest) : Promise<ConfirmResponse> {
        // const url = 'http://localhost:4000/api/postgres/return-confirm/confirm'
        // const url = 'http://203.228.135.28:4000/api/postgres/return-confirm/confirm'
        // const url = '/api/postgres/return-confirm/confirm'
         const url = `${API_BASE_URL}/api/postgres/return-confirm/confirm`

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

            // 타입 가드 
            if (!isConfirmResponse(data)) {
                throw new Error('Invalid response format')
            }

            return data

        } catch (error) {
            console.error('Error updating confirm:', error)
            throw error
        }
    }

    function isConfirmResponse(x: unknown): x is ConfirmResponse {
        if (typeof x !== "object" || x === null) return false
        const o = x as Record<string, unknown>
        return (
            typeof o.success === "boolean" &&
            typeof o.data === "object" &&
            o.data !== null &&
            typeof (o.data as Record<string, unknown>).updated_count === "number"
        )
    }

/**
 * SAP S/4HANA OData: Scrap STO 호출 (Return용)
 *
 * 예)
 * await putScrapStoForReturn([
 *   { defectno: '202511140052', proctype: 'R', ... }
 * ])
 */
export interface ScrapStoInputItem {
    defectno: string
    proctype: 'R' | 'S'
    budat?: string      // YYYY-MM-DD (미지정시 당일)
    bldat?: string      // YYYY-MM-DD (미지정시 당일)
    poid?: string       // po_id
    apsid?: string      // aps_id
    matnr?: string      // material_code
    werks?: string      // plant_cd
    lgort?: string      // Storage Location (From)
    umwrk?: string      // plant_cd (To)
    umlgo?: string      // Storage Location (To)
    menge?: number      // defect_qty
    meins?: string      // 단위 (기본 PR)
}

export interface ScrapStoRequest {
    IT_INPUT: ScrapStoInputItem[]
}

export interface ScrapStoResponse {
    success: boolean
    data: unknown
}

export async function putScrapStoForReturn(
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