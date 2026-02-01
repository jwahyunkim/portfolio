// src/controllers/postgres/fgaWorkCenterController.js
// 환경변수는 서버 부팅 시 한 번 로드되어야 합니다(예: server.js에서 dotenv.config()).

import pool from '../../models/postgres/pool.js';
import { getFgaWorkCenters } from '../../services/postgres/fgaWorkCenterService.js';

/**
 * FGA Work Center 옵션 조회
 * GET /api/postgres/work-centers/fga
 *
 * 쿼리 파라미터:
 *  - plant: 없으면 400
 *
 * 응답:
 *  - data: [{ code, name }]
 *  - meta: { count }
 */
export async function listFgaWorkCenters(req, res) {
  let client;

  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PLANT',
          message: 'plant 값이 필요합니다',
          details: null,
        },
      });
    }

    client = await pool.connect();

    const data = await getFgaWorkCenters(client, { plant });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listFgaWorkCenters] error:', err);
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
    if (client) {
      client.release();
    }
  }
}
