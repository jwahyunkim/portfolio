// src/renderer/utils/sapApi.ts
import { getMesAxios } from "./mesAxios"; 

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/* ===================== 공통 타입 ===================== */

export type OrderDetail = {
  sfcs?: string[];
  [key: string]: any;
};

export type GoodsReceiptUnit = {
  commercialUnitOfMeasure: string;
  internalUnitOfMeasure: string;
  isoUnitOfMeasure: string;
};

export type GoodsReceiptLineItem = {
  material: string;
  materialVersion?: string;
  postingDate: string;
  postingDateTime?: string;
  quantity: {
    unitOfMeasure: GoodsReceiptUnit;
    value: number;
  };
  sfc: string;
  storageLocation: string;
};

export type ActivityItem = {
  activityId: string;
  quantity: number;
  unitOfMeasure: string;
  isoUnitOfMeasure: string;
  postedBy: string;
  postingDateTime: string;
};

/* ===================== SAP PATH 상수 ===================== */

const SAP_ORDER_DETAIL_PATH = "/order/v1/orders";
const SAP_ORDER_LIST_PATH   = "/order/v1/orders/list";

const SAP_SFC_DETAIL_PATH   = "/sfc/v1/sfcdetail";           // SFC_DETAIL
const SAP_BOM_DETAIL_PATH   = "/bom/v1/boms";                // BOM_DETAIL

const SAP_UNIT_CODE_PATH    = "/uom/v2/uoms";                // UNIT_CODE

const SAP_QTY_CONFIRM_PATH  = "/quantityConfirmation/v1/confirm"; // QtyConfirm

// Receipts: POST / GET 둘 다 있으므로 상수 분리
const SAP_GOODS_RECEIPT_POST_PATH = "/inventory/v1/inventory/erpGoodsReceipts"; // POST
const SAP_GOODS_RECEIPT_GET_PATH  = "/inventory/v1/inventory/goodsReceipts"; // GET

const SAP_STANDARD_VALUE_PATH    = "/standardValue/v1/details";         // Standard Value
const SAP_ACTIVITY_CONFIRM_PATH  = "/activityConfirmation/v1/confirm";  // Activity Confirm
const SAP_START_PATH             = "/sfc/v1/sfcs/start";                // SFC Start (operation)

/**
 * 어떤 깊이에 있어도 "sfcs" 키를 가진 배열을 다 찾아서 모아오는 유틸
 * 예: { sfcs: [...] }, { data: { sfcs: [...] } }, { order: { sfcs: [...] } } 등
 */
function extractSfcsDeep(data: any): string[] {
  const result: string[] = [];

  const visit = (obj: any) => {
    if (!obj || typeof obj !== "object") return;

    // 배열이면 각 요소 재귀
    if (Array.isArray(obj)) {
      for (const v of obj) visit(v);
      return;
    }

    // 객체 순회
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === "sfcs" && Array.isArray(v)) {
        result.push(...v.map((x) => String(x)));
      }
      if (v && typeof v === "object") {
        visit(v);
      }
    }
  };

  visit(data);

  // 중복 제거
  return Array.from(new Set(result));
}

// /* ===================== 2단계: ORDER_DETAIL ===================== */

export async function fetchOrderDetail(
  plant: string,
  order: string
): Promise<OrderDetail | null> {
  try {
    // ✅ 여기서부터는 MesPopApi(운영 MesPopApi 서비스)로 바로 붙는다
    const ax = await getMesAxios();

    console.log("🔸 [SAP/MES] ORDER_DETAIL 호출 시작 (MesPopApi)", {
      plant,
      order,
    });

    // MesPopApi: GET /sap/proxy?path=/order/v1/orders&plant=...&order=...

    const res = await ax.get("/sap/proxy", {
      params: {
        path: SAP_ORDER_DETAIL_PATH,
        plant,
        order,
      },
    });

    const data: any = res.data;

    // 어디 깊이에 있어도 sfcs 배열을 다 모아오는 기존 유틸 재사용
    const sfcs = extractSfcsDeep(data);

    const normalized: OrderDetail = {
      ...data,
      sfcs,
    };

    console.log("✅ [SAP/MES] ORDER_DETAIL 조회 성공 (MesPopApi)", {
      plant,
      order,
      hasSfcs: sfcs.length > 0,
      sfcCount: sfcs.length,
      sfcsSample: sfcs.slice(0, 5),
      rawKeys: Object.keys(data || {}),
    });

    return normalized;
  } catch (err: any) {
    console.error(
      "❌ [SAP/MES] ORDER_DETAIL 조회 실패 (MesPopApi)",
      err?.response?.data || err?.message || err
    );
    return null;
  }
}


/* ===================== 3단계: SFC_DETAIL ===================== */

export async function fetchSfcDetail(plant: string, sfc: string) {
  try {
    const ax = await getMesAxios();

    console.log("🔸 [SAP] SFC_DETAIL 호출 시작 (MesPopApi)", { plant, sfc });

    // MesPopApi: GET /sap/proxy?path=/sfc/v1/sfcdetail&plant=...&sfc=...
    const res = await ax.get("/sap/proxy", {
      params: {
        path: SAP_SFC_DETAIL_PATH,
        plant,
        sfc,
      },
    });

    console.log("✅ [SAP] SFC_DETAIL 조회 성공 (MesPopApi)", { plant, sfc });

    return res.data;
  } catch (err: any) {
    console.error(
      "❌ [SAP] SFC_DETAIL 조회 실패 (MesPopApi)",
      err?.response?.data || err?.message || err
    );
    return null;
  }
}

/* ===================== 4단계: BOM_DETAIL ===================== */

export async function fetchBomDetail(
  plant: string,
  bomCode: string | undefined,
  rawBomType: string | undefined
) {
  try {
    if (!plant || !bomCode || !rawBomType) {
      console.warn("⚠ [SAP] BOM_DETAIL 파라미터 누락", {
        plant,
        bomCode,
        rawBomType,
      });
      return null;
    }

    // SAP SFC / ORDER 에서 오는 BOM type → API type 변환
    const type =
      rawBomType === "SHOPORDERBOM"
        ? "SHOP_ORDER"
        : rawBomType === "MASTERBOM"
        ? "MASTER"
        : rawBomType === "SFCBOM"
        ? "SFC"
        : rawBomType; // 모르면 그냥 원문 전달

    const ax = await getMesAxios();

    console.log("🔸 [SAP] BOM_DETAIL 호출 시작 (MesPopApi)", {
      plant,
      bomCode,
      rawBomType,
      type,
    });

    // MesPopApi: GET /sap/proxy?path=/bom/v1/boms&plant=...&bom=...&type=...
    const res = await ax.get("/sap/proxy", {
      params: {
        path: SAP_BOM_DETAIL_PATH,
        plant,
        bom: bomCode,
        type,
      },
    });

    const raw = res.data;

    // 🔍 응답 형태 정규화:
    //  - 배열이면 첫 번째
    //  - content 배열이 있으면 그 첫 번째
    //  - items 배열이 있으면 그 첫 번째
    //  - 아니면 원본 그대로
    let bomInfo: any;

    if (Array.isArray(raw)) {
      bomInfo = raw[0];
    } else if (Array.isArray(raw?.content)) {
      bomInfo = raw.content[0];
    } else if (Array.isArray(raw?.items)) {
      bomInfo = raw.items[0];
    } else {
      bomInfo = raw;
    }

    // 혹시라도 bomInfo가 비어있으면 경고 찍고 null로 처리
    if (!bomInfo) {
      console.warn("⚠ [SAP] BOM_DETAIL 응답이 비어있음 (MesPopApi)", {
        plant,
        bomCode,
        rawBomType,
      });
      return null;
    }

    const componentCount = Array.isArray(bomInfo?.components)
      ? bomInfo.components.length
      : 0;

    console.log("✅ [SAP] BOM_DETAIL 조회 성공 (MesPopApi)", {
      plant,
      bom: bomInfo?.bom,
      version: bomInfo?.version,
      baseUnitOfMeasure: bomInfo?.baseUnitOfMeasure,
      componentCount,
      rawKeys: Object.keys(bomInfo || {}),
    });

    return bomInfo;
  } catch (err: any) {
    console.error(
      "❌ [SAP] BOM_DETAIL 조회 실패 (MesPopApi)",
      err?.response?.data || err?.message || err
    );
    return null;
  }
}


/* =====================5단계: ★ SAP START (공정 시작) ===================== */
/**
 * SAP OperationActivity Start
 *
 * - 공정(operationActivity) = "ZZZTEST90015-0-0010" 같은 전체 문자열
 * - resource = SFC_DETAIL.step[].resource 또는 plannedWorkCenter 사용
 * - sfcs = [SFC]
 */
export async function callSapStart({
  plant,
  operation,
  resource,
  sfcs,
}: {
  plant: string;
  operation: string;        // ex: "ZZZTEST90015-0-0010"
  resource: string | null;  // ex: "OSORB"  (null도 허용)
  sfcs: string[];           // ex: ["C20025"]
}) {
  try {
    const ax = await getMesAxios();

    const payload = {
      plant,
      operation,
      resource: resource || "",
      sfcs,
    };

    console.log("🚀 [SAP START] 호출 시작 (MesPopApi)");
    console.log("📦 요청 Payload:", payload);

    // MesPopApi: POST /sap/proxy?path=/sfc/v1/sfcs/start
    const res = await ax.post("/sap/proxy", payload, {
      params: { path: SAP_START_PATH },
    });

    console.log("✅ [SAP START] 성공 (MesPopApi):", res.data);
    return res.data;
  } catch (err: any) {
    const detail = err?.response?.data || err?.message || err;
    console.error("❌ [SAP START] 실패 (MesPopApi):", detail);
    throw err;
  }
}

/* ===================== 6단계: UNIT_CODE 조회 ===================== */

export async function fetchUnitCodeInfo(baseUnitOfMeasure: string) {
  try {
    if (!baseUnitOfMeasure) {
      console.warn("⚠ UNIT_CODE 조회: baseUnitOfMeasure 없음");
      return null;
    }

    const ax = await getMesAxios();

    console.log("🔸 [SAP] UNIT_CODE 조회 시작 (MesPopApi)", {
      baseUnitOfMeasure,
    });

    // MesPopApi: GET /sap/proxy?path=/uom/v2/uoms&unitCode=...
    const res = await ax.get("/sap/proxy", {
      params: { path: SAP_UNIT_CODE_PATH, unitCode: baseUnitOfMeasure },
    });

    const raw = res.data;
    const matched = Array.isArray(raw) ? raw[0] : raw;

    if (!matched || !matched.unitCode) {
      console.warn("⚠ UNIT_CODE 조회 결과 없음");
      return null;
    }

    // 🎯 언어 우선순위: ko > en
    const getPreferredCommercialCode = (codes: any[] = []) => {
      const preferredLanguages = ["ko", "en"];
      for (const lang of preferredLanguages) {
        const found = codes.find((c: any) => c.language === lang);
        if (found?.commercialCode) return found.commercialCode;
      }
      return codes[0]?.commercialCode || baseUnitOfMeasure;
    };

    const unitOfMeasure: GoodsReceiptUnit = {
      commercialUnitOfMeasure: getPreferredCommercialCode(
        matched.commercialCodes
      ),
      internalUnitOfMeasure: baseUnitOfMeasure,
      isoUnitOfMeasure: matched.isoCode || baseUnitOfMeasure,
    };

    console.log("🟢 [SAP] UNIT_CODE 조회 성공 (MesPopApi)", {
      baseUnitOfMeasure,
      unitOfMeasure,
    });

    return { raw: matched, unitOfMeasure };
  } catch (err: any) {
    console.error(
      "❌ [SAP] UNIT_CODE 조회 실패 (MesPopApi)",
      err?.response?.data || err?.message || err
    );
    return null;
  }
}


/* ===================== 7단계: Quantity Confirm POST ===================== */

export type QtyConfirmParams = {
  plant: string;
  shopOrder: string;
  sfc: string;
  operationActivity: string;
  workCenter: string;
  yieldQuantity: number;
  yieldQuantityUnit: string;
  yieldQuantityIsoUnit: string;
  isFinalConfirmation?: boolean;
};

export async function postQuantityConfirm(params: QtyConfirmParams) {
  const {
    plant,
    shopOrder,
    sfc,
    operationActivity,
    workCenter,
    yieldQuantity,
    yieldQuantityUnit,
    yieldQuantityIsoUnit,
    isFinalConfirmation = false,
  } = params;

  try {
    const ax = await getMesAxios();

    console.log("📡 [SAP] QuantityConfirm 호출 시작 (MesPopApi)", {
      plant,
      shopOrder,
      sfc,
      operationActivity,
      workCenter,
      yieldQuantity,
      yieldQuantityUnit,
      yieldQuantityIsoUnit,
      isFinalConfirmation,
    });

    // MesPopApi: POST /sap/proxy?path=/quantityConfirmation/v1/confirm
    const qtyConfirmResp = await ax.post(
      "/sap/proxy",
      {
        plant,
        shopOrder,
        sfc,
        operationActivity,
        workCenter,
        yieldQuantity,
        yieldQuantityUnit,
        yieldQuantityIsoUnit,
        isFinalConfirmation,
      },
      {
        params: { path: SAP_QTY_CONFIRM_PATH },
      }
    );

    console.log("✅ [SAP] QuantityConfirm 성공 (MesPopApi):", qtyConfirmResp.data);

    return qtyConfirmResp.data;
  } catch (err: any) {
    console.error(
      "❌ [SAP] QuantityConfirm 실패 (MesPopApi):",
      err?.response?.data || err?.message || err
    );
    throw err;
  }
}

/* ===================== 8단계: GoodsReceipt POST ===================== */

export const callSapPostGoodsReceipt = async ({
  plant,
  order,
  postedBy,
  lineItems,
}: {
  plant: string;
  order: string;
  postedBy?: string;
  lineItems: GoodsReceiptLineItem[];
}): Promise<any> => {
  console.log("🚀 [SAP GoodsReceipt] 호출 시작 (MesPopApi)");
  console.log("📦 요청 Payload:", {
    plant,
    order,
    postedBy,
    lineItems,
  });

  const payload = {
    plant,
    order,
    postedBy: postedBy || "system",
    lineItems,
  };

  let attempt = 0;

  while (true) {
    try {
      const ax = await getMesAxios();

      console.log(`🚀 [SAP GoodsReceipt] 시도 ${attempt + 1}회 (MesPopApi)`);

      // MesPopApi: POST /sap/proxy?path=/inventory/v1/inventory/goodsReceipts
      const res = await ax.post("/sap/proxy", payload, {
        params: {
          path: SAP_GOODS_RECEIPT_POST_PATH,
        },
      });

      console.log("✅ SAP GoodsReceipt 호출 성공 (MesPopApi):", res.data);
      return res.data;
    } catch (err: any) {
      const responseData = err?.response?.data || {};
      console.error(
        `❌ [SAP GoodsReceipt] 호출 실패 (${attempt + 1}회차, MesPopApi):`,
        responseData.error || err.message
      );

      attempt++;

      if (attempt >= 10) {
        console.warn("⚠️ 10회 연속 실패 → 2초 후 루프 재시작");
        attempt = 0;
        await delay(2000); // 🔁 10회 실패 시 2초 대기
      } else {
        await delay(1000); // 🔁 일반 재시도 1초 대기
      }
    }
  }
};

/* ===================== 9단계: GoodsReceipt POSTED 조회 ===================== */

export const fetchPostedGoodsReceipts = async (
  plant: string,
  order: string,
  sfc: string,
  material: string,
  transactionIds: string[], // TxID 유무에 따라 필터링 여부 결정
  maxRetries = 30,
  delayMs = 1000
): Promise<any[]> => {
  const ax = await getMesAxios();

  // 🔹 공통 Tx 정규화 유틸
  const normTx = (v: any) => (v == null ? "" : String(v).trim());
  const normalizedTxIds = transactionIds.map(normTx);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // MesPopApi: GET /sap/proxy?path=/inventory/v1/inventory/goodsReceipts&...
      const res = await ax.get("/sap/proxy", {
        params: {
          path: SAP_GOODS_RECEIPT_GET_PATH,
          plant,
          order,
          sfc,
          material,
        },
      });

      const data = res.data as any;

      const result = Array.isArray(data)
        ? data
        : Array.isArray(data?.content)
        ? data.content
        : Array.isArray(data?.lineItems)
        ? data.lineItems
        : [];

      // 🔍 POSTED 된 전체
      const postedOnly = result.filter(
        (d: any) => d.status === "POSTED_TO_TARGET_SYS"
      );

      // 🔍 TxID가 제공된 경우 → 매칭되는 게 있을 때만 리턴
      if (normalizedTxIds.length > 0) {
        const matched = postedOnly.filter((d: any) =>
          normalizedTxIds.includes(normTx(d.transactionId))
        );

        if (matched.length > 0) {
          console.log(
            `✅ TxID 매칭된 입고 데이터 발견 (시도 ${attempt}회)`
          );
          console.table(
            matched.map((d: any) => ({
              order: d.order,
              sfc: d.sfc,
              tx: normTx(d.transactionId),
              qty: d.quantityInBaseUnit?.value,
            }))
          );
          // 🔒 기존 정책 유지: 매칭되면 POSTED 전체 반환
          return postedOnly;
        }

        console.log(
          `⏳ TxID 매칭 결과 없음 (시도 ${attempt}회) → 재시도`
        );
        await delay(delayMs);
      } else {
        // TxID가 없으면 기존처럼 전체 POSTED 반환
        console.log(
          `✅ 전체 POSTED 입고 조회 (TxID 없음, ${postedOnly.length}건)`
        );
        return postedOnly;
      }
    } catch (err) {
      console.warn(
        `🚨 GoodsReceipt 조회 실패 (시도 ${attempt}회, MesPopApi):`,
        err
      );
      await delay(delayMs);
    }
  }

  console.warn("❌ 최대 재시도 초과. TxID 일치 입고 데이터 확인 불가");
  // 🔒 정책 그대로: 매칭 못 하면 빈 배열
  return [];
};


/* ===================== 10단계: ActivityConfirm 관련 ===================== */

/** ✅ SAP 표준시간(Standard Value) 전체 구조 조회 */
export const fetchStandardValueObject = async ({
  plant,
  workCenter,
  operationActivity,
  operationActivityVersion,
  object,
  objectType,
  objectVersion,
}: {
  plant: string;
  workCenter: string;
  operationActivity: string;
  operationActivityVersion: string;
  object: string;
  objectType: string;
  objectVersion: string;
}) => {
  try {
    const ax = await getMesAxios();
    const res = await ax.get("/sap/proxy", {
      params: {
        path: SAP_STANDARD_VALUE_PATH,
        plant,
        workCenter,
        operationActivity,
        operationActivityVersion,
        object,
        objectType,
        objectVersion,
      },
    });

    const resData = res.data as any;

    if (!resData || !Array.isArray(resData?.standardValueCollectionList)) {
      console.warn("⚠️ SAP 응답에 standardValueCollectionList 없음");
      return null;
    }

    console.log("✅ SAP 표준시간 전체 응답 (MesPopApi):", resData);
    return resData; // ← 전체 객체 반환
  } catch (err: any) {
    console.error(
      "❌ SAP StandardValue 조회 실패 (MesPopApi):",
      err.response?.data || err.message
    );
    return null;
  }
};

/** ✅ SAP Activity Confirm POST */
export const callSapPostActivityConfirm = async ({
  plant,
  shopOrder,
  sfc,
  operationActivity,
  stepId,
  workCenter,
  activityList,
}: {
  plant: string;
  shopOrder: string;
  sfc: string;
  operationActivity: string;
  stepId: string;
  workCenter: string;
  activityList: ActivityItem[];
}) => {
  try {
    const ax = await getMesAxios();

    const activities = activityList.map((item) => ({

      activityId: item.activityId,
      quantity: item.quantity,
      unitOfMeasure: item.unitOfMeasure, // 고정
      isoUnitOfMeasure: item.isoUnitOfMeasure, // 고정
      postedBy: item.postedBy,
      postingDateTime: item.postingDateTime,
    }));

    const payload = {
      plant,
      shopOrder,
      sfc,
      operationActivity,
      stepId,
      workCenter,
      finalConfirmation: true,
      allowPostingsAfterOperationActivityComplete: true,
      activities,
    };

    // MesPopApi: POST /sap/proxy?path=/activityConfirmation/v1/confirm
    const res = await ax.post("/sap/proxy", payload, {
      params: { path: SAP_ACTIVITY_CONFIRM_PATH },
    });
    console.log("✅ Activity Confirm 성공 (MesPopApi):", res.data);
    return res.data;
  } catch (err: any) {
    console.error(
      "❌ Activity Confirm 실패 (MesPopApi):",
      err.response?.data || err.message
    );
    throw err;
  }
};


/* ========================================== Dmc 제조오더 포스트그레이 가져오기 ========================================== */

/* ===================== 1단계: ORDER_LIST 조회 ===================== */
/**
 * SAP DMC Order List 조회 (MesPopApi /sap/proxy 래핑)
 *
 * - MesPopApi에서 GET_ORDER_LIST (https://api.us20.dmc.cloud.sap/order/v1/orders/list)
 *   를 사용해 DMC를 호출한다고 가정
 * - 여기서는 조회 조건만 넘겨준다.
 *
 * @param plant              예: "C200"
 * @param workCenter         예: "OSOSP"  ← 단수
 * @param scheduledStartDate SYSDATE-1을 프로그램에서 변환한 ISO 문자열
 *                           (예: "2025-11-20T00:00:00Z")
 * @param opts               (옵션) 테스트모드용 order / limit
 */
export async function fetchSapOrderList(
  plant: string,
  workCenter: string,
  scheduledStartDate: string,
  opts?: { order?: string; limit?: number }
) {
  const ax = await getMesAxios(); // ← 이제 MesPopApi 사용

  const params: any = {
    path: SAP_ORDER_LIST_PATH,
    plant,
  };

  // ✅ SAP DMC 쪽에서 요구하는 이름: workCenter (단수)
  if (workCenter) {
    params.workCenter = workCenter;
  }

  // 날짜는 옵션으로
  if (scheduledStartDate) {
    params.scheduledStartDate = scheduledStartDate;
  }

  if (opts?.order) {
    params.order = opts.order;
  }
  if (typeof opts?.limit === "number") {
    params.limit = opts.limit;
  }

  console.log("🔸 [SAP] ORDER_LIST 조회 시작 (MesPopApi)", params);

  try {
    // MesPopApi: GET /sap/proxy?path=/order/v1/orders/list&...
    const res = await ax.get("/sap/proxy", { params });
    console.log("✅ [SAP] ORDER_LIST 조회 성공 (MesPopApi)", res.data);
    return res.data;
  } catch (err: any) {
    const detail = err?.response?.data || err?.message || err;
    console.error("❌ [SAP] ORDER_LIST 조회 실패 (MesPopApi)", detail);
    throw detail;
  }
}
