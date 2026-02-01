// src/controllers/postgres/hfpaDefectCodeController.js

import pool from "../../models/postgres/pool.js";
import * as hfpaDefectCodeService from "../../services/postgres/hfpaDefectCodeService.js";

/**
 * GET /api/postgres/hfpa-defect-code
 *
 * 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - code_class_cd : 필수
 *
 * 응답 형식:
 *  - 성공:
 *    {
 *      success: true,
 *      data: [
 *        {
 *          plant_cd: "...",
 *          code_class_cd: "...",
 *          sub_code: "...",
 *          code_name: "...",
 *          value_1: "...",
 *          value_2: "..."
 *        },
 *        ...
 *      ],
 *      message: null
 *    }
 *
 *  - 실패:
 *    { success: false, message: "에러 메시지" }
 */
async function getHfpaDefectCode(req, res) {
  let client;

  try {
    const { plant_cd, code_class_cd } = req.query;

    // 1차 필수 파라미터 존재 여부 체크
    if (!plant_cd || !code_class_cd ) {
      return res.status(400).json({
        success: false,
        message: "plant_cd, code_class_cd are required",
      });
    }

    client = await pool.connect();

    const data = await hfpaDefectCodeService.getHfpaDefectCode(client, {
      plant_cd,
      code_class_cd,
    });

    return res.json({
      success: true,
      data,
      message: null,
    });
  } catch (err) {
    const status = err.statusCode || 500;

    if (status === 400) {
      return res.status(400).json({
        success: false,
        message: err.message || "plant_cd, code_class_cd are required",
      });
    }

    console.error("[getHfpaDefectCode] error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

export default {
  getHfpaDefectCode,
};
