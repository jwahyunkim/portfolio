// C:\Changshin\test\electron-app_final\src\renderer\utils\mesAxios.ts
import axios from "axios";

/**
 * MesPopApi(4001) 전용 axios 인스턴스
 * - 항상 Config에서 SERVICE / service / SETTING.SERVICE를 읽어서 사용
 * - ENV나 하드코딩으로 고정하지 않음
 */
export async function getMesAxios() {
  try {
    const cfg = await (window as any).config?.get?.();

    // console.log("[mesAxios] loaded config (raw):", cfg);
    // try {
    //   console.log("[mesAxios] loaded config (json):", JSON.stringify(cfg, null, 2));
    // } catch {}

    // 🔹 SERVICE 후보들을 모아서 한 번에 머지
    //   - cfg.service  (소문자, typed loader 쪽)
    //   - cfg.SERVICE  (대문자, main loader 쪽)
    //   - cfg.SETTING.SERVICE / service
    const candidates: any[] = [];

    if (cfg?.service) candidates.push(cfg.service);
    if (cfg?.SERVICE) candidates.push(cfg.SERVICE);
    if (cfg?.SETTING?.SERVICE) candidates.push(cfg.SETTING.SERVICE);
    if (cfg?.SETTING?.service) candidates.push(cfg.SETTING.service);

    const merged: any = {};
    for (const c of candidates) {
      if (c && typeof c === "object") {
        Object.assign(merged, c);
      }
    }

    // 🔹 최종적으로 host/port/API_KEY 뽑기
    const hostRaw = merged.HOST ?? merged.host;
    const portRaw = merged.PORT ?? merged.port;
    const apiKey = merged.API_KEY ?? merged.apiKey;

    const host = (hostRaw != null && String(hostRaw).trim() !== "")
      ? String(hostRaw).trim()
      : "127.0.0.1";

    const port = (portRaw != null && String(portRaw).trim() !== "")
      ? String(portRaw).trim()
      : "4001";

    console.log("[mesAxios] resolved SERVICE(merged):", { host, port, apiKey });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["x-api-key"] = String(apiKey);

    const baseURL = `http://${host}:${port}`.replace(/\/+$/, "");
    const instance = axios.create({ baseURL, headers });

    console.log("[mesAxios] axios instance created:", baseURL);
    return instance;
  } catch (err) {
    console.error("[mesAxios] config read failed, fallback to localhost", err);
    return axios.create({
      baseURL: "http://127.0.0.1:4001",
      headers: { "Content-Type": "application/json" },
    });
  }
}
