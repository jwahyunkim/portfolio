// src/renderer/api/index.ts
export { oracleApi } from "./oracleApi";
export type {
  CommonParams,
  PlantRow,
  WorkCenterRow,
  LineRow,
  DefectItemRow,
  StyleItemRow,
  SizeItemRow,
  FttStatusRow,
  OracleRowsResponse,

  // ✅ list 전용 타입
  OracleRowsResponseP,
  WorkCenterListParams,
  LineListParams,

  // ✅ FTT Template V1
  OracleRowsResponseWithOut,
  FttTemplateV1Params,
  FttTemplateV1Out,
  FttTemplateV1Row,
} from "./oracleApi";

export { fetchJson, getLocalApiConfig } from "./http";
export type { LocalApiConfig, FetchJsonOptions } from "./http";
