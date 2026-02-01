// src/controllers/postgres/hfpaUCCdetailController.js

import pool from "../../models/postgres/pool.js";
import * as hfpaService from "../../services/postgres/hfpaUCCdetailService.js";

/**
 * GET /api/postgres/hfpa/misspacking-scan
 *
 * 쿼리 파라미터:
 *  - exidv : 필수
 *
 * 응답 형식:
 *  - 성공:
 *    {
 *      success: true,
 *      data: [
 *        {
 *          ebeln: "...",
 *          ebelp: "...",
 *          po: "...",
 *          style_cd: "...",
 *          size_cd: "...",
 *          exidv: "..."
 *        },
 *        ...
 *      ],
 *      message: null
 *    }
 *
 *  - 실패:
 *    { success: false, message: "에러 메시지" }
 */
async function getHfpaMisspackingScan(req, res) {
  let client;

  try {
    const { exidv } = req.query;

    // 1차 필수 파라미터 존재 여부 체크
    if (!exidv || (typeof exidv === "string" && exidv.trim() === "")) {
      return res.status(400).json({
        success: false,
        message: "exidv is required",
      });
    }

    client = await pool.connect();

    const data = await hfpaService.getHfpaMisspackingScanByExidv(client, {
      exidv,
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
        message: err.message || "exidv is required",
      });
    }

    console.error("[getHfpaMisspackingScan] error:", err);

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
  getHfpaMisspackingScan,
};
