import pool from "../../models/postgres/pool.js";
import * as defectsService from "../../services/postgres/defectsService.js";
import { validateDistributeBody } from "../../validators/defectsSchema.js";

export async function distribute(req, res) {
  let client;
  try {
    const plant =
      typeof req.query.plant === "string" && req.query.plant.trim() !== ""
        ? req.query.plant.trim()
        : "";

    if (!plant) {
      return res
        .status(400)
        .json({ code: "VALIDATION_ERROR", message: "plant is required" });
    }

    // 바디 검증
    const parsed = validateDistributeBody(req.body);
    if (!parsed.ok) {
      return res
        .status(400)
        .json({ code: "VALIDATION_ERROR", message: parsed.message });
    }

    // PostgreSQL client 생성
    client = await pool.connect();

    const result = await defectsService.distribute(client, {
      plant,
      defect_date: parsed.data.defect_date,
      work_center: parsed.data.work_center,
      line_cd: parsed.data.line_cd,
      material_code: parsed.data.material_code,
      defect_qty: parsed.data.defect_qty,
      defect_form: parsed.data.defect_form,
      machine_cd: parsed.data.machine_cd,
      log: parsed.data.log ?? {},
    });

    // 초과 시: 실제 반영 없이 시뮬레이션 결과만 409로 반환
    if (result.status === "EXCEEDED") {
      return res.status(409).json({
        code: "DEFECT_QTY_EXCEEDED",
        message: "Defect quantity exceeds available capacity.",
        totalRequested: result.totalRequested,
        totalCapacity: result.totalCapacity,
        notAppliedQty: result.notAppliedQty,
        allocations: result.allocations, // would-apply list
      });
    }

    // 정상: 전량 반영됨
    return res.status(200).json({
      totalRequested: result.totalRequested,
      totalApplied: result.totalApplied,
      allocations: result.allocations,
      logs: result.logs,
    });
  } catch (err) {
    if (err?.code === "DEFECT_NO_CONFLICT") {
      return res.status(500).json({
        code: "DEFECT_NO_CONFLICT",
        message: err.message || "defect_no conflict",
      });
    }
    if (err?.code === "DEFECT_QTY_CHANGED") {
      // 시뮬레이션 이후 동시 변경으로 인해 전량 반영 불가 → 초과 규칙과 동일 응답
      return res.status(409).json({
        code: "DEFECT_QTY_EXCEEDED",
        message: "Defect quantity exceeds available capacity.",
        totalRequested: err.totalRequested,
        totalCapacity: err.totalCapacity,
        notAppliedQty: err.notAppliedQty,
        allocations: err.allocations || [],
      });
    }
    console.error("[distribute] error:", err);
    return res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "unexpected error" });
  } finally {
    if (client) {
      client.release();
    }
  }
}
