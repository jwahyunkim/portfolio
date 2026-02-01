// src/controllers/sap-s4hana/moldSerialController.js
import * as moldSerialService from "../../services/sap-s4hana/moldSerialService.js";

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
export async function getMoldSerial(req, res) {
  try {
    const plant =
      typeof req.query.plant === "string" && req.query.plant.trim() !== ""
        ? req.query.plant.trim()
        : "";

    const moldCode =
      typeof req.query.mold_code === "string" && req.query.mold_code.trim() !== ""
        ? req.query.mold_code.trim()
        : "";

    const moldSize =
      typeof req.query.mold_size === "string" && req.query.mold_size.trim() !== ""
        ? req.query.mold_size.trim()
        : "";

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_PLANT",
          message: "plant 값이 필요합니다",
          details: null,
        },
      });
    }

    if (!moldCode) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_MOLD_CODE",
          message: "mold_code 값이 필요합니다",
          details: null,
        },
      });
    }

    if (!moldSize) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_MOLD_SIZE",
          message: "mold_size 값이 필요합니다",
          details: null,
        },
      });
    }

    // ESM/CJS 로딩 형태 차이를 모두 커버
    // 1) named export
    // 2) default export = function
    // 3) default export = { getMoldSerial: function }
    const fn =
      typeof moldSerialService.getMoldSerial === "function"
        ? moldSerialService.getMoldSerial
        : typeof moldSerialService.default === "function"
          ? moldSerialService.default
          : moldSerialService.default &&
              typeof moldSerialService.default.getMoldSerial === "function"
            ? moldSerialService.default.getMoldSerial
            : null;

    if (!fn) {
      const topKeys = Object.keys(moldSerialService || {});
      const defaultKeys =
        moldSerialService && moldSerialService.default
          ? Object.keys(moldSerialService.default)
          : [];
      throw new Error(
        `moldSerialService export not found (topKeys=${topKeys.join(
          ","
        )}, defaultKeys=${defaultKeys.join(",")})`
      );
    }

    const result = await fn({
      plant,
      mold_code: moldCode,
      mold_size: moldSize,
    });

    return res.json({
      success: true,
      data: { zz_mo_serial: result.zz_mo_serial },
      meta: { count: result.count },
    });
  } catch (err) {
    console.error("[getMoldSerial] error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "서버 오류",
        details:
          process.env.NODE_ENV === "development"
            ? String(err?.message || err)
            : null,
      },
    });
  }
}
