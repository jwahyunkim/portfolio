// defect management----------------------------------------
export { fetchTableCheck } from '../Postgre/fetchTableCheck'
export {
  fetchDistributeDefects,
  type DefectDistributeRequest,
  type DefectDistributeResponse,
  type DefectDistributeResult,
} from '../Postgre/fetchDistributeDefects'
export {
  fetchDefectResultReport,
  fetchDefectResultReportBySize,
  type DefectResultRow,
  type DefectResultBySizeParams,
  type DefectResultReportParams,
  type DefectResultReportResponse,
} from '../Postgre/fetchDefectResultReport'

export {
  // 함수들
  fetchWorkCenters,
  fetchLines,
  fetchMachines,
  fetchMaterials,
  fetchComponents,
  fetchPlants,

  // 파라미터 타입
  type FetchWorkCentersParams,
  type FetchLinesParams,
  type FetchMachinesParams,
  type FetchMaterialsParams,
  type FetchComponentsParams,
  type FetchPlantsParams,

  // 옵션/응답 타입 (필요 시)
  type WorkCenterOption,
  type WorkCentersResponse,
  type LineOption,
  type LinesResponse,
  type MachinesResponse,
  type MaterialOption,
  type MaterialsResponse,
  type ComponentOption,
  type ComponentsResponse,
  type PlantOption,
  type PlantsResponse,
} from '../Postgre/fetchDmpdProdOrder'

export {
  fetchFgaWorkCenters,
  type FgaWorkCenterItem,
  type FgaWorkCenterResponse,
  type FetchFgaWorkCentersParams,
} from '../Postgre/fetchFgaWorkCenters'

export {
  fetchDefectsReason,
  type DefectReasonItem,
  type DefectReasonMeta,
  type DefectReasonResponse,
  type FetchDefectReasonParams,
} from '../Postgre/fetchDefectsReason'


export {
  fetchStyles,
  type StyleItem,
  type StylesResponse,
  type FetchStylesParams,
} from '../Postgre/fetchStyles'

export {
  fetchSizes,
  type SizeItem,
  type SizesResponse,
  type FetchSizesParams,
} from '../Postgre/fetchSizes'

export {
  fetchMaterialResolve,
  type FetchMaterialResolveParams,
  type MaterialResolveData,
  type MaterialResolveResponse,
} from '../Postgre/fetchMaterialResolve'

export {
  fetchMoldCodes,
  type MoldCodeItem,
  type MoldCodesResponse,
  type FetchMoldCodesParams,
} from '../Postgre/fetchMoldCodes'

export {
  fetchMoldSizes,
  type MoldSizeItem,
  type MoldSizesResponse,
  type FetchMoldSizesParams,
} from '../Postgre/fetchMoldSizes'


// HFPA -------------------------------------------

export {
  fetchHFPADefectCode,

  type FetchHFPADefectCodeParams,
} from '../Postgre/fetchHFPADefectCode'


export {
  fetchHFPAMisspackingScan,
  type HfpaMisspackingScanItem,
  type HfpaMisspackingScanResponse,
  type FetchHFPAMisspackingScanParams,
} from '../Postgre/fetchHFPAMisspackingScan'

export {
  saveHFPAInspect,
  type HfpaInspectRequestBody,
  type HfpaInspectResponse,
  type HfpaInspectDefectItem,
} from '../Postgre/saveHFPAInspect'

export {
  fetchHFPADashboard,
  type HfpaDashboardItem,
  type HfpaDashboardResponse,
  type FetchHFPADashboardParams,
} from '../Postgre/fetchHFPADashboard'

// SAP S/4HANA -------------------------------------------

export {
  fetchMoldSerial,
  type FetchMoldSerialParams,
  type MoldSerialData,
  type MoldSerialMeta,
  type MoldSerialResponse,
} from '../sap-s4hana/fetchMoldSerial'

export {
  putScrapSto,
  type PutScrapStoRequestBody,
  type PutScrapStoResponse,
  type ScrapStoInputItem,
  type ScrapStoOutputItem,
  type ScrapStoSapResponse,
  type ScrapStoProcType,
} from '../sap-s4hana/putScrapSto'

// Confirm ----------------------------------------

export {

  fetchReturnPlants,
  fetchReturnWorkCenters,
  fetchReturnLines,
  fetchDefectResults,
  updateConfirm,
  putScrapStoForReturn,

  type Plant,
  type ReturnPlantsResponse,
  type WorkCenter,
  type ReturnWorkCentersResponse,
  type Line,
  type ReturnLinesResponse,
  type DefectResultParams,
  type ReturnDefectResultRow,
  type ReturnDefectResultResponse,
  type DefectItem,
  type ConfirmRequest,
  type ScrapStoInputItem as ReturnScrapStoInputItem,
  type ScrapStoResponse as ReturnScrapStoResponse,
} from '../Postgre/fetchReturnManagement'

export {
  // 함수들
  fetchScrapConfirmPlants,
  fetchScrapConfirmWorkCenters,
  fetchScrapConfirmProcesses,
  fetchScrapConfirmResults,
  saveScrapConfirmData,
  saveReworkData,
  putScrapStoForScrap,

  // 파라미터 타입
  type ScrapResultParams,
  type SaveScrapRequest,
  type ReworkSaveRequest,

  // 데이터 타입
  type Process,
  type ScrapResultRow,
  type ScrapItem,
  type ReworkRecord,
  type ScrapStoInputItem as ScrapStoForScrapInputItem,
  type ScrapStoResponse as ScrapStoForScrapResponse,

  // 응답 타입
  type ScrapConfirmPlantsResponse,
  type ScrapConfirmWorkCentersResponse,
  type ScrapConfirmProcessesResponse,
  type ScrapConfirmResultsResponse,
  type SaveScrapResponse,
  type ReworkSaveResponse,
} from '../Postgre/fetchScrapReworkConfirm'

