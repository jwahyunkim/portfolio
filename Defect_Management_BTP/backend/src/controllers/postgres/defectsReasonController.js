// src/controllers/postgres/defectsReasonController.js
// 환경변수는 서버 부팅 시 한 번 로드되어야 합니다(예: server.js에서 dotenv.config()).

import pool from '../../models/postgres/pool.js';
import { getDefectReasons } from '../../services/postgres/defectsReasonService.js';

/**
 * Defect Reason 옵션 조회
 * GET /api/postgres/defects/reason
 *
 * 쿼리 파라미터:
 *  - plant_cd      : 필수
 *  - material_code : 필수
 *
 * 응답:
 *  - data: [{ value, label }]
 *  - meta: { count }
 */
export async function listDefectReasons(req, res) {
  let client;

  try {
    const plantCd =
      typeof req.query.plant_cd === 'string' && req.query.plant_cd.trim() !== ''
        ? req.query.plant_cd.trim()
        : '';

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : '';

    if (!plantCd) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PLANT_CD',
          message: 'plant_cd 값이 필요합니다',
          details: null,
        },
      });
    }

    if (!materialCode) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_MATERIAL_CODE',
          message: 'material_code 값이 필요합니다',
          details: null,
        },
      });
    }

    client = await pool.connect();

    const data = await getDefectReasons(client, {
      plantCd,
      materialCode,
    });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listDefectReasons] error:', err);
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
