// src/controllers/postgres/dmpdProdOrderController.js
// 환경변수는 서버 부팅 시 한 번 로드되어야 합니다(예: server.js에서 dotenv.config()).
import pool from '../../models/postgres/pool.js';

import {
  ALLOWED_COLUMNS,
  queryDmpdProdOrderAgg,
  queryDmpdProdOrderOptions,
  queryDmpdProdOrderComponents,
} from '../../models/postgres/dmpdProdOrderDao.js';
import {
  getWorkCenters,
  getLines,
  getMachines,
  getMaterials,
  getComponents,
  getPlants,
  resolveMaterial,
} from '../../services/postgres/dmpdProdOrderService.js';

// 반환 필드 화이트리스트(집계 응답에서 선택 가능)
const PROJECTION_WHITELIST = [
  'material_code',
  'sum_order_qty',
  'sum_dcf_good_qty',
  'sum_dcf_defect_qty',
  'sum_dcf_return_qty',
  'sum_dcf_labtest_qty',
  'remain',
  'order_number',
  'zcf_work_date',
  'zcf_seq',
  'zcf_mcs_cd',
  'zcf_mcs_color_cd',
  'components', // 컴포넌트 정보
];

/**
 * Plant 옵션 조회
 * GET /api/postgres/plants
 */
export async function listPlants(req, res) {
  let client;
  try {
    const workCenter =
      typeof req.query.work_center === 'string' && req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : null;

    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== ''
        ? req.query.line.trim()
        : null;

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : null;

    client = await pool.connect();

    const data = await getPlants(client, {
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
    console.error('[listPlants] error:', err);
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

/**
 * Work Center 옵션 조회
 * GET /api/postgres/work-centers
 */
export async function listWorkCenters(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }

    const codeClassCd =
      typeof req.query.code_class_cd === 'string' &&
        req.query.code_class_cd.trim() !== ''
        ? req.query.code_class_cd.trim()
        : null;

    if (!codeClassCd) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CODE_CLASS_CD',
          message: 'code_class_cd 값이 필요합니다',
          details: null,
        },
      });
    }

    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== ''
        ? req.query.line.trim()
        : null;

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : null;

    client = await pool.connect();

    const data = await getWorkCenters(client, {
      plant,
      codeClassCd,
      line,
      materialCode,
    });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listWorkCenters] error:', err);
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

/**
 * Line 옵션 조회
 * GET /api/postgres/lines
 */
export async function listLines(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }

    const workCenter =
      typeof req.query.work_center === 'string' &&
        req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : null;

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : null;

    client = await pool.connect();

    const data = await getLines(client, {
      plant,
      workCenter,
      materialCode,
    });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listLines] error:', err);
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

/**
 * Machine 옵션 조회
 * GET /api/postgres/machines
 */
export async function listMachines(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }

    const workCenter =
      typeof req.query.work_center === 'string' &&
        req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : null;

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : null;

    client = await pool.connect();

    const data = await getMachines(client, {
      plant,
      workCenter,
      materialCode,
    });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listMachine] error:', err);
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

/**
 * Material 옵션 조회 (remain > 0)
 * GET /api/postgres/materials
 * 쿼리: plant(필수), work_center(선택), line(선택), style_cd(선택), size_cd(선택)
 * 반환 필드: material_code, material_name, zcf_mcs_cd, zcf_mcs_color_nm, zcf_style_cd, zcf_style_nm, zcf_size_cd
 */
export async function listMaterials(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }

    const workCenter =
      typeof req.query.work_center === 'string' && req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : null;

    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== ''
        ? req.query.line.trim()
        : null;

    const styleCd =
      typeof req.query.style_cd === 'string' && req.query.style_cd.trim() !== ''
        ? req.query.style_cd.trim()
        : null;

    const sizeCd =
      typeof req.query.size_cd === 'string' && req.query.size_cd.trim() !== ''
        ? req.query.size_cd.trim()
        : null;

    client = await pool.connect();

    const data = await getMaterials(client, {
      plant,
      workCenter,
      line,
      styleCd,
      sizeCd,
    });

    return res.json({
      success: true,
      data,
      meta: { count: data.length },
    });
  } catch (err) {
    console.error('[listMaterials] error:', err);
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
 * GET /api/postgres/materials/resolve
 * 쿼리: plant, work_center, line, style_cd, size_cd (모두 필수)
 * 응답:
 *  - 단일: { success: true, data: { material_code } }
 *  - 다건: { success: false, error: { code: 'AMBIGUOUS_MATERIAL', candidates: [] } }
 *  - 0건 : { success: false, error: { code: 'NOT_FOUND' } }
 */
export async function resolveMaterialController(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== '' ? req.query.plant.trim() : '';
    const workCenter =
      typeof req.query.work_center === 'string' && req.query.work_center.trim() !== '' ? req.query.work_center.trim() : '';
    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== '' ? req.query.line.trim() : '';
    const styleCd =
      typeof req.query.style_cd === 'string' && req.query.style_cd.trim() !== '' ? req.query.style_cd.trim() : '';
    const sizeCd =
      typeof req.query.size_cd === 'string' && req.query.size_cd.trim() !== '' ? req.query.size_cd.trim() : '';

    if (!plant || !workCenter || !line || !styleCd || !sizeCd) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAMS', message: 'plant, work_center, line, style_cd, size_cd 값이 필요합니다', details: null },
      });
    }

    client = await pool.connect();
    const materials = await resolveMaterial(client, { plant, workCenter, line, styleCd, sizeCd });

    if (materials.length === 1) {
      return res.json({ success: true, data: { material_code: materials[0] } });
    }
    if (materials.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '매칭되는 material 없음' } });
    }
    // 2건 이상
    return res.status(409).json({
      success: false,
      error: { code: 'AMBIGUOUS_MATERIAL', message: '여러 material이 매칭됨', candidates: materials },
    });
  } catch (err) {
    console.error('[resolveMaterialController] error:', err);
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
 * Components 옵션/집계 조회
 * GET /api/postgres/components
 */
export async function listComponents(req, res) {
  let client;
  try {
    const defaultLimit = Number.parseInt(process.env.DEFAULT_LIMIT, 10) || 5000;

    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }

    const workCenter =
      typeof req.query.work_center === 'string' &&
        req.query.work_center.trim() !== ''
        ? req.query.work_center.trim()
        : null;

    const line =
      typeof req.query.line === 'string' && req.query.line.trim() !== ''
        ? req.query.line.trim()
        : null;

    const materialCode =
      typeof req.query.material_code === 'string' &&
        req.query.material_code.trim() !== ''
        ? req.query.material_code.trim()
        : null;

    // 비즈니스 룰 상 필수: material_code
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

    const limitQ = req.query.limit;
    let limit = Number.parseInt(limitQ, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
    if (limit > 5000) limit = 5000;

    client = await pool.connect();

    const compRows = await getComponents(client, {
      plant,
      workCenter,
      line,
      materialCode,
      limit,
    });

    const data = compRows.map((row) => ({
      parent_order_number: row.parent_order_number,
      material_code: row.material_code,
      order_numbers: row.order_numbers,
      po_ids: row.po_ids,
      aps_ids: row.aps_ids,
      remain: row.remain,
    }));

    return res.json({
      success: true,
      data,
      meta: { count: data.length, limit },
    });
  } catch (err) {
    console.error('[listComponents] error:', err);
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

/**
 * GET /api/postgres/dmpd-prod-order
 * 응답은 "집계형 + 옵션" 구조
 */
export async function list(req, res) {
  let client;
  try {
    const defaultLimit = Number.parseInt(process.env.DEFAULT_LIMIT, 10) || 5000;

    const plant =
      typeof req.query.plant === 'string' && req.query.plant.trim() !== ''
        ? req.query.plant.trim()
        : '';

    if (!plant) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLANT', message: 'plant 값이 필요합니다', details: null },
      });
    }

    // 쿼리 파라미터 정리(fields 분리)
    const { limit: limitQ, fields: fieldsQ, ...rawFilters } = req.query;

    // limit 파싱 및 캡(상한 5000)
    let limit = Number.parseInt(limitQ, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
    if (limit > 5000) limit = 5000;

    // 필터: 화이트리스트 컬럼만 채택, plant는 별도 처리
    const filters = {};
    for (const [k, v] of Object.entries(rawFilters)) {
      if (k === 'plant') continue;
      if (!ALLOWED_COLUMNS.includes(k)) continue;
      if (v === undefined) continue;
      filters[k] = v;
    }

    // fields 파싱
    let rawFields = [];
    if (typeof fieldsQ === 'string') {
      rawFields = fieldsQ
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(fieldsQ)) {
      rawFields = fieldsQ
        .flatMap((s) => (typeof s === 'string' ? s.split(',') : []))
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // components 필요 여부
    const needComponents = rawFields.includes('components');

    const requestedFields = rawFields;

    const projection = [];
    for (const f of requestedFields) {
      if (PROJECTION_WHITELIST.includes(f) && !projection.includes(f)) {
        projection.push(f);
      }
    }

    client = await pool.connect();

    // 집계 데이터 + 옵션 동시 조회
    const [dataRaw, options] = await Promise.all([
      queryDmpdProdOrderAgg(client, { plant, filters, limit }),
      queryDmpdProdOrderOptions(client, { plant, filters }),
    ]);

    // components 병합 여부 결정
    let enriched = dataRaw;

    if (needComponents && dataRaw.length > 0) {
      const parentOrderNumbers = dataRaw
        .map((row) => row.order_number)
        .filter((v) => typeof v === 'string' && v.trim() !== '');

      if (parentOrderNumbers.length > 0) {
        const compRows = await queryDmpdProdOrderComponents(client, {
          plant,
          parentOrderNumbers,
        });

        // parent_order_number -> components[]
        const compMap = new Map();
        for (const row of compRows) {
          const parent = row.parent_order_number;
          if (!compMap.has(parent)) compMap.set(parent, []);
          compMap.get(parent).push({
            material_code: row.material_code,
            order_numbers: row.order_numbers,
            po_ids: row.po_ids,
            aps_ids: row.aps_ids,
            remain: row.remain,
          });
        }

        enriched = dataRaw.map((row) => ({
          ...row,
          components: compMap.get(row.order_number) ?? [],
        }));
      } else {
        enriched = dataRaw.map((row) => ({
          ...row,
          components: [],
        }));
      }
    }

    // 프로젝션 적용
    const base = enriched;

    const data =
      projection.length > 0
        ? base.map((row) => {
            const out = {};
            for (const key of PROJECTION_WHITELIST) {
              if (!projection.includes(key)) continue;
              out[key] = row[key];
            }
            return out;
          })
        : base;

    return res.json({
      success: true,
      data,
      options,
      meta: { count: data.length, limit, sort_by: 'material_code' },
    });
  } catch (err) {
    console.error('[list] error:', err);
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
