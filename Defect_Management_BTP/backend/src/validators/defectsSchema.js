// src/validators/defectsSchema.js

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function hasAtMost3Decimals(n) {
  const s = n.toString();
  const idx = s.indexOf(".");
  if (idx === -1) return true;
  return s.length - idx - 1 <= 3;
}

export function validateDistributeBody(body) {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "invalid body" };
  }

  const defect_date =
    typeof body.defect_date === "string" && body.defect_date.trim() !== ""
      ? body.defect_date.trim()
      : null;

  if (!defect_date) return { ok: false, message: "defect_date is required" };
  if (!/^\d{8}$/.test(defect_date)) {
    return { ok: false, message: "defect_date must be YYYYMMDD" };
  }

  const work_center =
    typeof body.work_center === "string" && body.work_center.trim() !== ""
      ? body.work_center.trim()
      : null;
  const line_cd =
    typeof body.line_cd === "string" && body.line_cd.trim() !== ""
      ? body.line_cd.trim()
      : null;
  const material_code =
    typeof body.material_code === "string" &&
    body.material_code.trim() !== ""
      ? body.material_code.trim()
      : null;

  if (!work_center)
    return { ok: false, message: "work_center is required" };
  if (!line_cd) return { ok: false, message: "line_cd is required" };
  if (!material_code)
    return { ok: false, message: "material_code is required" };

  let defect_qty = body.defect_qty;
  if (typeof defect_qty === "string" && defect_qty.trim() !== "") {
    const num = Number(defect_qty);
    defect_qty = Number.isFinite(num) ? num : NaN;
  }
  if (!isFiniteNumber(defect_qty)) {
    return { ok: false, message: "defect_qty must be a number" };
  }
  if (defect_qty <= 0) {
    return { ok: false, message: "defect_qty must be > 0" };
  }
  if (!hasAtMost3Decimals(defect_qty)) {
    return {
      ok: false,
      message: "defect_qty must have at most 3 decimals",
    };
  }

  let defect_form = body.defect_form;
  if (defect_form == null || String(defect_form).trim() === "") {
    defect_form = "###";
  }
  defect_form = String(defect_form).trim();
  if (defect_form.length > 10) {
    return {
      ok: false,
      message: "defect_form length must be <= 10",
    };
  }

  const rawLog = typeof body.log === "object" && body.log !== null ? body.log : null;

  if (!rawLog) {
    return { ok: false, message: "log is required" };
  }

  // defect_decision 검증 제거
  let decision;
  if (rawLog.defect_decision != null) {
    decision = String(rawLog.defect_decision).trim().toUpperCase();
    if (decision !== "S" && decision !== "R" && decision !== "Q") {
      return {
        ok: false,
        message: "defect_decision must be 'S' or 'R' or 'Q' if provided",
      };
    }
  }

  const log = {
    ...rawLog,
    defect_decision: decision, // 있으면 'S' 또는 'R', 없으면 undefined
  };

  return {
    ok: true,
    data: {
      defect_date,
      work_center,
      line_cd,
      material_code,
      defect_qty: Number(defect_qty),
      defect_form,
      log,
    },
  };
}
