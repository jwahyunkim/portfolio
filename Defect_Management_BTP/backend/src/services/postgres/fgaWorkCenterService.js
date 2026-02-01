// src/services/postgres/fgaWorkCenterService.js

import * as fgaWorkCenterDao from '../../models/postgres/fgaWorkCenterDao.js';

/**
 * FGA Work Center 옵션 조회 (service)
 */
export async function getFgaWorkCenters(client, { plant }) {
  return fgaWorkCenterDao.findFgaWorkCenters(client, { plant });
}
