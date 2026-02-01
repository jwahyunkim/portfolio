// src/services/sap-s4hana/moldSerialService.js
import { fetchMoldSerial } from "../../models/sap/moldOdataDao.js";

/**
 * SAP S/4HANA OData에서 ZZ_MO_SERIAL 조회 (service)
 */
export async function getMoldSerial({ plant, mold_code, mold_size }) {
  return fetchMoldSerial({ plant, mold_code, mold_size });
}

// 일부 런타임/번들링에서 named export가 비는 케이스 방어용(default도 제공)
export default {
  getMoldSerial,
};
