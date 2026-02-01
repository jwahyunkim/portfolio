[클라이언트]
     ↓ 요청
[server.js] ─ 서버 실행·라우터 등록
     ↓
[routes] ─ 경로 분기
     ↓
[controllers] ─ 요청 처리
     ↓
[services] ─ DB 쿼리 실행
     ↓
[config] ─ DB 설정 제공
     ↓
[DB] ─ 데이터 응답


 <!-- 불량 등록 로직 -->

 [프론트 Defect_POPUP.tsx]
   │  (fetchDistributeDefects 호출, POST /api/postgres/defects/distribute)
   ▼
[src/server.js]
   │  app.use("/api/postgres", postgresRoutes)
   ▼
[src/routes/postgres/index.js]
   │  router.post("/defects/distribute", defectsController.distribute)
   ▼
[src/controllers/postgres/defectsController.js]
   │  - plant 추출
   │  - validateDistributeBody로 요청 검증
   │  - defectsService.distribute 호출
   ▼
[src/services/postgres/defectsService.js]
   │  - pool.connect() 로 트랜잭션 시작
   │  - SET LOCAL statement_timeout
   │  - simulateAllocations(...) 로 “총 잔여/가상배분” 계산
   │     ▼
   │     [src/models/postgres/defectsDao.js.getCandidates]
   │       - mes.dmpd_prod_order_detail_detail 에서 후보 오더 조회
   │
   │  - capacity < 요청 → ROLLBACK 후 EXCEEDED 리턴
   │  - capacity ≥ 요청 → applyAllocations(...) 로 실제 반영
   │     ▼
   │     [src/models/postgres/defectsDao.js.applyDefectToOrder]
   │       - mes.dmpd_prod_order_detail_detail.dcf_defect_qty UPDATE
   │     [src/models/postgres/defectsDao.js.getOrderForUpdateCalc]
   │       - 경합 시 최신 잔여 재계산
   │     [src/utils/time.js.todayYYYYMMDD / nowSeoul]
   │       - 한국 시간 기준 오늘 날짜 계산
   │     [src/models/postgres/defectsDao.js.getTodayMaxSeq]
   │       - quality.dmqm_defect_result 의 오늘 최대 defect_no 조회
   │     [src/utils/defectNo.js.buildDefectNo]
   │       - YYYYMMDD + 4자리 시퀀스로 defect_no 생성
   │     [src/models/postgres/defectsDao.js.insertDefectLog]
   │       - quality.dmqm_defect_result INSERT
   │
   │  - COMMIT 후 {status, totalRequested, totalApplied, allocations, logs} 리턴
   ▼
[src/controllers/postgres/defectsController.js]
   │  - status에 따라
   │    - EXCEEDED → 409 + { code, message, totalRequested, totalCapacity, notAppliedQty, allocations }
   │    - OK       → 200 + { totalRequested, totalApplied, allocations, logs }
   ▼
[프론트 fetchDistributeDefects.ts]
   │  - 응답 JSON 파싱, 타입가드로 검사
   ▼
[Defect_POPUP.tsx]
   - 콘솔 로그/향후 UI 표시
   
파일별 한 줄 요약

src/server.js
     Express 서버 생성, /api/postgres 라우터 연결, DB 풀 생성/헬스체크
src/routes/postgres/index.js
     Postgres 관련 URL → 컨트롤러 매핑 (/defects/distribute 등)
src/controllers/postgres/defectsController.js
     HTTP 요청 파싱/검증 → 서비스 호출 → HTTP 응답 형식 결정
src/services/postgres/defectsService.js
     트랜잭션 단위 비즈니스 로직(분배 시뮬/실제 UPDATE+INSERT) 처리
src/models/postgres/defectsDao.js
     실제 SQL 실행부 (SELECT/UPDATE/INSERT)
src/utils/time.js
     Asia/Seoul 기준 현재시각/오늘 날짜 계산
src/utils/defectNo.js
     defect_no 포맷(YYYYMMDD + 4자리) 생성
src/validators/defectsSchema.js
     요청 바디(work_center, line_cd, material_code, defect_qty, defect_form, log) 검증
my-app/src/data/postgre/fetchDistributeDefects.ts
     프론트에서 /api/postgres/defects/distribute 호출하는 fetch 유틸
src/pages/Defect_POPUP.tsx
     화면 POPUP, 입력값 상태 관리 후 fetchDistributeDefects 호출하는 UI 컴포넌트
