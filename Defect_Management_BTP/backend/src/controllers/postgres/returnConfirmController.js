// backend/src/controllers/postgres/returnConfirmController.js

import pool from "../../models/postgres/pool.js";
import * as returnConfirmService from "../../services/postgres/returnConfirmService.js";

/**
 * GET /api/postgres/return-confirm/plants
 * Plant 목록 조회
 */
export async function getPlants(req, res) {
  let client;
  try {
    client = await pool.connect();

    const plants = await returnConfirmService.getPlants(client);

    return res.json({
      success: true,
      data: plants,
      meta: {
        count: plants.length
      }
    });
  } catch (err) {
    console.error("[returnConfirmController.getPlants] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다',
        details: process.env.NODE_ENV === 'development'
          ? String(err?.message || err)
          : null
      }
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * GET /api/postgres/return-confirm/defect-results
 * Return Management용 Defect Result 조회
 *
 * 쿼리 파라미터:
 *  - date_from: 필수 (YYYYMMDD)
 *  - date_to: 필수 (YYYYMMDD)
 *  - plant_cd: 필수
 *  - work_center: 선택
 *  - line_cd: 선택
 *  - confirm_status: 선택 (ALL/Y/N)
 */
export async function getDefectResultsForReturn(req, res) {
  let client;
  try {
    client = await pool.connect();

    // 쿼리 파라미터 추출
    const date_from = typeof req.query.date_from === 'string' ? req.query.date_from.trim() : '';
    const date_to = typeof req.query.date_to === 'string' ? req.query.date_to.trim() : '';
    const plant_cd = typeof req.query.plant_cd === 'string' ? req.query.plant_cd.trim() : '';
    const work_center = typeof req.query.work_center === 'string' ? req.query.work_center.trim() : '';
    const line_cd = typeof req.query.line_cd === 'string' ? req.query.line_cd.trim() : '';
    const confirm_status = typeof req.query.confirm_status === 'string' ? req.query.confirm_status.trim() : 'ALL';

    // 필수 파라미터 검증
    if (!date_from) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DATE_FROM',
          message: 'date_from 파라미터가 필요합니다',
          details: null
        }
      });
    }

    if (!date_to) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DATE_TO',
          message: 'date_to 파라미터가 필요합니다',
          details: null
        }
      });
    }

    if (!plant_cd) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PLANT_CD',
          message: 'plant_cd 파라미터가 필요합니다',
          details: null
        }
      });
    }

    // 서비스 호출
    const results = await returnConfirmService.getDefectResultsForReturn(client, {
      date_from,
      date_to,
      plant_cd,
      work_center,
      line_cd,
      confirm_status
    });

    return res.json({
      success: true,
      data: results,
      meta: {
        count: results.length
      }
    });
  } catch (err) {
    console.error("[returnConfirmController.getDefectResultsForReturn] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다',
        details: process.env.NODE_ENV === 'development'
          ? String(err?.message || err)
          : null
      }
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * POST /api/postgres/return-confirm/confirm
 * Defect Result Confirm 업데이트
 *
 * 바디 파라미터:
 *  - defect_items: 필수 (배열)
 *    - plant_cd: 필수
 *    - defect_no: 필수
 *  - cfm_user: 필수
 */
export async function updateConfirm(req, res) {
  let client;
  try {
    client = await pool.connect();

    // 바디 검증
    const { defect_items, cfm_user } = req.body;

    if (!Array.isArray(defect_items) || defect_items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DEFECT_ITEMS',
          message: 'defect_items는 비어있지 않은 배열이어야 합니다',
          details: null
        }
      });
    }

    if (typeof cfm_user !== 'string' || cfm_user.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CFM_USER',
          message: 'cfm_user가 필요합니다',
          details: null
        }
      });
    }

    // 각 항목 검증
    for (const item of defect_items) {
      if (!item.plant_cd || !item.defect_no) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DEFECT_ITEM',
            message: 'defect_items의 각 항목에는 plant_cd, defect_no가 필요합니다',
            details: null
          }
        });
      }
    }

    // 서비스 호출
    const result = await returnConfirmService.updateConfirm(client, {
      defect_items,
      cfm_user: cfm_user.trim()
    });

    return res.json({
      success: true,
      data: {
        updated_count: result.updated_count
      }
    });
  } catch (err) {
    console.error("[returnConfirmController.updateConfirm] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다',
        details: process.env.NODE_ENV === 'development'
          ? String(err?.message || err)
          : null
      }
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * GET /api/postgres/return-confirm/work-centers
 * Work Center 목록 조회 (Return Management 전용)
 *
 * 쿼리 파라미터:
 *  - plant: 필수 (쿼리 우선, 없으면 env.PLANT)
 */
export async function listWorkCenters(req, res) {
  let client;
  try {
    const envPlant = process.env.PLANT ?? "";

    // plant 검증: 쿼리 → env 폴백
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : envPlant;

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PLANT',
          message: 'plant 값이 필요합니다',
          details: null
        }
      });
    }

    client = await pool.connect();

    const data = await returnConfirmService.getWorkCenters(client, { plant });

    return res.json({
      success: true,
      data: data,
      meta: {
        count: data.length
      }
    });
  } catch (err) {
    console.error("[returnConfirmController.listWorkCenters] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다',
        details: process.env.NODE_ENV === 'development'
          ? String(err?.message || err)
          : null
      }
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * GET /api/postgres/return-confirm/lines
 * Line 목록 조회 (Return Management 전용)
 *
 * 쿼리 파라미터:
 *  - plant: 필수
 *  - work_center: 필수 (arbpl 필터)
 */
export async function listLines(req, res) {
  let client;
  try {
    const envPlant = process.env.PLANT ?? "";

    // plant 검증: 쿼리 → env 폴백
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : envPlant;

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PLANT',
          message: 'plant 값이 필요합니다',
          details: null
        }
      });
    }

    // work_center 필수 파라미터
    const work_center =
      typeof req.query.work_center === 'string' && req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : '';

    if (!work_center) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_WORK_CENTER',
          message: 'work_center 값이 필요합니다',
          details: null
        }
      });
    }

    client = await pool.connect();

    const data = await returnConfirmService.getLines(client, {
      plant,
      work_center
    });

    return res.json({
      success: true,
      data: data,
      meta: {
        count: data.length
      }
    });
  } catch (err) {
    console.error("[returnConfirmController.listLines] Error:", err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류가 발생했습니다',
        details: process.env.NODE_ENV === 'development'
          ? String(err?.message || err)
          : null
      }
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}
