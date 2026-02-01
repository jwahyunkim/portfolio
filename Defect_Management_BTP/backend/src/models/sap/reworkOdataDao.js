import https from "https";

// Odata 헬퍼 함수
function requestJson(urlStr, {method = "GET", headers = {}, body = null, timeoutMs = 15000} = {} ) {
  return new Promise((resolve, reject) => {
    let req;
    try {
        // URL 파싱
        const url = new URL(urlStr);

        // req 옵션 설정
        const options = {
          protocol: url.protocol, // https:
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method,
          headers,
          rejectUnauthorized: false  // SAP 자체 서명 인증서 허용
        }

        // Https 요청 생성
        req = https.request(options, (res) => {
          // 응답 데이터 배열에 저장
          const chunks = [];
          res.on("data", (d) => chunks.push(d));

          // 응답 완료
          res.on("end", () => {
            // 배열 병합 후 문자열로 병합
            const bodyText = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode

            // 상태 코드 검증
            if (status < 200 || status >= 300) {
              return reject(new Error(`OData HTTP ${status}: ${bodyText?.slice(0,500)}`));
            }

            // 데이터 JSON으로 파싱
            try {
              const json = JSON.parse(bodyText);
              resolve(json);
            } catch (e) {
              reject(new Error(`OData JSON parse error: ${String(e.message || e)}`));
            }
          });
        });

        req.on("error", (e) => reject(e));

        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error("OData request timeout"));
        });

        // req body 전송 (POST)
        if (body) {
          req.write(body);
        }

        // req 전송
        req.end();
    } catch (e) {
      if (req) req.destroy();
      reject(e);
    }
  });
}

/**
 * SAP Rework Order 생성 (POST)
 * SP (quality.sp_dmqm_defect_rework_save) 를 통해 생성한 정보 SAP 으로 전송
 * SAP 에서 실제 Rework Order 생성.
 * SAP 응답 받은 이후 실제 DB에 반영 (quality.dmqm_defect_rework)
 */
export async function createReworkOrders(reworkInfoSet) {
  // 환경 변수 로드
  const baseUrl = process.env.SAP_S4HANA_ODATA_BASE_URL
  const user = process.env.SAP_USER;
  const pass = process.env.SAP_PASSWORD;

  // 환경변수 검증
  if (!baseUrl) {
    throw new Error("환경변수 없음: SAP_S4HANA_ODATA_BASE_URL");
  }
  if (!user) {
    throw new Error("환경변수 없음 : SAP_USER")
  }
  if (!pass) {
    throw new Error("환경변수 없음 : SAP_PASSWORD")
  }

  // OData 엔드포인트 구성
  // POST 요청은 쿼리 파라미터를 URL에 포함하지 않음 (SAP OData v2 규칙)
  const endpoint = `${baseUrl}/sap/opu/odata/SAP/ZPP_IF_REWORK_SRV/HeadSet`;

  // CSRF Token 획득용 URL
  const tokenUrl = endpoint;

  // ===== CSRF Token 획득 (POST 요청 전 필수) =====
  console.log("[createReworkOrders] Fetching CSRF token...");
  const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");

  const { csrfToken, cookies } = await fetchCsrfToken(tokenUrl, auth);
  console.log("[createReworkOrders] CSRF token acquired, cookies:", cookies ? "present" : "none");

  // Req Body 구성
  const requestBody = {
    ReworkInfoSet: reworkInfoSet.map(item => ({
      Rwreq: item.Rwreq || "", // Rework NO
      Werks: item.Werks || "", // Plant
      Oaufnr: item.Oaufnr || "", // 이전 PO ID
      Apsid: item.Apsid || "", // 이전 APS ID
      Naufnr: item.Naufnr || "", // 다음 PO ID
      Zdpeg: item.Zdpeg || "", // 다음 APS ID
      Menge: String(item.Menge || 0), // 수량
      Meins: item.Meins || "PR", // 단위
      Psttr: item.Psttr || "", // 시작일자
      Pedtr: item.Pedtr || "", // 종료일자
      Gsuzs: item.Gsuzs || "", // 시작시간
      Gluzs: item.Gluzs || "", // 종료시간
      Raufnr: "", 
      Type: "",
      Message: "",
    })),
  };
  // 직렬화 
  const bodyStr = JSON.stringify(requestBody)

  // 헤더 구성 (CSRF Token + Cookie 포함)
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Content-Length": Buffer.byteLength(bodyStr),
    "x-csrf-token": csrfToken,  // ✨ CSRF Token
  };

  // Cookie가 있으면 추가
  if (cookies) {
    headers.Cookie = cookies;
  }

  // Odata Post 요청 (쿼리 파라미터 없이)
  const json = await requestJson(endpoint, {  // url이 아닌 endpoint 사용!
    method: "POST",
    headers,
    body: bodyStr,
    timeoutMs: 30000,
  });

  // SAP 응답 디버그
  console.log("[createReworkOrders] SAP 응답:", JSON.stringify(json, null, 2));

  // SAP 응답 파싱 - 응답형식 3가지 사용
  // 1. json.ReworkInfoSet (직접 배열)
  // 2. json.d.ReworkInfoSet.results (OData v2 중첩 형식) ← 실제 SAP 응답
  // 3. json.d.results (OData v2 직접 형식)
  const results = json?.ReworkInfoSet || json?.d?.ReworkInfoSet?.results || json?.d?.results || [];

  console.log("[createReworkOrders] 파싱된 results:", results);

  if (!Array.isArray(results)) {
    throw new Error("SAP 응답 형식이 올바르지 않습니다");
  }

  return results;

}

/**
 * CSRF Token + Cookie 획득
 * SAP OData v2는 POST/PUT/DELETE 요청 전 CSRF Token과 Session Cookie 필요
 */
async function fetchCsrfToken(url, auth) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      const urlObj = new URL(url);

      const options = {
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: `${urlObj.pathname}${urlObj.search}`,
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`,
          "x-csrf-token": "fetch",  // Token 요청
          Accept: "application/json",
        },
        rejectUnauthorized: false,
      };

      req = https.request(options, (res) => {
        const csrfToken = res.headers["x-csrf-token"];

        if (!csrfToken) {
          return reject(new Error("CSRF token not found in response headers"));
        }

        // Set-Cookie 헤더 추출 (SAP 세션 유지용)
        const setCookieHeaders = res.headers["set-cookie"];
        let cookies = null;

        if (setCookieHeaders && Array.isArray(setCookieHeaders)) {
          // 여러 개의 Cookie를 하나의 문자열로 합침
          cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
        } else if (setCookieHeaders) {
          cookies = setCookieHeaders.split(';')[0];
        }

        // 응답 body는 무시 (token만 필요)
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ csrfToken, cookies });
        });
      });

      req.on("error", (e) => reject(e));
      req.setTimeout(10000, () => {
        req.destroy(new Error("CSRF token fetch timeout"));
      });

      req.end();
    } catch (e) {
      if (req) req.destroy();
      reject(e);
    }
  });
}