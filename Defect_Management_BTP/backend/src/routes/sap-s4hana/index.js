// src/routes/sap-s4hana/index.js
import { Router } from "express";
import * as moldSerialController from "../../controllers/sap-s4hana/moldSerialController.js";
import * as scrapStoController from "../../controllers/sap-s4hana/scrapStoController.js";

const router = Router();

/**
 * GET /api/sap-s4hana/molds/serial
 * SAP S/4HANA OData에서 ZZ_MO_SERIAL 조회
 *
 * 쿼리 파라미터:
 *  - plant     : 필수 (WERKS)
 *  - mold_code : 필수 (ZZ_MO_CODE)
 *  - mold_size : 필수 (ZZ_MO_SIZE)
 *
 * 응답:
 *  - success: true
 *  - data: { zz_mo_serial: string }
 *  - meta: { count: number }
 *
 * 0건인 경우:
 *  - success: true
 *  - data: { zz_mo_serial: '' }
 *  - meta: { count: 0 }
 */
router.get("/molds/serial", moldSerialController.getMoldSerial);

/**
 * POST /api/sap-s4hana/scrap-sto/put
 * SAP S/4HANA OData4 action put_dm_scrap_sto
 */
router.post("/scrap-sto/put", scrapStoController.putDmScrapSto);
export default router;

