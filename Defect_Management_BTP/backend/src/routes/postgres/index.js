// src/routes/postgres/index.js
import { Router } from 'express';
import healthController from '../../controllers/postgres/healthController.js';
import * as dmpdProdOrderController from '../../controllers/postgres/dmpdProdOrderController.js';
import * as defectsController from '../../controllers/postgres/defectsController.js';
import defectResultController from '../../controllers/postgres/defectResultController.js';
import hfpaDefectCodeController from '../../controllers/postgres/hfpaDefectCodeController.js';
import hfpaUCCdetailController from '../../controllers/postgres/hfpaUCCdetailController.js';
import * as returnConfirmController from '../../controllers/postgres/returnConfirmController.js';
import * as scrapReworkConfirmController from '../../controllers/postgres/scrapReworkConfirmController.js';
import hfpaInspectController from '../../controllers/postgres/hfpaInspectController.js';
import hfpaDashboardController from '../../controllers/postgres/hfpaDashboardController.js';
import * as fgaWorkCenterController from '../../controllers/postgres/fgaWorkCenterController.js';
import * as styleSizeController from '../../controllers/postgres/styleSizeController.js';
import * as materialResolveController from '../../controllers/postgres/materialResolveController.js';
import * as moldController from '../../controllers/postgres/moldController.js';
import * as defectsReasonController from '../../controllers/postgres/defectsReasonController.js';

const router = Router();

router.get('/ping', healthController.getPing);
router.get('/table-check', healthController.getTableCheck);

/**
 * Plant 옵션 조회
 * GET /api/postgres/plants
 *
 * 쿼리 파라미터:
 *  - 없음 (현재 전체 목록 반환)
 *  - work_center   : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 *  - line          : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 *  - material_code : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 */
router.get('/plants', dmpdProdOrderController.listPlants);

/**
 * GET /api/postgres/work-centers
 * Work Center 옵션 조회
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - code_class_cd : 필수 (예: BTM_INT)
 *  - line          : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 *  - material_code : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 */
router.get('/work-centers', dmpdProdOrderController.listWorkCenters);

/**
 * GET /api/postgres/work-centers/fga
 * FGA Work Center 옵션 조회
 *
 * 쿼리 파라미터:
 *  - plant: 필수
 */
router.get('/work-centers/fga', fgaWorkCenterController.listFgaWorkCenters);

/**
 * GET /api/postgres/lines
 * Line 옵션 조회
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - work_center   : 선택 (arbpl 로 사용, 있는 경우에만 필터 적용)
 *  - material_code : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 */
router.get('/lines', dmpdProdOrderController.listLines);/**
 * GET /api/postgres/machines
 * machines 옵션 조회
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - work_center   : 선택 (arbpl 로 사용, 있는 경우에만 필터 적용)
 *  - material_code : 선택 (향후 연쇄 필터용, 현재 DAO에서는 필터 조건에 사용되지 않음)
 */
router.get('/machines', dmpdProdOrderController.listMachines);

/**
 * GET /api/postgres/materials
 * Material 옵션 조회 (remain > 0 인 material만 반환)
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 선택 (있는 경우에만 work_center 필터 적용)
 *  - line        : 선택 (있는 경우에만 zcf_line_cd 필터로 사용)
 *
 * 비즈니스 룰:
 *  - 프론트에서 work_center, line 둘 다 선택한 경우에만 이 API를 호출하는 것을 권장
 * 응답:
 *  - data: [{
 *      material_code,
 *      material_name,
 *      zcf_mcs_cd,
 *      zcf_mcs_color_nm,
 *      zcf_style_cd,   // 추가: 스타일 코드
 *      zcf_style_nm,   // 추가: 스타일명 (DB null일 수 있음)
 *      zcf_size_cd     // 추가: 사이즈 코드
 *    }]
 *  - meta: { count }
 */
router.get('/materials', dmpdProdOrderController.listMaterials);

/**
 * GET /api/postgres/materials/resolve
 * style+size로 material 단건/후보 조회
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *  - style_cd    : 필수
 *  - size_cd     : 필수
 *
 * 동작:
 *  - remain > 0 기준의 주문 데이터에서 고유 material_code 집합을 도출
 *  - 동일 조건에서 material 중복 제거(고유값) 후 반환
 *
 * 응답:
 *  - data: {
 *      material_codes: string[], // 중복 제거된 고유 material 목록
 *      material_count: number    // 고유 material 개수
 *    }
 *  - meta: { count: number } // material_count와 동일 의미

 */
router.get('/materials/resolve', materialResolveController.resolveMaterial);


/**
 * GET /api/postgres/molds/codes
 * Mold Code 옵션 조회 (연쇄 1단계)
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - work_center   : 필수
 *  - line          : 필수
 *  - material_code : 필수
 *
 * 응답:
 *  - data: [{ mold_code }]
 *  - meta: { count }
 */
router.get('/molds/codes', moldController.listMoldCodes);

/**
 * GET /api/postgres/molds/sizes
 * Mold Size 옵션 조회 (연쇄 2단계)
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - work_center   : 필수
 *  - line          : 필수
 *  - material_code : 필수
 *  - mold_code     : 필수
 *
 * 응답:
 *  - data: [{ mold_size_cd, mold_size_nm, mold_prt }]
 *  - meta: { count }
 */
router.get('/molds/sizes', moldController.listMoldSizes);


/**
 * GET /api/postgres/components
 * Components 옵션/집계 조회
 *
 * 쿼리 파라미터:
 *  - plant         : 필수
 *  - material_code : 필수 (부모 MATERIAL 코드)
 *  - work_center   : 선택 (있는 경우에만 부모 조회 시 work_center 필터로 사용)
 *  - line          : 선택 (있는 경우에만 부모 조회 시 zcf_line_cd 필터로 사용)
 *
 * 비즈니스 룰:
 *  - scrap_return 값은 백엔드에서 사용하지 않음
 *  - 프론트에서 scrap_return === 'R' 인 경우에만 이 API를 호출하는 것으로 전제
 */
router.get('/components', dmpdProdOrderController.listComponents);

/**
 * GET /api/postgres/styles
 * 스타일 옵션 조회
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *
 * 동작:
 *  - remain > 0 인 주문 데이터 범위 내에서 DISTINCT zcf_style_cd 기준 옵션 구성
 *  - 스타일명은 DB 값 사용(필요 시 프론트에서 null→'' 처리)
 *
 * 응답:
 *  - data: [{ style_cd, style_nm, material_count }]
 *      - material_count: 해당 스타일 선택 시 매칭되는 고유 material 개수
 *  - meta: { count }
 */
router.get('/styles', styleSizeController.listStyles);

/**
 * GET /api/postgres/sizes
 * 사이즈 옵션 조회 (스타일 선택 이후)
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *  - style_cd    : 필수
 *
 * 동작:
 *  - remain > 0 인 주문 데이터 범위 내에서, 지정된 스타일에 대한 DISTINCT zcf_size_cd 옵션 구성
 *  - 각 사이즈 선택 시 매칭되는 고유 material 개수 집계
 *
 * 응답:
 *  - data: [{ size_cd, material_count }]
 *      - material_count: 해당 사이즈(및 스타일 고정) 선택 시 고유 material 개수
 *  - meta: { count }
 */
router.get('/sizes', styleSizeController.listSizes);



/**
 * GET /api/postgres/dmpd-prod-order
 * 응답은 "집계형 + 옵션" 구조로 반환됩니다.
 *  - data   : material_code별 합계와 대표 order (집계 데이터)
 *  - options: selectbox AND 연동용 값 목록과 조합
 *
 * 쿼리 파라미터:
 *  - plant : 필수
 *  - limit : 선택
 *            - 숫자, 기본값은 process.env.DEFAULT_LIMIT
 *            - 최대 5000 으로 캡핑
 *  - 그 외 필터:
 *    - src/services/postgres/dmpdProdOrderService.js 의 ALLOWED_COLUMNS 에 정의된 컬럼명만 허용
 *    - 컬럼명과 동일한 키를 = 비교로 필터 (예: work_center=..., zcf_line_cd=..., order_number=...)
 *    - plant 는 별도로 처리되므로 필터용으로는 사용하지 않음
 */
router.get('/dmpd-prod-order', dmpdProdOrderController.list);

/**
 * POST /api/postgres/defects/distribute
 * 불량/반품 수량 분배 및 로그 기록
 *
 * 쿼리 파라미터:
 *  - plant : 필수 (컨트롤러에서 값 없으면 400 VALIDATION_ERROR 반환)
 *
 * 요청 바디:
 *  - validators/defectsSchema.js 의 validateDistributeBody 스키마에 따라 검증
 *  - 예시 필드:
 *    - work_center, line_cd, material_code, defect_qty, defect_form, log 등
 *
 * 응답:
 *  - 200: 전량 반영 성공
 *        { totalRequested, totalApplied, allocations, logs }
 *  - 409: 용량 초과 또는 동시성 변경으로 전량 반영 불가
 *        code: "DEFECT_QTY_EXCEEDED"
 *  - 400: 유효성 검증 실패
 *        code: "VALIDATION_ERROR"
 *  - 500: 기타 서버 오류
 *        code: "INTERNAL_ERROR" 또는 "DEFECT_NO_CONFLICT"
 */
router.post('/defects/distribute', defectsController.distribute);

/**
 * GET /api/postgres/defects/reason
 * Defect Reason 옵션 조회
 *
 * 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - material_code : 필수
 *
 * 동작:
 *  - mes.dmpd_prod_order_detail 에서 zcf_op_cd 조회(유일)
 *  - QUALITY.dmbs_code_master_temp 에서
 *    - plant_cd, CODE_CLASS_CD(= zcf_op_cd) 기준으로 SUB_CODE/CODE_NAME 조회
 *
 * 응답:
 *  - data: [{ value, label }]
 *  - meta: { count }
 *
 * 비고:
 *  - zcf_op_cd 또는 코드가 없으면 빈 배열 반환
 */
router.get('/defects/reason', defectsReasonController.listDefectReasons);



router.get('/defects/result-report', defectResultController.getDefectResults);

/*
* GET /api/postgres/defects/result-by-size
* 사이즈별 불량 결과 조회
 * - plant_cd    : 필수
 * - defect_form : 필수
 * - work_center : 옵션
 * - start_date  : 필수 (end_date와 함께 사용)
 * - end_date    : 필수 (start_date와 함께 사용)
*/
router.get("/defects/result-by-size", defectResultController.getDefectResultsBySize);

// HFPA 라우트

/**
 * GET /api/postgres/hfpa/defect-code
 * HFPA Defect Code 조회
 *
 * 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - code_class_cd : 필수
 */
router.get('/hfpa/defect-code', hfpaDefectCodeController.getHfpaDefectCode);

/**
 * GET /api/postgres/hfpa/misspacking-scan
 * HFPA Misspacking Scan 조회
 *
 * 쿼리 파라미터:
 *  - exidv : 필수
 */
router.get('/hfpa/misspacking-scan', hfpaUCCdetailController.getHfpaMisspackingScan);

// HFPA -------------------------------------------

/**
 * GET /api/postgres/hfpa/defect-code
 * HFPA Defect Code 조회
 *
 * 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - code_class_cd : 필수
 */
router.get('/hfpa/defect-code', hfpaDefectCodeController.getHfpaDefectCode);

/**
 * GET /api/postgres/hfpa/misspacking-scan
 * HFPA Misspacking Scan 조회
 *
 * 쿼리 파라미터:
 *  - exidv : 필수
 */
router.get('/hfpa/misspacking-scan', hfpaUCCdetailController.getHfpaMisspackingScan);

/**
 * POST /api/postgres/hfpa/inspect
 * HFPA 검사 저장 (다건 불량 처리)
 *
 * 바디 파라미터:
 *  - inspect_date : YYYYMMDD (필수)
 *  - plant_cd     : 필수
 *  - work_center  : 필수
 *  - line_cd      : 필수
 *  - po_no        : 필수
 *  - po_seq       : 필수
 *  - ucc_no       : 필수
 *  - style_cd     : 선택
 *  - size_cd      : 선택
 *  - inspector_no : 필수
 *  - creator      : 필수
 *  - create_pc    : 필수
 *  - defects      : 필수, 최소 1개 이상 배열
 *      - defects[].defect_cd  : 필수 (불량 코드)
  *
 * 처리 내용:
 *  - inspect_no 는 서버에서 자동 생성 (VARCHAR(3), 0 패딩, 한 요청당 1개)
 *  - quality.dmqm_hfpa_insp 에 defects 개수만큼 여러 행 INSERT
 *  - quality.dmqm_hfpa_crtn 에 집계 INSERT 또는 DEFECT_QTY UPDATE
 *      - DEFECT_QTY = INSP 테이블에서 해당 키로 COUNT(*) 한 값
 *  - 모든 작업은 하나의 트랜잭션 안에서 처리
 *
 * 응답:
 *  - success: true / false
 *  - data   :
 *      - inspRowCount : INSP INSERT 건수
 *      - crtnRowCount : CRTN INSERT/UPDATE 건수
 *      - errorCode    : "MSG0004" | "MSG0030"
 *      - inspect_no   : 이번 요청에 사용된 검사 번호
 *      - insp         : 첫 번째 INSP 행 (호환용)
 *      - inspList     : 방금 저장된 INSP 행 배열
 *      - crtn         : CRTN 헤더 행
 *  - message: 오류 메시지 또는 null
 */
router.post(
    '/hfpa/inspect',
    (req, res, next) => {
        console.log('HFPA /hfpa/inspect 요청 들어옴', new Date().toISOString())
        console.log('body =', req.body)
        next() // 꼭 호출해야 컨트롤러로 넘어감
    },
    hfpaInspectController.saveHfpaInspect
)

/**
 * GET /api/postgres/hfpa/dashboard
 * HFPA Dashboard 시간대/불량별 집계 조회
 *
 * 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - inspect_date  : 필수 (YYYYMMDD)
 *  - work_center   : 필수
 *  - line_cd       : 필수
 */
router.get('/hfpa/dashboard', hfpaDashboardController.getHfpaDashboard);

// Return Management (Return Confirm) 라우트

/**
 * GET /api/postgres/return-confirm/plants
 * Plant 목록 조회
 */

router.get('/return-confirm/plants', returnConfirmController.getPlants);

/**
 * GET /api/postgres/return-confirm/defect-results
 * Return Management용 Defect Result 조회
 *
 * 
 *  - date_from: YYYYMMDD (필수)
 *  - date_to: YYYYMMDD (필수)
 *  - plant_cd: Plant Code (필수)
 *  - work_center: Work Center (선택)
 *  - line_cd: Line Code (선택)
 *  - confirm_status: ALL/Y/N (선택, 기본값: ALL)
 */
router.get('/return-confirm/defect-results', returnConfirmController.getDefectResultsForReturn);

/**
 * POST /api/postgres/return-confirm/confirm
 * Defect Result Confirm 업데이트
 *
 *  - defect_items: 배열 (각 항목에 defect_no, plant_cd, work_center, line_cd, defect_date, create_dt)
 *  - cfm_user: Confirm User ID (임시로 고정값. 추후 받아오기)
 */
router.post('/return-confirm/confirm', returnConfirmController.updateConfirm)

/**
 * GET /api/postgres/return-confirm/work-centers
 * Work Center 옵션 조회 (Return Management 전용)
 *
 *  - plant: 필수 (쿼리 우선, 없으면 env.PLANT)
 */
router.get('/return-confirm/work-centers', returnConfirmController.listWorkCenters);

/**
 * GET /api/postgres/return-confirm/lines
 * Line 옵션 조회 (Return Management 전용)
 *
 *  - plant: 필수
 *  - work_center: 선택 (arbpl 필터)
 */
router.get('/return-confirm/lines', returnConfirmController.listLines);

// Scrap/Rework Management 라우트
/**
 * GET /api/postgres/scrap-management/plants
 * Plant 목록 조회 (Scrap Management 전용)
 *
 * 쿼리 파라미터:
 *  - 없음 (전체 목록 반환)
 */
router.get('/scrap-management/plants', scrapReworkConfirmController.getScrapPlants);

/**
 * GET /api/postgres/scrap-management/work-centers
 * Work Center 옵션 조회 (Scrap Management 전용)
 *
 * 쿼리 파라미터:
 *  - plant: 필수 (쿼리 우선, 없으면 env.PLANT)
 */
router.get('/scrap-management/work-centers', scrapReworkConfirmController.listScrapWorkCenters);

/**
 * GET /api/postgres/scrap-management/processes
 * Process 옵션 조회 (Scrap Management 전용)
 *
 * 쿼리 파라미터:
 *  - plant: 필수 (쿼리 우선, 없으면 env.PLANT)
 */
router.get('/scrap-management/processes', scrapReworkConfirmController.listScrapProcesses);

/**
 * GET /api/postgres/scrap-management/scrap-results
 * Scrap/Rework 결과 조회 (Scrap Management 메인 조회)
 *
 * 쿼리 파라미터:
 *  - date_from: YYYYMMDD (필수)
 *  - date_to: YYYYMMDD (필수)
 *  - plant_cd: Plant Code (필수)
 *  - work_center: Work Center (선택)
 *  - confirm_status: ALL/Confirmed/Not yet confirm (선택, 기본값: ALL)
 */
router.get('/scrap-management/scrap-results', scrapReworkConfirmController.getScrapResults);

/**
 * POST /api/postgres/scrap-management/save
 * Scrap/Rework 수량 저장
 *
 * 바디 파라미터:
 *  - scrap_items: 배열 (각 항목에 plant_cd, defect_form, defect_no, scrap_qty, rework_qty)
 *  - decision_user: Decision User ID
 */
router.post('/scrap-management/save', scrapReworkConfirmController.saveScrapData);


/**
 * POST /api/postgres/scrap-management/rework-save
 * Rework 저장 및 SAP 전송
 *
 * 바디 파라미터:
 *  - data: 필수 - '202511200001|2,202511180001|3'
 *  - user: 필수 - 사용자 ID
 */
router.post('/scrap-management/rework-save', scrapReworkConfirmController.saveRework);




export default router;
