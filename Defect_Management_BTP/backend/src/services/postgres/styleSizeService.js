// src/services/postgres/styleSizeService.js

import * as styleSizeDao from '../../models/postgres/styleSizeDao.js';

export async function getStyles(client, { plant, workCenter, line }) {
  return styleSizeDao.findStyles(client, { plant, workCenter, line });
}

export async function getSizes(client, { plant, workCenter, line, styleCd }) {
  return styleSizeDao.findSizes(client, { plant, workCenter, line, styleCd });
}

/**
 * 스타일 + 사이즈로 material_code 해상
 * - DAO: findMaterialCodesByStyleSize 사용
 * - 반환 형식:
 *   {
 *     material_codes: string[]; // remain > 0 인 고유 material_code 목록
 *     count: number;            // material_codes.length
 *   }
 */
export async function resolveMaterial(
  client,
  { plant, workCenter, line, styleCd, sizeCd }
) {
  const rows = await styleSizeDao.findMaterialCodesByStyleSize(client, {
    plant,
    workCenter,
    line,
    styleCd,
    sizeCd,
  });

  const materialCodes = rows.map((row) => row.material_code);

  return {
    material_codes: materialCodes,
    count: materialCodes.length,
  };
}
