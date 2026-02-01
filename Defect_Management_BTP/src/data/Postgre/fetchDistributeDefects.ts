// my-app/src/data/postgre/fetchDistributeDefects.ts
import { API_BASE_URL } from '../../config/api'
export interface DefectLogInput {
  component_code?: string;
  division?: string;
  defect_type?: string;
  defect_decision?: string;
  defect_source?: string;
  defect_check?: string;
  mold_code?: string;
  mold_size?: string;
  mold_set?: string;
  mold_id?: string;
  obs_nu?: string;
  obs_seq_nu?: string;
}

export interface DefectDistributeRequest {
  plant?: string; // 쿼리에서 사용 (없으면 서버에서 envPlant)
  defect_date: string; // YYYYMMDD (백엔드 필수)
  work_center: string;
  line_cd: string;
  material_code: string;
  defect_qty: number;
  defect_form?: string; // 기본값 'BTM_INT'
  machine_cd?: string; // 선택: body 최상위로 전송
  log?: DefectLogInput;
}

export interface DefectAllocation {
  order_number: string;
  applicable_qty: number;
  remain_after: number;
}

export interface DefectLogResult {
  defect_no: string;
  order_number: string;
  defect_qty: number;
}

// 200 정상 성공 응답
export interface DefectDistributeResponse {
  totalRequested: number;
  totalApplied: number;
  allocations: DefectAllocation[];
  logs: DefectLogResult[];
  notAppliedQty?: number;
}

// 409 초과 응답 (실제 반영 없이 시뮬레이션 결과만)
export interface DefectExceededResponse {
  code: "DEFECT_QTY_EXCEEDED";
  message: string;
  totalRequested: number;
  totalCapacity: number;
  notAppliedQty: number;
  allocations: DefectAllocation[];
}

// 프론트에서 사용할 통합 결과 타입
export type DefectDistributeResult =
  | DefectDistributeResponse
  | DefectExceededResponse;

// 내부 타입 가드: 에러 페이로드가 message:string을 갖는지 확인
function hasStringMessage(x: unknown): x is { message: string } {
  return (
    typeof x === "object" &&
    x !== null &&
    "message" in x &&
    typeof (x as { message?: unknown }).message === "string"
  );
}

// 내부 타입 가드: 최소 형태의 DefectDistributeResponse 확인
function isDefectDistributeResponse(x: unknown): x is DefectDistributeResponse {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  const okNumbers =
    typeof o.totalRequested === "number" &&
    typeof o.totalApplied === "number";
  const okArrays =
    Array.isArray(o.allocations) && Array.isArray(o.logs);
  const okOptional =
    o.notAppliedQty === undefined || typeof o.notAppliedQty === "number";
  return okNumbers && okArrays && okOptional;
}

// 409 초과 응답 raw 타입
interface ExceededPayloadRaw {
  code?: unknown;
  message?: unknown;
  totalRequested: number;
  totalCapacity: number;
  notAppliedQty: number;
  allocations: unknown;
}

// 내부 타입 가드: 409 초과 페이로드 형태 확인
function isExceededPayload(x: unknown): x is ExceededPayloadRaw {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.totalRequested !== "number" ||
    typeof o.totalCapacity !== "number" ||
    typeof o.notAppliedQty !== "number" ||
    !("allocations" in o)
  ) {
    return false;
  }
  return Array.isArray(o.allocations);
}

/**
 * 불량 분배 등록 API 호출
 * - 200: DefectDistributeResponse
 * - 409: DefectExceededResponse (실제 반영 없음, 시뮬레이션 결과만)
 */
export async function fetchDistributeDefects(
  req: DefectDistributeRequest
): Promise<DefectDistributeResult> {
  try {
    const query = req.plant ? `?plant=${encodeURIComponent(req.plant)}` : "";
    // const url = `http://localhost:4000/api/postgres/defects/distribute${query}`;
    // const url = `http://203.228.135.28:4000/api/postgres/defects/distribute${query}`;
    // const url = `/api/postgres/defects/distribute${query}`;

    const url = `${API_BASE_URL}/api/postgres/defects/distribute${query}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defect_date: req.defect_date,
        work_center: req.work_center,
        line_cd: req.line_cd,
        material_code: req.material_code,
        defect_qty: req.defect_qty,
        defect_form: req.defect_form,
        machine_cd: req.machine_cd,
        log: req.log ?? {},
      }),
    });

    const json: unknown = await res.json().catch(() => ({} as unknown));

    // 409: 수량 초과 → 초과 응답을 정상 결과로 반환
    if (res.status === 409 && isExceededPayload(json)) {
      const message =
        typeof json.message === "string"
          ? json.message
          : "Defect quantity exceeds available capacity.";

      const exceeded: DefectExceededResponse = {
        code: "DEFECT_QTY_EXCEEDED",
        message,
        totalRequested: json.totalRequested,
        totalCapacity: json.totalCapacity,
        notAppliedQty: json.notAppliedQty,
        allocations: json.allocations as DefectAllocation[],
      };
      return exceeded;
    }

    // 그 외 에러: 예외로 처리
    if (!res.ok) {
      const message = hasStringMessage(json)
        ? json.message
        : "Server error while distributing defects";
      throw new Error(`[${res.status}] ${message}`);
    }

    // 200 정상 응답
    if (!isDefectDistributeResponse(json)) {
      throw new Error("Invalid response shape from server");
    }
    return json;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("fetchDistributeDefects error:", msg);
    throw new Error(msg);
  }
}
