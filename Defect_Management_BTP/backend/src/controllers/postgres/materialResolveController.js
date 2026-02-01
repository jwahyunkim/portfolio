// src/controllers/postgres/materialResolveController.js
// 환경변수는 서버 부팅 시 한 번 로드되어야 합니다(예: server.js에서 dotenv.config()).

import pool from '../../models/postgres/pool.js';
import { resolveMaterial as resolveMaterialSvc } from '../../services/postgres/styleSizeService.js';

/**
 * style+size로 material_code 해석
 * GET /api/postgres/materials/resolve
 *
 * 쿼리 파라미터:
 *  - plant       : 필수
 *  - work_center : 필수
 *  - line        : 필수
 *  - style_cd    : 필수
 *  - size_cd     : 필수
 *
 * 응답:
 *  - success: true
 *  - data:
 *      - material_codes: string[]  // remain > 0 인 고유 material_code 목록
 *      - count         : number    // material_codes.length
 *  - meta:
 *      - material_count: number    // 동일 값(count)
 */
export async function resolveMaterial(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';
    const workCenter =
      typeof req.query.work_center === 'string' && req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : '';
    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== ''
        ? req.query.line.trim()
        : '';
    const styleCd =
      typeof req.query.style_cd === 'string' && req.query.style_cd.trim() !== ''
        ? req.query.style_cd.trim()
        : '';
    const sizeCd =
      typeof req.query.size_cd === 'string' && req.query.size_cd.trim() !== ''
        ? req.query.size_cd.trim()
        : '';

    if (!plant || !workCenter || !line || !styleCd || !sizeCd) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'plant, work_center, line, style_cd, size_cd 값이 필요합니다',
          details: null,
        },
      });
    }

    client = await pool.connect();

    // 서비스 호출: remain > 0 조건 내에서 style/size 매칭
    const result = await resolveMaterialSvc(client, {
      plant,
      workCenter,
      line,
      styleCd,
      sizeCd,
    });
    // result: { material_codes: string[], count: number }

    const materialCodes = Array.isArray(result?.material_codes)
      ? result.material_codes
      : [];
    const count =
      typeof result?.count === 'number' ? result.count : materialCodes.length;

    return res.json({
      success: true,
      data: {
        material_codes: materialCodes,
        count,
      },
      meta: {
        material_count: count,
      },
    });
  } catch (err) {
    console.error('[resolveMaterial] error:', err);
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

export default {
  resolveMaterial,
};
