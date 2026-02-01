// src/renderer/utils/api.ts
import axios, { AxiosInstance } from "axios";

let _axios: AxiosInstance | null = null;
let _baseUrl: string | null = null;

/**
 * MSSQL용 axios 인스턴스
 * - Config.xml 의 SERVICE.LOCAL_HOST / LOCAL_PORT 기반
 * - 값이 없으면 기본값 강제 X, 에러 그대로 throw
 */
export async function getAxios(): Promise<AxiosInstance> {
  // 캐시 재사용
  if (_axios) {
    console.log("[mssqlAxios] reuse axios instance:", _baseUrl);
    return _axios;
  }

  // 1) Config 읽기
  const cfg = await (window as any).config?.get?.();
  console.log("[mssqlAxios] loaded config (raw):", cfg);
  try {
    console.log(
      "[mssqlAxios] loaded config (json):",
      JSON.stringify(cfg, null, 2)
    );
  } catch {}

  // 2) SERVICE 후보 수집
  const candidates: any[] = [];
  if (cfg?.SETTING?.SERVICE) candidates.push(cfg.SETTING.SERVICE);
  if (cfg?.SETTING?.service) candidates.push(cfg.SETTING.service);
  if (cfg?.SERVICE) candidates.push(cfg.SERVICE);
  if (cfg?.service) candidates.push(cfg.service);

  const merged: any = {};
  for (const c of candidates) {
    if (c && typeof c === "object") {
      Object.assign(merged, c);
    }
  }

  console.log("[mssqlAxios] merged SERVICE:", merged);

  // 3) LOCAL_HOST / LOCAL_PORT 만 사용 (기본값 강제 X)
  const hostRaw =
    merged.LOCAL_HOST ??
    merged.localHost ??
    merged.local_host ??
    null;

  const portRaw =
    merged.LOCAL_PORT ??
    merged.localPort ??
    merged.local_port ??
    null;

  if (!hostRaw || !portRaw) {
    console.error(
      "[mssqlAxios] SERVICE.LOCAL_HOST / LOCAL_PORT 설정이 없습니다. MSSQL API baseURL 계산 불가.",
      { hostRaw, portRaw }
    );
    throw new Error(
      "MSSQL SERVICE(localHost/localPort) not configured in Config.xml"
    );
  }

  const host = String(hostRaw).trim();
  const port = String(portRaw).trim();

  if (!host || !port) {
    console.error(
      "[mssqlAxios] SERVICE.LOCAL_HOST / LOCAL_PORT 값이 비어 있습니다.",
      { host, port }
    );
    throw new Error("MSSQL SERVICE(localHost/localPort) is empty");
  }

  // 4) axios 인스턴스 생성
  _baseUrl = `http://${host}:${port}`.replace(/\/+$/, "");
  console.log("[mssqlAxios] creating axios instance with baseURL =", _baseUrl);

  _axios = axios.create({
    baseURL: _baseUrl,
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
  });

  return _axios;
}

/** 필요시 강제 리셋 (포트 바뀌는 등) */
export function resetMssqlAxios() {
  console.log("[mssqlAxios] resetMssqlAxios() → clear cache");
  _axios = null;
  _baseUrl = null;
}
