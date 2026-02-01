// pool import
import pool from "../../models/postgres/pool.js";
import * as hfpaDashboardService from "../../services/postgres/hfpaDashboardService.js";

/**
 * GET /api/postgres/hfpa/dashboard
 *
 * 쿼리 파라미터:
 *  - plant_cd      (필수)
 *  - inspect_date  (필수, YYYYMMDD)
 *  - work_center   (필수)
 *  - line_cd       (필수)
 */
async function getHfpaDashboard(req, res) {
  let client;
  try {
    const { plant_cd, inspect_date, work_center, line_cd } = req.query;

    if (!plant_cd || !inspect_date || !work_center || !line_cd) {
      return res.status(400).json({
        success: false,
        message:
          "plant_cd, inspect_date, work_center, line_cd are required",
      });
    }

    client = await pool.connect();

    const data = await hfpaDashboardService.getHfpaDashboard(client, {
      plant_cd,
      inspect_date,
      work_center,
      line_cd,
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
        message:
          err.message ||
          "plant_cd, inspect_date, work_center, line_cd are required",
      });
    }

    console.error("[getHfpaDashboard] error:", err);

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
  getHfpaDashboard,
};
