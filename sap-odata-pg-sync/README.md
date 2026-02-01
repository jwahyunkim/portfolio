# SAP ↔︎ PostgreSQL Sync (sap-odata-pg-sync)

간단한 목적: SAP OData와 PostgreSQL 간 **pull/push 동기화**. 잡 단위 구성. 실패 원인까지 **사람이 읽기 쉬운 에러 로그** 제공.

---

## 특징

* **Pull**: SAP OData → PG. `bulk` 전체 교체 또는 `row` 모드(DELETE+INSERT / UPSERT).
* **Push**: PG(PENDING) → SAP OData POST. CSRF 처리, 재시도, 에코 검증.
* **잡 기반 구성**: `jobs/<jobId>/{job.json,mapping.json}`.
* **가독성 로그**: `LOG_FORMAT=human`. 에러 요약 1행 + 정렬된 상세. **row 레벨** 실패는 메시지 옆에 인라인 구분선.
* **안전 실행**: 배치 실패 시 단건 분해. `continue|stop` 제어.

---

## 빠른 시작

```bash
# 환경변수 설정
cp .env.example .env
# 의존 설치
npm i
# 스케줄러 실행(모든 잡 등록 + 즉시 1회 실행)
npm start
# 수동 실행(전체)
npm run sync:once
# 수동 실행(특정 잡)
npm run sync:once job <jobId>
```

---

## 폴더 구조

```
/src
  /clients     odataClient.js, odataWriter.js
  /db          loader.js, reader.js
  /util        config.js, logging.js, transform.js
  jobRunner.js scheduler.js syncAll.js
/jobs
  /<jobId>
    job.json
    mapping.json
```

---

## 핵심 파일

* `clients/odataClient.js` : OData GET, 페이징, 재시도.
* `clients/odataWriter.js`: CSRF 토큰 획득, OData POST.
* `db/loader.js`          : BULK/INSERT/UPSERT. 단건 실패 상세 로그.
* `db/reader.js`          : PENDING 로드, SENT/ERROR 마킹.
* `jobRunner.js`          : 잡 실행 엔진(pull/push).
* `scheduler.js`          : 크론 스케줄링 + 초기 1회 실행.
* `syncAll.js`            : 수동 실행기.
* `util/logging.js`       : 사람용/JSON 로그 포맷터.
* `util/transform.js`     : pull 매핑, 길이·NULL 처리.

---

## 환경 변수(.env)

```ini
# SAP
ODATA_USER=...
ODATA_PASS=...

# PostgreSQL
PGHOST=...
PGPORT=5432
PGDATABASE=...
PGUSER=...
PGPASSWORD=...
PGSSL=false

# Defaults
PAGE_SIZE=5000
BATCH_SIZE=1000
NULL_IF_EMPTY=true

# Logging
LOG_FORMAT=human        # human | json
LOG_STACK_LEN=2000
LOG_RESP_LEN=500
LOG_SQL_LEN=200
LOG_INLINE_SEP_WIDTH=25
LOG_INLINE_SEP_CHAR=-
```

---

## 잡 설정 (`jobs/<id>/job.json`)

```json
{
  "id": "bcard_blend_info",
  "mode": "push",                       // pull | push
  "odataUrl": "https://.../ZQM_I_..._HEADER",
  "schedule": "*/30 * * * * *",         // node-cron
  "pageSize": 5000,
  "nullIfEmpty": true,

  "source": {                           // push 전용
    "schema": "mes",
    "table": "dmpd_bcard_blend_info",
    "pk": ["plant_cd","batch_no","blend_date","mcs_no","mat_col","mat_lot_s","mat_lot_l","order_number","sfc_cd"],
    "batchSize": 1,                     // failMode=continue면 내부적으로 단건 처리
    "failMode": "continue",             // continue | stop
    "sql": "SELECT ... FROM mes.dmpd_bcard_blend_info WHERE status='PENDING' ORDER BY blend_date, blend_time NULLS FIRST"
  },

  "target": {                           // pull 전용
    "schema": "mes",
    "table": "dmpd_slab_test_result",
    "batchSize": 1000
  },

  "pull": {                             // pull 세부
    "mode": "bulk",                     // bulk | row
    "deleteMode": "delete",             // row 모드: delete | update(UPSERT)
    "deleteFirst": true,
    "row": { "batchSize": 1, "onError": "continue" }
  },

  "sapSuccess": {                       // push 성공 판정
    "echoKeys": ["werks"],              // 응답 JSON의 키와 소스 값 비교
    "requireAll": true,
    "checkMessages": true               // SAP__Messages 에러 검사
  }
}
```

---

## 매핑 설정

### Pull 매핑 (`mapping.json`)

```json
{
  "columns": ["plant_cd","bcard_key","op_cd","zone_cd","work_center","tc10","tc90","results","sfc_cd","bcard_level","bcard_type","er"],
  "length": { "plant_cd":4, "bcard_key":20, "op_cd":10, "zone_cd":8, "work_center":10, "results":1, "sfc_cd":20, "bcard_level":2, "bcard_type":3, "er":10 },
  "rename": { "werks": "plant_cd", "lot_no": "bcard_key", "op_cd": "op_cd", "ex2h": "er" }
}
```

### Push 매핑 예시 (`mapping.json`)

```json
{
  "header": { "werks": "plant_cd" },               // 옵션
  "headerLength": { "werks": 4 },

  "item": {
    "key": "_item",                                 // 배열 키. 기본 "_item"
    "fields": {                                     // 본문 필드 매핑
      "werks": "plant_cd",
      "sfc_cd": "sfc_cd",
      "bcard_qty": "bcard_qty",
      "work_date": "blend_date",
      "work_time": "blend_time"
    },

    "numberFields": ["bcard_qty"],                  // 숫자 변환(null on NaN)
    "dateRules": { "work_date": "YYYYMMDD->YYYY-MM-DD" },
    "timeRules": { "work_time": "timestamptz->HH:mm:ss" },

    "length": { "mcs_name": 40 },                   // 문자열 자르기
    "nullPolicy": "empty",                          // empty|null|pass
    "fieldNullPolicy": { "work_time": "null" }      // 필드별 정책 우선
  }
}
```

---

## 상태 컬럼 규칙(푸시 소스 테이블)

* 필수 컬럼: `status`(PENDING|SENT), `sent_at`(nullable timestamp), `last_error`(text).
* 성공 시: `status='SENT'`, `sent_at=NOW()`, `last_error=NULL`.
* 실패 시: `last_error`에 원인 기록. `status`는 PENDING 유지.

---

## 실행 흐름

### Pull

1. OData GET(페이징) → `transform.mapRow()`로 매핑.
2. `bulk`: `DELETE` 후 대량 `INSERT`.
3. `row`:

   * `delete`: 선삭제 후 `INSERT`(배치→단건 폴백).
   * `update`: `UPSERT`(변경된 컬럼만 UPDATE).
4. 결과 로그: 총건수·성공/실패 카운트.

### Push

1. `readPending(sql)`로 대상 로드.
2. CSRF 토큰 획득 후 POST.
3. 성공 판정: HTTP 2xx AND `sapSuccess`(echoKeys, SAP__Messages) 통과.
4. `markSent` 또는 `markError`.

---

## 로깅

* 기본: `LOG_FORMAT=human`.
* 에러 출력 형식:

  ```
  2025-10-29T01:28:30.597Z ERROR Row upsert failed -------------------------
    message      : duplicate key value violates unique constraint ...
    code         : 23505
    schema.table : mes.dmpd_...
    constraint   : dmpd_..._pkey
    sqlFrag      : INSERT INTO ... [truncated]
    stack        : Error: ...
      at ...
  ```
* **row 레벨 실패**만 인라인 구분선 적용(`-` × `LOG_INLINE_SEP_WIDTH`).
* JSON 모드 필요 시 `LOG_FORMAT=json`.

---

## 재시도·타임아웃

* OData GET: 지수 백오프 재시도(`odataClient.js`).
* CSRF/POST: 타임아웃 30s. 실패 시 상세 본문 500자 스니펫 기록.

---

## 요구사항

* Node.js 18+
* PostgreSQL 12+
* 네트워크: SAP OData 엔드포인트에 접근 가능해야 함.

---

## 트러블슈팅

* `row_fail>0`: 콘솔에서 해당 **Row insert/upsert failed** 블록 확인. `code/detail/constraint/sqlFrag`로 원인 파악.
* SAP 응답 검증 실패: 로그의 `SAP_ECHO_FAIL` 이유와 `expected`/`got` 비교.
* CSRF 문제: `OData CSRF fetch failed` 또는 `Missing CSRF token` 확인.
* 스키마 오류: `PK not found` → 대상 테이블 PK 생성 필요.

---

## 라이선스

사내 전용. 외부 배포 금지.


## GET에서 필터 적용 예시
```json
  "filterWindow": {
    "lookback": { "days": 0, "hours": 12 },          // 예: 12시간 전부터
    "pairs": [
      //erdatlo,ertimlo,aedatlo,aetimlo는  소스의 필드값 임
      { "date": "erdatlo", "time": "ertimlo" },      // 생성 일시
      { "date": "aedatlo", "time": "aetimlo" }       // 변경 일시
    ],
    "combine": "or",                                  // or | created_only | changed_only
    "timezone": "Asia/Seoul",                         // 생략 시 시스템 로컬
    "inclusive": true                                 // 경계 포함(>=, <=)
  }
```

## 타임존
한국(서울): Asia/Seoul
베트남(호치민): Asia/Ho_Chi_Minh
인도네시아-서부(자카르타): Asia/Jakarta
인도네시아-중부(마카사르): Asia/Makassar
인도네시아-동부(자야푸라): Asia/Jayapura

## 모드 요약

| pull.mode | deleteMode 위치       | deleteMode 값 | 동작 요약                        |
| --------- | ------------------- | ------------ | ---------------------------- |
| `bulk`    | `target.deleteMode` | DELETE       | 전체 삭제 후 INSERT               |
| `bulk`    | `target.deleteMode` | TRUNCATE     | TRUNCATE 후 INSERT            |
| `bulk`    | `target.deleteMode` | NONE         | 기존 유지, 단순 INSERT             |
| `row`     | `pull.deleteMode`   | update       | UPSERT (기존 갱신, 신규 삽입)        |
| `row`     | `pull.deleteMode`   | delete       | PK 기준 삭제 후 삽입                |
| `row`     | `pull.deleteMode`   | replace      | 전체 삭제 후 삽입 (bulk 유사, 사용 비권장) |


jobRunner Push Mapping 정책 정리
1. 목적

SAP OData 전송 시

null / "" / 0 처리 오류 방지

헤더와 아이템을 서로 다른 정책으로 처리

코드 일관성 유지

2. 기본 개념
데이터 구조

Header (헤더)

Item (아이템, _item 배열)

→ 헤더와 아이템은 정책을 분리해서 설정 가능

3. Null 정책 종류
값	의미
empty	빈 문자열 ""
null	JSON null
zero	숫자 0
4. 설정 키 정리
(1) 공통 설정 (헤더 + 아이템 공통)
{
  "nullPolicy": "empty",
  "fieldNullPolicy": { ... },
  "numberFields": [ ... ],
  "dateRules": { ... },
  "timeRules": { ... },
  "length": { ... }
}

(2) 헤더 전용 설정
{
  "headerNullPolicy": "null",
  "headerFieldNullPolicy": { ... },
  "headerNumberFields": [ ... ],
  "headerDateRules": { ... },
  "headerTimeRules": { ... },
  "headerLength": { ... }
}

(3) 아이템 전용 설정
{
  "itemNullPolicy": "zero",
  "itemFieldNullPolicy": { ... },
  "itemNumberFields": [ ... ],
  "itemDateRules": { ... },
  "itemTimeRules": { ... },
  "itemLength": { ... }
}

5. 우선순위 규칙 (중요)

항상 아래 순서로 적용됨

전용(header/item)
  ↓
job 설정
  ↓
공통(mapping)

예시
{
  "nullPolicy": "empty",
  "headerNullPolicy": "null"
}


헤더 → null

아이템 → empty

6. 숫자 필드 처리 규칙

numberFields / headerNumberFields / itemNumberFields에 포함된 필드

동작:

"" → null

"123" → 123

"abc" → null

숫자 필드는 빈 문자열 전송 금지

7. 날짜 / 시간 규칙
날짜

YYYYMMDD -> YYYY-MM-DD

timestamptz -> YYYY-MM-DD

형식 불일치 시 → null

시간

HHmmss -> HH:mm:ss

timestamptz -> HH:mm:ss

형식 불일치 시 → null

8. SAP 오류 방지 포인트

숫자 필드에 "" 전송 ❌

날짜 필드에 07-30 같은 값 ❌

정책 우선순위 꼬임 ❌

→ 이번 구조로 모두 방지

9. 추천 사용 방식 (단순)

mapping 파일에서만 설정

job 설정은 특별한 경우에만 사용

항상:

headerNullPolicy

itemNullPolicy

numberFields 명시

10. 요약 한 줄

헤더/아이템 전용 정책을 최우선으로 적용하고, 숫자·null·날짜를 일관되게 처리하는 구조

원하면 다음도 만들어줄 수 있다:

예제 mapping.json

SAP 오류 사례별 대응 표

운영 가이드(“이럴 땐 이렇게 설정”)