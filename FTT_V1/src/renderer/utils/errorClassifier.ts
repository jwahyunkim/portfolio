import axios from "axios";

export function classifyAxiosError(error: unknown, source: "PG" | "MSSQL" | "API"): string {
  if (!axios.isAxiosError(error)) {
    return `[UNKNOWN/${source}] ${String(error)}`;
  }

  const code = (error.code || "").toUpperCase();
  const msg = (error.message || "").toLowerCase();

  // 1) 명확한 네트워크/소켓 오류
  if (code === "ECONNREFUSED") {
    return `[NETWORK/${source}] CONNECTION_REFUSED (service down or port closed)`;
  }
  if (code === "ECONNRESET") {
    return `[NETWORK/${source}] CONNECTION_RESET (server reset connection)`;
  }
  if (code === "ETIMEDOUT") {
    return `[NETWORK/${source}] TIMEOUT (server not responding)`;
  }
  if (code === "ENOTFOUND") {
    return `[NETWORK/${source}] HOST_NOT_FOUND (DNS failure)`;
  }
  if (code === "EAI_AGAIN") {
    return `[NETWORK/${source}] DNS_LOOKUP_TIMEOUT`;
  }

  // 2) 메시지 기반 분류
  if (msg.includes("network error")) {
    return `[NETWORK/${source}] NETWORK_ERROR`;
  }
  if (msg.includes("timeout")) {
    return `[NETWORK/${source}] REQUEST_TIMEOUT`;
  }
  if (msg.includes("socket hang up")) {
    return `[NETWORK/${source}] SOCKET_HANGUP`;
  }

  // 3) HTTP 응답이 있는 경우
  if (error.response) {
    const status = error.response.status;
    const kind = status >= 500 ? "SERVER" : "CLIENT";

    let snippet = "";
    try {
      const data = error.response.data;
      snippet = typeof data === "string"
        ? data.slice(0, 500)
        : JSON.stringify(data).slice(0, 500);
    } catch {
      snippet = "[response data serialize error]";
    }

    return `[${kind}/${source}] ${status} ${snippet}`;
  }

  // 4) 요청 나갔지만 응답 없음
  if (error.request) {
    if (msg.includes("internet_disconnected")) {
      return `[NETWORK/${source}] INTERNET_DISCONNECTED`;
    }
    return `[NETWORK/${source}] NO_RESPONSE (service down or blocked)`;
  }

  // 5) 기타
  return `[UNKNOWN/${source}] ${error.message}`;
}
