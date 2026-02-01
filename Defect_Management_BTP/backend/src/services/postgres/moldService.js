// src/services/postgres/moldService.js

import * as moldDao from '../../models/postgres/moldDao.js';


/**
 * Mold Code 옵션 조회 (service)
 */
export async function getMoldCodes(
  client,
  { plant, workCenter, line, materialCode }
) {
  return moldDao.findMoldCodes(client, { plant, workCenter, line, materialCode });
}

/**
 * Mold Size 옵션 조회 (service)
 */
export async function getMoldSizes(
  client,
  { plant, workCenter, line, materialCode, moldCode }
) {
  return moldDao.findMoldSizes(client, {
    plant,
    workCenter,
    line,
    materialCode,
    moldCode,
  });
}
