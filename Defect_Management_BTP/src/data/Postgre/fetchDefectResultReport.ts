// src/data/Postgre/fetchDefectResultReport.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'


export interface DefectResultRow {
  [key: string]: unknown
}

export interface DefectResultReportResponse {
  success: boolean
  data: DefectResultRow[]
  message: string | null
}

export interface DefectResultReportParams {
  plantCd: string
  defectForm: string
  workCenter?: string
  /**
   * YYYY-MM-DD 형식 권장
   */
  startDate?: string
  /**
   * YYYY-MM-DD 형식 권장
   */
  endDate?: string
}

/**
 * 예)
 * await fetchDefectResultReport({
 *   plantCd: 'C200',
 *   defectForm: 'IP',   // 예: 문자열 코드
 *   workCenter: 'OSOSP'
 * })
 */
export async function fetchDefectResultReport(
  params: DefectResultReportParams
): Promise<DefectResultReportResponse> {
  const qs = new URLSearchParams()

  // 백엔드 쿼리 파라미터 이름: plant_cd, defect_form, work_center
  if (params.plantCd) {
    qs.set('plant_cd', params.plantCd)
  }
  if (params.defectForm) {
    qs.set('defect_form', params.defectForm)
  }
  if (params.workCenter) {
    qs.set('work_center', params.workCenter)
  }
  if (params.startDate) {
    qs.set('start_date', params.startDate)
  }
  if (params.endDate) {
    qs.set('end_date', params.endDate)
  }

  // const url = 'http://localhost:4000/api/postgres/defects/result-report'
  // const url = 'http://203.228.135.28:4000/api/postgres/defects/result-report'
  // const url = '/api/postgres/defects/result-report'

  const url = `${API_BASE_URL}/api/postgres/defects/result-report`


  try {
    const response: AxiosResponse<DefectResultReportResponse> = await axios.get(
      url,
      { params: qs }
    )
    return response.data
  } catch (error) {
    console.error('Error fetching defect result report:', error)
    throw error
  }
}

export interface DefectResultBySizeParams {
  plantCd: string
  defectForm: string
  workCenter?: string
  /**
   * YYYY-MM-DD 형식 권장
   */
  startDate?: string
  /**
   * YYYY-MM-DD 형식 권장
   */
  endDate?: string
}

/**
 * 예)
 * await fetchDefectResultReportBySize({
 *   plantCd: 'C200',
 *   defectForm: 'IP',
 *   workCenter: 'OSOSP',
 *   startDate: '2025-01-01',
 *   endDate: '2025-01-31'
 * })
 */
export async function fetchDefectResultReportBySize(
  params: DefectResultBySizeParams
): Promise<DefectResultReportResponse> {
  const qs = new URLSearchParams()

  // 백엔드 쿼리 파라미터 이름: plant_cd, defect_form, work_center, start_date, end_date
  if (params.plantCd) {
    qs.set('plant_cd', params.plantCd)
  }
  if (params.defectForm) {
    qs.set('defect_form', params.defectForm)
  }
  if (params.workCenter) {
    qs.set('work_center', params.workCenter)
  }
  if (params.startDate) {
    qs.set('start_date', params.startDate)
  }
  if (params.endDate) {
    qs.set('end_date', params.endDate)
  }

  // const url = 'http://localhost:4000/api/postgres/defects/result-by-size'
  // const url = 'http://203.228.135.28:4000/api/postgres/defects/result-by-size'
  // const url = '/api/postgres/defects/result-by-size'

  const url = `${API_BASE_URL}/api/postgres/defects/result-by-size`


  try {
    const response: AxiosResponse<DefectResultReportResponse> = await axios.get(
      url,
      { params: qs }
    )
    return response.data
  } catch (error) {
    console.error('Error fetching defect result report by size:', error)
    throw error
  }
}
