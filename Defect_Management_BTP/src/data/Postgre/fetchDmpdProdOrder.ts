// src/data/Postgre/fetchDmpdProdOrderOptions.ts
import axios, { AxiosResponse } from 'axios'
import { API_BASE_URL } from '../../config/api'
// 공통 BASE URL
// const BASE_URL = 'http://localhost:4000/api/postgres'
// const BASE_URL = 'http://203.228.135.28:4000/api/postgres'
//  const BASE_URL = '/api/postgres/'
const BASE_URL = `${API_BASE_URL}/api/postgres`

// =========================
// 타입 정의
// =========================

// Plant 옵션 한 건
export interface PlantOption {
  plant_cd: string
  plant_nm: string
}

export interface PlantsResponse {
  success: true
  data: PlantOption[]
  meta: {
    count: number
  }
}

// Work Center 옵션 한 건
export interface WorkCenterOption {
  code: string
  name: string
}

export interface WorkCentersResponse {
  success: true
  data: WorkCenterOption[]
  meta: {
    count: number
  }
}

// Line 옵션 한 건
export interface LineOption {
  line_cd: string
  line_name: string
}

export interface LinesResponse {
  success: true
  data: LineOption[]
  meta: {
    count: number
  }
}

// Machine 옵션 한 건
export interface MachineOption {
  machine_cd: string
}

export interface MachinesResponse {
  success: true
  data: MachineOption[]
  meta: {
    count: number
  }
}

// Material 옵션 한 건 (remain > 0 인 것만)
export interface MaterialOption {
  material_code: string
  material_name: string | null
  zcf_mcs_cd: string | null
  zcf_mcs_color_nm: string | null
  zcf_style_cd: string | null          // 스타일 코드 (옵션)
  zcf_style_nm: string | null          // 스타일명 (옵션, NULL 가능)
  zcf_size_cd: string | null           // 사이즈 코드 (옵션)
}

export interface MaterialsResponse {
  success: true
  data: MaterialOption[]
  meta: {
    count: number
  }
}

// Component 옵션 한 건
export interface ComponentOption {
  parent_order_number: string
  material_code: string
  order_numbers: string[]
  po_ids?: string[]
  aps_ids?: string[]
  remain: string // numeric → 문자열
}

export interface ComponentsResponse {
  success: true
  data: ComponentOption[]
  meta: {
    count: number
    limit: number
  }
}

// =========================
// 파라미터 타입
// =========================

// Plants
export interface FetchPlantsParams {
  work_center?: string
  line?: string
  material_code?: string
}

// Work Centers
export interface FetchWorkCentersParams {
  plant?: string
  code_class_cd: string
  line?: string
  material_code?: string
}

// Lines
export interface FetchLinesParams {
  plant?: string
  work_center?: string
  material_code?: string
}

// Machines
export interface FetchMachinesParams {
  plant: string
  work_center?: string
  material_code?: string
}

// Materials (remain > 0)
export interface FetchMaterialsParams {
  plant?: string
  work_center?: string
  line?: string
}

// Components
export interface FetchComponentsParams {
  plant?: string
  work_center?: string
  line?: string
  material_code: string
  limit?: number
}

// =========================
// API 호출 함수들
// =========================

/**
 * Plant 옵션 조회
 * GET /api/postgres/plants
 *
 * 백엔드 쿼리 파라미터:
 *  - (현재) 필수 없음 → 전체 plant 목록
 *  - work_center   : 옵션 (향후 연쇄 필터용, 현재 백엔드에서는 필터 조건에 사용되지 않음)
 *  - line          : 옵션 (향후 연쇄 필터용, 현재 백엔드에서는 필터 조건에 사용되지 않음)
 *  - material_code : 옵션 (향후 연쇄 필터용, 현재 백엔드에서는 필터 조건에 사용되지 않음)
 *
 * 사용 예:
 *  - 기본: await fetchPlants()
 *  - 확장: await fetchPlants({ work_center, line, material_code })
 */
export async function fetchPlants(
  params?: FetchPlantsParams
): Promise<PlantsResponse> {
  const qs = new URLSearchParams()

  if (params?.work_center) qs.set('work_center', params.work_center)
  if (params?.line) qs.set('line', params.line)
  if (params?.material_code) qs.set('material_code', params.material_code)

  const url = `${BASE_URL}/plants`
  // const url = `/api/postgres/plants`

  try {
    const response: AxiosResponse<PlantsResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching plants:', error)
    throw error
  }
}

/**
 * Work Center 옵션 조회
 * GET /api/postgres/work-centers
 *
 * 백엔드 쿼리 파라미터:
 *  - plant         : 필수 (예: C200)
 *  - code_class_cd : 필수 (예: BTM_INT)
 *  - line          : 옵션
 *  - material_code : 옵션
 */
export async function fetchWorkCenters(
  params: FetchWorkCentersParams
): Promise<WorkCentersResponse> {
  const qs = new URLSearchParams()

  if (params.plant) qs.set('plant', params.plant)
  // 필수
  qs.set('code_class_cd', params.code_class_cd)

  if (params.line) qs.set('line', params.line)
  if (params.material_code) qs.set('material_code', params.material_code)

  const url = `${BASE_URL}/work-centers`
  // const url = `/api/postgres/work-centers`
  try {
    const response: AxiosResponse<WorkCentersResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching work-centers:', error)
    throw error
  }
}

/**
 * Line 옵션 조회
 * GET /api/postgres/lines
 *
 * 백엔드 쿼리 파라미터:
 *  - plant         : 필수 (예: C200)
 *  - work_center   : 옵션 (arbpl 로 사용)
 *  - material_code : 옵션 (현재는 연쇄필터 주석 상태지만, 파라미터 형식 유지)
 */
export async function fetchLines(
  params: FetchLinesParams
): Promise<LinesResponse> {
  const qs = new URLSearchParams()

  if (params.plant) qs.set('plant', params.plant)
  if (params.work_center) qs.set('work_center', params.work_center)
  if (params.material_code) qs.set('material_code', params.material_code)

  const url = `${BASE_URL}/lines`
  // const url = `/api/postgres/lines`
  try {
    const response: AxiosResponse<LinesResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching lines:', error)
    throw error
  }
}

/**
 * Machine 옵션 조회
 * GET /api/postgres/machines
 *
 * 백엔드 쿼리 파라미터:
 *  - plant         : 필수
 *  - work_center   : 선택 (arbpl 로 사용, 있는 경우에만 필터 적용)
 *  - material_code : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 */
export async function fetchMachines(
  params: FetchMachinesParams
): Promise<MachinesResponse> {
  const qs = new URLSearchParams()

  qs.set('plant', params.plant)
  if (params.work_center) qs.set('work_center', params.work_center)
  if (params.material_code) qs.set('material_code', params.material_code)

  const url = `${BASE_URL}/machines`
  // const url = `/api/postgres/machines`
  try {
    const response: AxiosResponse<MachinesResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching machines:', error)
    throw error
  }
}

/**
 * Material 옵션 조회 (remain > 0)
 * GET /api/postgres/materials
 *
 * 백엔드 쿼리 파라미터:
 *  - plant       : 필수 (예: C200)
 *  - work_center : 옵션
 *  - line        : 옵션 (zcf_line_cd 로 사용)
 *
 * 비즈니스 룰:
 *  - 프론트에서는 보통 work_center + line 이 선택된 상태에서 호출하게 사용
 */
export async function fetchMaterials(
  params: FetchMaterialsParams
): Promise<MaterialsResponse> {
  const qs = new URLSearchParams()

  if (params.plant) qs.set('plant', params.plant)
  if (params.work_center) qs.set('work_center', params.work_center)
  if (params.line) qs.set('line', params.line)

  const url = `${BASE_URL}/materials`
  // const url = `/api/postgres/materials`

  try {
    const response: AxiosResponse<MaterialsResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching materials:', error)
    throw error
  }
}

/**
 * Component 옵션/집계 조회
 * GET /api/postgres/components
 *
 * 백엔드 쿼리 파라미터:
 *  - plant         : 필수 (예: C200)
 *  - material_code : 필수
 *  - work_center   : 옵션
 *  - line          : 옵션
 *  - limit         : 옵션 (기본 DEFAULT_LIMIT, 최대 5000)
 *
 * 비즈니스 룰:
 *  - scrap_return === 'R' 인 경우에만 프론트에서 이 함수를 호출하는 것으로 사용
 */
export async function fetchComponents(
  params: FetchComponentsParams
): Promise<ComponentsResponse> {
  const qs = new URLSearchParams()

  if (params.plant) qs.set('plant', params.plant)

  // 필수
  qs.set('material_code', params.material_code)

  if (params.work_center) qs.set('work_center', params.work_center)
  if (params.line) qs.set('line', params.line)
  if (typeof params.limit === 'number') {
    qs.set('limit', String(params.limit))
  }

  const url = `${BASE_URL}/components`
  // const url = `/api/postgres/components`

  try {
    const response: AxiosResponse<ComponentsResponse> = await axios.get(url, {
      params: qs
    })
    return response.data
  } catch (error) {
    console.error('Error fetching components:', error)
    throw error
  }
}
