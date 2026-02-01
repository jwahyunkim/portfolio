// src/renderer/api/http.ts
type AnyObj = Record<string, any>;

export type LocalApiConfig = {
  host: string;
  port: number;
  baseUrl: string;
};

function asStr(v: unknown): string {
  return (v ?? "").toString().trim();
}

function asPort(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}




function parseBaseUrlFromEnv(): LocalApiConfig {
  const raw = asStr(import.meta.env.VITE_LOCAL_API_BASE_URL);

  if (!raw) {
    throw new Error(
      "브라우저 환경에서 로컬 API Base URL이 없습니다: VITE_LOCAL_API_BASE_URL\n- 예) VITE_LOCAL_API_BASE_URL=http://127.0.0.1:4000",
    );
  }

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(
      `VITE_LOCAL_API_BASE_URL 형식이 올바르지 않습니다: ${raw}\n- 예) http://127.0.0.1:4000`,
    );
  }

  const host = asStr(u.hostname);
  const port = asPort(u.port);

  if (!host) {
    throw new Error(
      `VITE_LOCAL_API_BASE_URL에 host가 없습니다: ${raw}\n- 예) http://127.0.0.1:4000`,
    );
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(
      `VITE_LOCAL_API_BASE_URL에 port가 없습니다: ${raw}\n- 예) http://127.0.0.1:4000`,
    );
  }

  const baseUrl = `${u.protocol}//${host}:${port}`;
  return { host, port, baseUrl };
}

export async function getLocalApiConfig(): Promise<LocalApiConfig> {
  return parseBaseUrlFromEnv();
}

export type FetchJsonOptions = RequestInit & {
  timeoutMs?: number;
};

export async function fetchJson<T>(path: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { baseUrl } = await getLocalApiConfig();

  const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const controller = new AbortController();
  const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 15000;
  const t = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers ?? {}),
      },
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg =
        asStr(json?.error) ||
        asStr(json?.message) ||
        `HTTP ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    if (json && json.ok === false) {
      const msg = asStr(json.error) || "요청 실패";
      throw new Error(msg);
    }

    return json as T;
  } finally {
    window.clearTimeout(t);
  }
}


