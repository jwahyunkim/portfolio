// src/services/postgres/defectsReasonService.js

import * as defectsReasonDao from '../../models/postgres/defectsReasonDao.js';

/**
 * Defect Reason 옵션 조회 (service)
 */
export async function getDefectReasons(client, { plantCd, materialCode }) {
  return defectsReasonDao.findDefectReasons(client, { plantCd, materialCode });
}
