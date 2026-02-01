// src/services/sap-s4hana/scrapStoService.js
import { putDmScrapSto as putDmScrapStoDao } from "../../models/sap/scrapStoOdataDao.js";
import * as scrapStoDao from "../../models/postgres/scrapStoDao.js";
import { nowSeoul, todayYYYYMMDD, toYYYYMMDDDash } from "../../utils/time.js";

function normalizeString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeProcType(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeDate(value, fallback) {
  const raw = value !== undefined && value !== null ? value : fallback;
  const s = normalizeString(raw);
  if (!s) return "";
  return toYYYYMMDDDash(s);
}

function normalizeQty(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function isTruthy(value) {
  if (value === true) return true;
  const s = normalizeString(value).toLowerCase();
  return s === "true" || s === "y" || s === "1";
}

function buildValidationError(details) {
  const err = new Error("Invalid scrap STO input");
  err.code = "VALIDATION_ERROR";
  err.details = details;
  return err;
}

export async function putDmScrapSto(client, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw buildValidationError([
      { index: 0, field: "IT_INPUT", message: "IT_INPUT must be a non-empty array" },
    ]);
  }

  const defectNos = items.map((item) => normalizeString(item?.defectno)).filter(Boolean);
  if (defectNos.length !== items.length) {
    throw buildValidationError([
      { index: 0, field: "defectno", message: "defectno is required for all items" },
    ]);
  }

  const rows = await scrapStoDao.findDefectResultsByDefectNos(client, defectNos);
  const rowMap = new Map(
    rows.map((row) => [normalizeString(row.defect_no), row]),
  );

  const todayDash = toYYYYMMDDDash(todayYYYYMMDD(nowSeoul()));
  const stLocPlantCd = "-";
  const defaultMeins =
    normalizeString(process.env.SAP_SCRAP_STO_MEINS || "PR") || "PR";
  const stLocCache = new Map();

  async function resolveStorageLocation(plantCode) {
    const key = normalizeString(plantCode);
    if (!key) return { value_1: "", value_2: "" };
    if (stLocCache.has(key)) {
      return stLocCache.get(key);
    }
    const lookupPlantCd = stLocPlantCd;
    const values = await scrapStoDao.findStorageLocation(client, {
      plant_cd: lookupPlantCd,
      sub_code: key,
    });
    const normalized = {
      value_1 : normalizeString(values?.value_1 || ""),
      value_2 : normalizeString(values?.value_2 || "")
    }
    stLocCache.set(key, normalized);
    return normalized;
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i] ?? {};
    const defectno = normalizeString(item.defectno);
    const row = rowMap.get(defectno);

    if (!row) {
      errors.push({
        index: i,
        field: "defectno",
        message: `defectno not found in dmqm_defect_result: ${defectno}`,
      });
      continue;
    }

    const inputProcType = normalizeString(item.proctype);
    const proctype = normalizeProcType(row.defect_decision || inputProcType);
    if (proctype !== "S" && proctype !== "R") {
      errors.push({
        index: i,
        field: "proctype",
        message: "proctype must be 'S' or 'R'",
      });
      continue;
    }

    const hasPrevPlant = normalizeString(row.prev_plant_cd);
    const hasComponent = normalizeString(row.component_code);
    const usePrevValues =
      isTruthy(item.use_prev) || (proctype === "R" && hasPrevPlant && hasComponent);

    // defect_decision 기반 from/to 분기
    // [Confirm Page S] 
    //    - (defect_decision='S'): plant_cd(to) -> plant_cd(from)
    //    - Igort : value_1
    //    - umlgo : value_2
    // - Scrap Page S (defect_decision='R'): prev_plant_cd(to) -> prev_plant_cd(from)
    // [Confirm Page R] 
    //    - (defect_decision='R'): plant_cd(to) → prev_plant_cd(from)
    //    - Igort : value_1 (plant_cd)
    //    - umlgo : value_1 (prev_plant_cd)
    const defectDecision = normalizeString(row.defect_decision).toUpperCase();

    let fromPlant, toPlant;



    if (proctype === "S" && defectDecision === "S") {
      fromPlant = normalizeString(row.plant_cd);
      toPlant = fromPlant;
    } else if (proctype === "S" && defectDecision === "R") {
      fromPlant = hasPrevPlant || normalizeString(row.plant_cd);
      toPlant = fromPlant;
    } else if (proctype === "R") {
      fromPlant = normalizeString(row.plant_cd);
      toPlant = hasPrevPlant || fromPlant;
    } else {
      // 실패시 fallback
      fromPlant = normalizeString(row.plant_cd);
      toPlant = fromPlant;
    }

    const computedQty =
      proctype === "S" && row.scrap_qty !== null && row.scrap_qty !== undefined
        ? row.scrap_qty
        : row.defect_qty;

    // ST 조회
    const fromStLoc = await resolveStorageLocation(fromPlant);
    const toStLoc = await resolveStorageLocation(toPlant);

    let lgort, umlgo;

    if (proctype === "S") {
      // Confirm 페이지의 Scrap 의 경우 Igort = value_1, umlgo = value_2
      lgort = fromStLoc.value_1;
      umlgo = fromStLoc.value_2;
    } else {
      // 나머지 경우 (Confrim 페이지의 Return -> Return에 대한 Scrap rework) value 1
      lgort = fromStLoc.value_1;
      umlgo = toStLoc.value_1;
    }

    const computed = {
      budat: todayDash,
      bldat: todayDash,
      poid: usePrevValues ? row.prev_po_id : row.po_id,
      apsid: usePrevValues ? row.prev_aps_id : row.aps_id,
      matnr: usePrevValues ? row.component_code : row.material_code,
      werks: fromPlant,
      umwrk: toPlant,
      menge: computedQty,
      meins: defaultMeins,
      lgort: lgort,
      umlgo: umlgo,
    };

    const output = {
      defectno,
      proctype,
      budat: normalizeDate(item.budat, computed.budat),
      bldat: normalizeDate(item.bldat, computed.bldat),
      poid: normalizeString(item.poid) || normalizeString(computed.poid),
      apsid: normalizeString(item.apsid) || normalizeString(computed.apsid),
      matnr: normalizeString(item.matnr) || normalizeString(computed.matnr),
      werks: normalizeString(item.werks) || normalizeString(computed.werks),
      lgort: normalizeString(item.lgort) || normalizeString(computed.lgort),
      umwrk: normalizeString(item.umwrk) || normalizeString(computed.umwrk),
      umlgo: normalizeString(item.umlgo) || normalizeString(computed.umlgo),
      menge: normalizeQty(item.menge) ?? normalizeQty(computed.menge),
      meins: normalizeString(item.meins) || normalizeString(computed.meins),
    };

    const requiredFields = [
      "defectno",
      "proctype",
      "budat",
      "bldat",
      "poid",
      "matnr",
      "werks",
      "lgort",
      "umwrk",
      "umlgo",
      "meins",
    ];

    const missing = requiredFields.filter((key) => isMissing(output[key]));
    if (missing.length > 0) {
      errors.push({
        index: i,
        defectno,
        field: missing.join(","),
        message: "required field(s) missing after mapping",
      });
      continue;
    }

    if (!Number.isFinite(output.menge) || output.menge <= 0) {
      errors.push({
        index: i,
        defectno,
        field: "menge",
        message: "menge must be a positive number",
      });
      continue;
    }

    results.push(output);
  }

  if (errors.length > 0) {
    console.error(
      "[putDmScrapSto] validation errors:\n",
      JSON.stringify(errors, null, 2),
    );
    throw buildValidationError(errors);
  }

  const payload = { IT_INPUT: results };
  console.log(
    "[putDmScrapSto] mapped OData payload:\n",
    JSON.stringify(payload, null, 2),
  );
  return putDmScrapStoDao(payload);
}

export default {
  putDmScrapSto,
};
