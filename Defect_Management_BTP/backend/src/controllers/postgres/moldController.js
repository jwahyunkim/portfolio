// src/controllers/postgres/moldController.js
// 환경변수는 서버 부팅 시 한 번 로드되어야 합니다(예: server.js에서 dotenv.config()).

import pool from '../../models/postgres/pool.js';
import { getMoldCodes, getMoldSizes } from '../../services/postgres/moldService.js';


/**
 * Mold Code 옵션 조회
 * GET /api/postgres/molds/codes
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
export async function listMoldCodes(req, res) {
  let client;

  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    const workCenter =
      typeof req.query.work_center === 'string' &&
        req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : '';

    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== ''
        ? req.query.line.trim()
        : '';

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }
    if (!workCenter) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_WORK_CENTER', message: 'work_center 값이 필요합니다', details: null },
      });
    }
    if (!line) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_LINE', message: 'line 값이 필요합니다', details: null },
      });
    }
    if (!materialCode) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MATERIAL_CODE', message: 'material_code 값이 필요합니다', details: null },
      });
    }

    client = await pool.connect();

    const data = await getMoldCodes(client, {
      plant,
      workCenter,
      line,
      materialCode,
    });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listMoldCodes] error:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류',
        details:
          process.env.NODE_ENV === 'development'
            ? String(err?.message || err)
            : null,
      },
    });
  } finally {
    if (client) client.release();
  }
}

/**
 * Mold Size 옵션 조회
 * GET /api/postgres/molds/sizes
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
export async function listMoldSizes(req, res) {
  let client;

  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    const workCenter =
      typeof req.query.work_center === 'string' &&
        req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : '';

    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== ''
        ? req.query.line.trim()
        : '';

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : '';

    const moldCode =
      typeof req.query.mold_code === 'string' &&
        req.query.mold_code.trim() !== ''
        ? req.query.mold_code.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }
    if (!workCenter) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_WORK_CENTER', message: 'work_center 값이 필요합니다', details: null },
      });
    }
    if (!line) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_LINE', message: 'line 값이 필요합니다', details: null },
      });
    }
    if (!materialCode) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MATERIAL_CODE', message: 'material_code 값이 필요합니다', details: null },
      });
    }
    if (!moldCode) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MOLD_CODE', message: 'mold_code 값이 필요합니다', details: null },
      });
    }

    client = await pool.connect();

    const data = await getMoldSizes(client, {
      plant,
      workCenter,
      line,
      materialCode,
      moldCode,
    });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listMoldSizes] error:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류',
        details:
          process.env.NODE_ENV === 'development'
            ? String(err?.message || err)
            : null,
      },
    });
  } finally {
    if (client) client.release();
  }
}
