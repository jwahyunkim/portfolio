import https from "https"

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
 * 휴일 정보 조회 (OData GET)
 * SP에서 다음 근무일 계산시 사용.
 * 주말 + 공휴일도 고려하여 정확한 근무일 산출.
 */
export async function fetchHolidaytInfo({ dateFrom, dateTo }) {
  // 환경변수 가져오기
  const baseUrl = process.env.SAP_S4HANA_ODATA_BASE_URL;
  const user = process.env.SAP_USER;
  const pass = process.env.SAP_PASSWORD;

  // 디버그 로그 (401 에러 원인 파악)
  console.log("[DEBUG calendarOdataDao] baseUrl:", baseUrl);
  console.log("[DEBUG calendarOdataDao] user:", user);
  console.log("[DEBUG calendarOdataDao] pass:", pass ? "***" : "NOT SET");

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

  // 엔드포인트 구성
  const endpoint = `${baseUrl}/sap/opu/odata/SAP/ZPP_IF_CAL_SRV/HdayInfoSet`;

  // 쿼리 파라미터 구성 (?)
  const qs = new URLSearchParams();
  qs.set("$format", "json"); // JSON 형식 요청
  qs.set("$filter", `Budat ge '${dateFrom}' and Budat le '${dateTo}'`); // OData 필터 (ex: Budat ge '20251201' and Budat le '20251231' )

  const url = `${endpoint}?${qs.toString()}`;

  // SAP 인증 헤더 설정 (Basic Auth)
  const auth = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  console.log("[DEBUG calendarOdataDao] Authorization:", `Basic ${auth.substring(0, 10)}...`);

  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  console.log("[DEBUG calendarOdataDao] Request URL:", url);

  // OData에 요청 진행
  const json = await requestJson(url, { headers, timeoutMs: 10000 })

  // Odata 응답 확인 (SAP OData v2 - 반드시 루트 d 로 시작)
  return json?.d?.results || [];
}

/**
 * 다음 근무일 조회
 * 주말(토, 일) + SAP 공휴일 모두 제외
 * 
 * param : baseDate - 기준 일자 (YYYYMMDD)
 * returns : Promise<string> 다음 근무일 (YYYYMMDD)
 */
export async function fetchNextWorkingDay(baseDate) {
  // 기준일로부터 30일간 휴일 정보 조회 (추후 날짜조정 필요시 조정)
  const dateFrom = baseDate;
  const dateTo = addDays(baseDate, 30);

  const holidays = await fetchHolidaytInfo({ dateFrom, dateTo });

  const holidaySet = new Set(holidays.filter(h => h.HdayInd === "X").map(h => h.Budat));

  // 다음 날부터 순회하여 근무일 찾기
  let nextDate = addDays(baseDate, 1); // 다음 날
  let maxAttempts = 30;

  while (maxAttempts > 0) {
    // 주말 확인용
    const year = parseInt(nextDate.slice(0, 4), 10); 
    const month = parseInt(nextDate.slice(4,6), 10) - 1 ; // JS는 0부터 시작
    const day = parseInt(nextDate.slice(6, 8), 10);
    const dayOfWeek = new Date(year, month, day).getDay(); // 0 : 일 ~ 6: 토
    
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ; // 일요일 혹은 토요일
    const isHoliday = holidaySet.has(nextDate); // SAP 지정 공휴일

    // 주말도 아니고 공휴일도 아니면 근무일 (근무일 계산)
    if (!isWeekend && !isHoliday) {
      return nextDate;
    }

    // 주말이거나 공휴일이면 다음날로.
    nextDate = addDays(nextDate, 1);
    maxAttempts--;
  }

  // 설정된 date to 범위 안에 근무일이 없는 경우 (현재 30일내)
  throw new Error("다음 근무일을 찾을 수 없습니다.")
}

/**
 * 날짜 포맷에 일수 더하는 함수
 */

function addDays(yyyymmdd, days) {
  const year = parseInt(yyyymmdd.slice(0, 4), 10);
  const month = parseInt(yyyymmdd.slice(4,6), 10) - 1 ; // JS는 0부터 시작
  const day = parseInt(yyyymmdd.slice(6, 8), 10);

  const date = new Date(year, month, day);
  date.setDate(date.getDate() + days); // 일수 더하기

  // 형식 YYMMDD로 변환
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, "0");
  const newDay = String(date.getDate()).padStart(2, "0");

  return `${newYear}${newMonth}${newDay}`;
  
}
