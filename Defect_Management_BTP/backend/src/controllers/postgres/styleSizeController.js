// src/controllers/postgres/styleSizeController.js
// 환경변수는 서버 부팅 시 한 번 로드되어야 합니다(예: server.js에서 dotenv.config()).

import pool from '../../models/postgres/pool.js';
import { getStyles, getSizes } from '../../services/postgres/styleSizeService.js';

/**
 * 스타일 옵션 조회
 * GET /api/postgres/styles
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *
 * 응답:
 *  - data: [{ style_cd, style_nm, material_count }]
 *  - meta: { count }
 */
export async function listStyles(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== '' ? req.query.plant.trim() : '';
    const workCenter =
      typeof req.query.work_center === 'string' && req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : '';
    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== '' ? req.query.line.trim() : '';

    if (!plant || !workCenter || !line) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'plant, work_center, line 값이 필요합니다',
          details: null,
        },
      });
    }

    client = await pool.connect();

    const rows = await getStyles(client, { plant, workCenter, line });

    // style_nm NULL → '' 처리
    const data = rows.map((r) => ({
      style_cd: r.style_cd,
      style_nm: r.style_nm ?? '',
      material_count: Number(r.material_count ?? 0),
    }));

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listStyles] error:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류',
        details: process.env.NODE_ENV === 'development' ? String(err?.message || err) : null,
      },
    });
  } finally {
    if (client) client.release();
  }
}

/**
 * 사이즈 옵션 조회
 * GET /api/postgres/sizes
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *  - style_cd    : 필수
 *
 * 응답:
 *  - data: [{ size_cd, material_count }]
 *  - meta: { count }
 */
export async function listSizes(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== '' ? req.query.plant.trim() : '';
    const workCenter =
      typeof req.query.work_center === 'string' && req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : '';
    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== '' ? req.query.line.trim() : '';
    const styleCd =
      typeof req.query.style_cd === 'string' && req.query.style_cd.trim() !== ''
        ? req.query.style_cd.trim()
        : '';

    if (!plant || !workCenter || !line || !styleCd) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'plant, work_center, line, style_cd 값이 필요합니다',
          details: null,
        },
      });
    }

    client = await pool.connect();

    const rows = await getSizes(client, { plant, workCenter, line, styleCd });

    const data = rows.map((r) => ({
      size_cd: r.size_cd,
      material_count: Number(r.material_count ?? 0),
    }));

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listSizes] error:', err);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '서버 오류',
        details: process.env.NODE_ENV === 'development' ? String(err?.message || err) : null,
      },
    });
  } finally {
    if (client) client.release();
  }
}

export default {
  listStyles,
  listSizes,
};
