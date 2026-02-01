// src/renderer/api/oracleApi.ts
import { fetchJson } from "./http";

export type CommonParams = {
  plant_cd: string;
  wc_cd: string;
  line_cd: string;
};

export type PlantRow = {
  PLANT_CD: string;
  PLANT_NM: string;
};

export type WorkCenterRow = {
  PLANT_CD: string;
  WC_CD: string;
  WC_NM: string;
};

export type LineRow = {
  PLANT_CD: string;
  WC_CD: string;
  LINE_CD: string;
  LINE_NM: string;
};

export type DefectItemRow = {
  value: string;
  label: string;
  ftt: number;
  hfpa: number;
};

export type StyleItemRow = {
  value: string;
  label: string;
};

export type SizeItemRow = {
  value: string;
  label: string;
};

export type FttStatusRow = {
  PLANT_NM: string | null;
  LINE_NM: string | number | null;
  PROD_QTY: number | null;
  DEFECT_QTY: number | null;
  REWORK_QTY: number | null;
  BC_QTY: number | null;
  MULTI_REWORK_QTY: number | null;
  "1ST_REWORK_QTY": number | null;
  FTT_RATE: number | null;
  REWORK_RATE: number | null;
  DPU: number | null;
  DPMO: number | null;
  REJECT_RATE: number | null;
  REWORK_EFFECTIVENESS: number | null;
};

export type OracleRowsResponse<T> = {
  ok: boolean;
  params?: CommonParams;
  rows?: T[];
  error?: string;
  configPath?: string | null;
};

// ✅ 리스트용 응답 타입 (params 형태가 CommonParams가 아닐 때 사용)
export type OracleRowsResponseP<P, T> = {
  ok: boolean;
  params?: P;
  rows?: T[];
  error?: string;
  configPath?: string | null;
};

// ✅ out 포함 응답 타입 (params 형태가 CommonParams가 아닐 때 + out 포함)
export type OracleRowsResponseWithOut<P, T, O> = {
  ok: boolean;
  params?: P;
  rows?: T[];
  out?: O;
  error?: string;
  configPath?: string | null;
};

// ✅ 리스트 API params 타입
export type WorkCenterListParams = { plant_cd: string };
export type LineListParams = { plant_cd: string; wc_cd: string };

/**
 * ✅ [FTT Template V1]
 * - GET /api/oracle/ftt-template-v1?from_date=YYYYMMDD&to_date=YYYYMMDD&wc_cd=...&line_cd=...&plant_cd=...
 *
 * - Query 파라미터
 *   - from_date (필수)
 *   - to_date   (필수)
 *   - wc_cd     (옵션)
 *   - line_cd   (옵션)
 *   - plant_cd  (옵션) : 있으면 V_PLANT_CD로 전달, 없으면 NULL 전달
 */
export type FttTemplateV1Params = {
  from_date: string;
  to_date: string;
  wc_cd?: string | null;
  line_cd?: string | null;
  plant_cd?: string | null;
};

export type FttTemplateV1Out = {
  V_P_ERROR_CODE: string | null;
  V_P_ROW_COUNT: number | null;
  V_P_ERROR_NOTE: string | null;
  V_P_RETURN_STR: string | null;
  V_P_ERROR_STR: string | null;
  V_ERRORSTATE: string | null;
  V_ERRORPROCEDURE: string | null;
};

export type FttTemplateV1Row = Record<string, any>;

/**
 * ✅ [FTT Result Save V1]
 * - POST /api/oracle/ftt-result-save-v1
 *
 * Body(JSON)
 *  - material_cd
 *  - style_cd
 *  - size_cd
 *  - ftt_type
 *  - defect_type  (예: "001" 또는 "001,002,003")
 *  - rework_count
 *  - defect_qty
 *  - creator
 *  - create_pc
 */
export type FttResultSaveV1Body = {
  material_cd: string;
  style_cd: string;
  size_cd: string;
  ftt_type: string;
  defect_type: string; // "001" or "001,002"
  rework_count: number;
  defect_qty: number;
  creator: string;
  create_pc: string;
};

export type FttResultSaveV1Params = CommonParams & {
  material_cd: string;
  style_cd: string;
  size_cd: string;
  ftt_type: string;
  defect_type: string;
  rework_count: number;
  defect_qty: number;
  creator: string;
  create_pc: string;
};

export type FttResultSaveV1Out = {
  V_P_ERROR_CODE: string | null;
  V_P_ROW_COUNT: number | null;
  V_P_ERROR_NOTE: string | null;
  V_P_RETURN_STR: string | null;
  V_P_ERROR_STR: string | null;
  V_ERRORSTATE: string | null;
  V_ERRORPROCEDURE: string | null;
};

export type FttResultSaveV1Response = {
  ok: boolean;
  params?: FttResultSaveV1Params;
  out?: FttResultSaveV1Out;
  error?: string;
  configPath?: string | null;
};

export async function pingOracle(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const r = await fetchJson<{ ok: boolean; error?: string }>("/api/oracle/ping");
    if (r?.ok) return { ok: true };
    return { ok: false, error: r?.error || "Oracle ping 실패" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function getPlants(): Promise<OracleRowsResponse<PlantRow>> {
  return fetchJson<OracleRowsResponse<PlantRow>>("/api/oracle/plants");
}

export async function getWorkCenters(): Promise<OracleRowsResponse<WorkCenterRow>> {
  return fetchJson<OracleRowsResponse<WorkCenterRow>>("/api/oracle/work-centers");
}

export async function getLines(): Promise<OracleRowsResponse<LineRow>> {
  return fetchJson<OracleRowsResponse<LineRow>>("/api/oracle/lines");
}

// ✅ Plant 리스트
export async function getPlantsList(): Promise<OracleRowsResponseP<{}, PlantRow>> {
  return fetchJson<OracleRowsResponseP<{}, PlantRow>>("/api/oracle/plants-list");
}

// ✅ WorkCenter 리스트 (plant_cd 필수)
export async function getWorkCentersList(
  plant_cd: string,
): Promise<OracleRowsResponseP<WorkCenterListParams, WorkCenterRow>> {
  const v = (plant_cd ?? "").toString().trim();
  if (!v) {
    return { ok: false, error: "plant_cd가 필요합니다." };
  }

  const q = encodeURIComponent(v);
  return fetchJson<OracleRowsResponseP<WorkCenterListParams, WorkCenterRow>>(
    `/api/oracle/work-centers-list?plant_cd=${q}`,
  );
}

// ✅ Line 리스트 (plant_cd, wc_cd 필수)
export async function getLinesList(
  plant_cd: string,
  wc_cd: string,
): Promise<OracleRowsResponseP<LineListParams, LineRow>> {
  const p = (plant_cd ?? "").toString().trim();
  const w = (wc_cd ?? "").toString().trim();

  if (!p || !w) {
    return { ok: false, error: "plant_cd, wc_cd가 필요합니다." };
  }

  const qp = encodeURIComponent(p);
  const qw = encodeURIComponent(w);

  return fetchJson<OracleRowsResponseP<LineListParams, LineRow>>(
    `/api/oracle/lines-list?plant_cd=${qp}&wc_cd=${qw}`,
  );
}

export async function getDefects(): Promise<OracleRowsResponse<DefectItemRow>> {
  return fetchJson<OracleRowsResponse<DefectItemRow>>("/api/oracle/defects");
}

export async function getStyles(): Promise<OracleRowsResponse<StyleItemRow>> {
  return fetchJson<OracleRowsResponse<StyleItemRow>>("/api/oracle/styles");
}

export async function getStyleSizes(
  style_cd: string,
): Promise<OracleRowsResponse<SizeItemRow>> {
  const q = encodeURIComponent(String(style_cd ?? ""));
  return fetchJson<OracleRowsResponse<SizeItemRow>>(
    `/api/oracle/style-sizes?style_cd=${q}`,
  );
}

export async function getFttStatus(): Promise<OracleRowsResponse<FttStatusRow>> {
  return fetchJson<OracleRowsResponse<FttStatusRow>>("/api/oracle/ftt-status");
}

// ✅ FTT Template V1
export async function getFttTemplateV1(
  params: FttTemplateV1Params,
): Promise<OracleRowsResponseWithOut<FttTemplateV1Params, FttTemplateV1Row, FttTemplateV1Out>> {
  const from_date = (params?.from_date ?? "").toString().trim();
  const to_date = (params?.to_date ?? "").toString().trim();

  if (!from_date || !to_date) {
    return { ok: false, error: "from_date, to_date가 필요합니다." };
  }

  const wc_cd = (params?.wc_cd ?? "").toString().trim();
  const line_cd = (params?.line_cd ?? "").toString().trim();
  const plant_cd = (params?.plant_cd ?? "").toString().trim();

  const qs: string[] = [];
  qs.push(`from_date=${encodeURIComponent(from_date)}`);
  qs.push(`to_date=${encodeURIComponent(to_date)}`);

  // 옵션: 값 있을 때만 전송 (서버에서 없으면 NULL 처리 가능)
  if (wc_cd) qs.push(`wc_cd=${encodeURIComponent(wc_cd)}`);
  if (line_cd) qs.push(`line_cd=${encodeURIComponent(line_cd)}`);
  if (plant_cd) qs.push(`plant_cd=${encodeURIComponent(plant_cd)}`);

  return fetchJson<
    OracleRowsResponseWithOut<FttTemplateV1Params, FttTemplateV1Row, FttTemplateV1Out>
  >(`/api/oracle/ftt-template-v1?${qs.join("&")}`);
}

// ✅ FTT Result Save V1
export async function saveFttResultV1(
  body: FttResultSaveV1Body,
): Promise<FttResultSaveV1Response> {
  return fetchJson<FttResultSaveV1Response>("/api/oracle/ftt-result-save-v1", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export const oracleApi = {
  pingOracle,
  getPlants,
  getWorkCenters,
  getLines,

  // ✅ list
  getPlantsList,
  getWorkCentersList,
  getLinesList,

  getDefects,
  getStyles,
  getStyleSizes,
  getFttStatus,

  // ✅ ftt-template-v1
  getFttTemplateV1,

  // ✅ ftt-result-save-v1
  saveFttResultV1,
};
