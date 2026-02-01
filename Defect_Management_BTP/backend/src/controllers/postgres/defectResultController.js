// pool import 추가
import pool from "../../models/postgres/pool.js";
import * as defectResultService from "../../services/postgres/defectResultService.js";

/**
 * GET /api/postgres/defects/result-report
 *
 * 쿼리 파라미터:
 *  - plant_cd    (필수)
 *  - defect_form (필수)
 *  - work_center (옵션)
 */
async function getDefectResults(req, res) {
  let client;
  try {
    const { plant_cd, work_center, defect_form, start_date, end_date } = req.query;

    // 사전 검증: 필수 파라미터 체크
    if (!plant_cd || !defect_form) {
      return res.status(400).json({
        success: false,
        message: "plant_cd and defect_form are required",
      });
    }

    if ((start_date && !end_date) || (!start_date && end_date)) {
      return res.status(400).json({
        success: false,
        message: "start_date and end_date are required together",
      });
    }

    // client 생성
    client = await pool.connect();

    const data = await defectResultService.getDefectResults(client, {
      plant_cd,
      work_center,
      defect_form,
      start_date,
      end_date,
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
        message: err.message || "plant_cd and defect_form are required",
      });
    }

    console.error("[getDefectResults] error:", err);

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

/**
 * GET /api/postgres/defects/result-by-size
 *
 * 쿼리 파라미터:
 *  - plant_cd    (필수)
 *  - defect_form (필수)
 *  - work_center (옵션)
 *  - start_date  (필수, end_date와 함께 사용)
 *  - end_date    (필수, start_date와 함께 사용)
 */
async function getDefectResultsBySize(req, res) {
  let client;
  try {
    const { plant_cd, work_center, defect_form, start_date, end_date } = req.query;

    // 사전 검증: 필수 파라미터 체크
    if (!plant_cd || !defect_form) {
      return res.status(400).json({
        success: false,
        message: "plant_cd and defect_form are required",
      });
    }

    // 사전 검증: 날짜 범위 체크
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: "date range is required",
      });
    }
    // client 생성
    client = await pool.connect();

    const data = await defectResultService.getDefectResultsBySize(client, {
      plant_cd,
      work_center,
      defect_form,
      start_date,
      end_date,
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
        message: err.message || "plant_cd and defect_form are required",
      });
    }

    console.error("[getDefectResultsBySize] error:", err);

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
  getDefectResults,
  getDefectResultsBySize,
};
