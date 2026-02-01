// backend/src/controllers/postgres/scrapReworkConfirmController.js

import pool from "../../models/postgres/pool.js"
import * as scrapReworkConfirmService from "../../services/postgres/scrapReworkConfirmService.js";

export async function getScrapPlants(req, res) {
  let client;
  try {
    client = await pool.connect();

    const plants = await scrapReworkConfirmService.getScrapPlants(client);

    return res.json({
      success: true,
      data: plants,
      meta: {
        count: plants.length
      }
    });
  } catch (err) {
    console.error("[scrapManagementController.getPlants] Error:", err);
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
 * GET /api/postgres/scrap-management/work-centers
 *
 * 쿼리 파라미터:
 *  - plant: 필수 (쿼리 우선, 없으면 env.PLANT)
 */
export async function listScrapWorkCenters(req, res) {
  let client;
  try {
    const envPlant = process.env.PLANT ?? "";

    // plant 검증
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

    const data = await scrapReworkConfirmService.getScrapWorkCenters(client, { plant });

    return res.json({
      success: true,
      data: data,
      meta: {
        count: data.length
      }
    });
  } catch (err) {
    console.error("[scrapManagementController.listWorkCenters] Error:", err);
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
 * GET /api/postgres/scrap-management/processes
 *
 *  - plant: 필수
 */
export async function listScrapProcesses(req, res) {
  let client;
  try {
    const envPlant = process.env.PLANT ?? "";

    // plant 검증
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

    const data = await scrapReworkConfirmService.getScrapProcesses(client, {
      plant 
    });

    return res.json({
      success: true,
      data: data,
      meta: {
        count: data.length
      }
    });
  } catch (err) {
    console.error("[scrapManagementController.listProcesses] Error:", err);
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
 * GET /api/postgres/scrap-management/scrap-results
 * Scrap Management용 결과 조회

 *  - date_from: 필수 (YYYYMMDD)
 *  - date_to: 필수 (YYYYMMDD)
 *  - plant_cd: 필수
 *  - work_center: 선택
 *  - confirm_status: 선택 (ALL/Confirmed/Not yet confirm)
 */
export async function getScrapResults(req, res) {
  let client;
  try {
    client = await pool.connect();

    // 쿼리 파라미터 추출
    const date_from = typeof req.query.date_from === 'string' ? req.query.date_from.trim() : '';
    const date_to = typeof req.query.date_to === 'string' ? req.query.date_to.trim() : '';
    const plant_cd = typeof req.query.plant_cd === 'string' ? req.query.plant_cd.trim() : '';
    const work_center = typeof req.query.work_center === 'string' ? req.query.work_center.trim() : '';
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
    const results = await scrapReworkConfirmService.getScrapResults(client, {
      date_from,
      date_to,
      plant_cd,
      work_center,
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
    console.error("[scrapManagementController.getScrapResults] Error:", err);
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
 * POST /api/postgres/scrap-management/save
 *
 *  - scrap_items: 필수 (배열)
 *    - plant_cd: 필수
 *    - defect_no: 필수
 *    - scrap_qty: 필수 (number)
 *    - rework_qty: 필수 (number)
 *  - decision_user: 필수
 */
export async function saveScrapData(req, res) {
  let client;
  try {
    client = await pool.connect();

    // 바디 검증
    const { scrap_items, decision_user } = req.body;

    if (!Array.isArray(scrap_items) || scrap_items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SCRAP_ITEMS',
          message: 'scrap_items는 비어있지 않은 배열이어야 합니다',
          details: null
        }
      });
    }

    if (typeof decision_user !== 'string' || decision_user.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DECISION_USER',
          message: 'decision_user가 필요합니다',
          details: null
        }
      });
    }

    // 각 항목 검증
    for (const item of scrap_items) {
      // PK 필드 검증
      if (!item.plant_cd  || !item.defect_no) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SCRAP_ITEM',
            message: 'scrap_items의 각 항목에는 plant_cd,  defect_no가 필요합니다',
            details: null
          }
        });
      }

      // 수량 필드 검증
      if (typeof item.scrap_qty !== 'number' || typeof item.rework_qty !== 'number') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_QUANTITY',
            message: 'scrap_qty와 rework_qty는 숫자여야 합니다',
            details: null
          }
        });
      }

      // 음수 체크
      if (item.scrap_qty < 0 || item.rework_qty < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NEGATIVE_QUANTITY',
            message: 'scrap_qty와 rework_qty는 0 이상이어야 합니다',
            details: null
          }
        });
      }
    }

    // 서비스 호출
    const result = await scrapReworkConfirmService.saveScrapData(client, {
      scrap_items,
      decision_user: decision_user.trim()
    });

    return res.json({
      success: true,
      data: {
        updated_count: result.updated_count
      }
    });
  } catch (err) {
    console.error("[saveScrapData] Error:", err);
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
 * POST /api/postgres/scrap-management/rework-save
 *
 *  - data: 필수 (string) - '202511200001|2,202511180001|3'
 *  - user: 필수 (string) - 사용자 ID
 * 
 */
export async function saveRework(req, res) {
  let client;

  try {
    client = await pool.connect();

    // 바디 검증
    const { data , user } = req.body;
    
    if (typeof data !== 'string' || data.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DATA',
          message: 'data 필드가 필요합니다.',
          details: null
        }
      });
    }

    if (typeof user !== 'string' || user.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_USER',
          message: 'user 필드가 필요합니다.',
          details: null
        }
      });
    }

    // data 형식 검증 
    const items = data.split(',');
    for (const item of items) {
      const parts = item.split('|');
      if (parts.length !== 2) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DATA_FORMAT',
            message: `잘못된 data 형식: ${item}(defect_no|rework_qty 형식 필요)`,
            details: null
          }
        });
      }

      const [defectNo, reworkQty] = parts;

      if (!defectNo || defectNo.trim() === '') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DEFECT_NO',
            message: `defect_no가 비어있습니다: ${item}`,
            details: null
          }
        });
      }

      const qty = Number(reworkQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REWORK_QTY',
            message: `rework_qty는 양수여야 합니다: ${item}`,
            details: null
          }
        });
      }
    }

    // 서비스 호출
    const result = await scrapReworkConfirmService.saveRework(client, {
      data: data.trim(),
      user: user.trim()
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error("[reworkController.saveRework] Error:", err);
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