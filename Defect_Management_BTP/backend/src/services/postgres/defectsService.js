// defectsService.js
import * as dao from "../../models/postgres/defectsDao.js";
import { buildDefectNo } from "../../utils/defectNo.js";

/**
 * 시뮬레이션: 실제 UPDATE/INSERT 없이 배분 가능 용량(capacity)과 가상 allocations 계산
 */
async function simulateAllocations(
  client,
  { plant, work_center, line_cd, material_code, defect_qty },
) {
  let remaining = Number(defect_qty);
  const pageSize = 200;
  let page = 0;

  const allocations = [];
  let totalCapacity = 0;

  while (remaining > 0) {
    const candidates = await dao.getCandidates(client, {
      plant,
      work_center,
      line_cd,
      material_code,
      limit: pageSize,
      offset: page * pageSize,
    });

    if (candidates.length === 0) break;

    for (const row of candidates) {
      if (remaining <= 0) break;

      const ordered = Number(row.order_qty ?? 0);
      const gr = Number(row.dcf_good_qty ?? 0);
      const defected = Number(row.dcf_defect_qty ?? 0);
      const returned = Number(row.dcf_return_qty ?? 0);
      const labtest = Number(row.dcf_labtest_qty ?? 0);
      const remain = ordered - gr - defected - returned - labtest;
      if (remain <= 0) continue;

      const wouldApply = Math.min(remain, remaining);
      allocations.push({
        order_number: row.order_number,
        applicable_qty: Number(wouldApply),
        remain_after: remain - Number(wouldApply),
      });

      totalCapacity += Number(wouldApply);
      remaining -= Number(wouldApply);
    }

    page += 1;
  }

  const notAppliedQty = Math.max(0, Number(defect_qty) - totalCapacity);

  return {
    totalCapacity,
    notAppliedQty,
    allocations, // 가상 배분 내역
  };
}

/**
 * 실제 반영: UPDATE a + INSERT b
 * - 전량 반영을 목표로 시뮬레이션과 동일한 기준으로 진행
 * - 동시성 변화로 전량 불가 시 "DEFECT_QTY_CHANGED" 에러 throw (컨트롤러에서 409로 매핑)
 */
async function applyAllocations(
  client,
  {
    plant,
    work_center,
    line_cd,
    material_code,
    defect_qty,
    defect_form,
    defect_date,
    log,
    machine_cd,
  },
) {
  let remainingToApply = Number(defect_qty);
  const pageSize = 200;
  let page = 0;

  const allocations = [];
  const logs = [];

  // defect_decision에 따라 업데이트 대상 컬럼 결정
  const decision =
    log && typeof log.defect_decision === "string"
      ? log.defect_decision
      : undefined;
  const isReturn = decision === "R";
  const mode = isReturn ? "RETURN" : "DEFECT"; // 기본은 불량(S)

  async function resolvePrevIds(parentOrderNumber) {
    if (!isReturn || !log?.component_code) {
      return { prev_po_id: null, prev_aps_id: null, prev_plant_cd: null };
    }

    const componentOrderNumber = await dao.getComponentOrderNumber(client, {
      plant,
      parent_order_number: parentOrderNumber,
      component_code: log.component_code,
    });

    if (!componentOrderNumber) {
      return { prev_po_id: null, prev_aps_id: null, prev_plant_cd: null };
    }

    const prev = await dao.getComponentPrevIds(client, {
      plant,
      component_order_number: componentOrderNumber,
    });
    return {
      prev_po_id: prev?.prev_po_id ?? null,
      prev_aps_id: prev?.prev_aps_id ?? null,
      prev_plant_cd: prev?.prev_plant_cd ?? null,
    };
  }

  while (remainingToApply > 0) {
    const candidates = await dao.getCandidates(client, {
      plant,
      work_center,
      line_cd,
      material_code,
      limit: pageSize,
      offset: page * pageSize,
    });

    if (candidates.length === 0) break;

    for (const row of candidates) {
      if (remainingToApply <= 0) break;

      // 현재 잔여 재계산
      const ordered = Number(row.order_qty ?? 0);
      const gr = Number(row.dcf_good_qty ?? 0);
      const defected = Number(row.dcf_defect_qty ?? 0);
      const returned = Number(row.dcf_return_qty ?? 0);
      const labtest = Number(row.dcf_labtest_qty ?? 0);
      const remain = ordered - gr - defected - returned - labtest;
      if (remain <= 0) continue;

      const alloc = Math.min(remain, remainingToApply);

      // 잔여 조건 포함 UPDATE 시도
      const updated = await dao.applyDefectToOrder(client, {
        plant,
        order_number: row.order_number,
        applyQty: alloc,
        mode,
      });

      if (updated === 0) {
        // 경합 등으로 잔여 소진 → 최신 값으로 한 번 더 시도
        const fresh = await dao.getOrderForUpdateCalc(client, {
          plant,
          order_number: row.order_number,
        });
        if (!fresh) continue;

        const freshOrdered = Number(fresh.order_qty ?? 0);
        const freshGr = Number(fresh.dcf_good_qty ?? 0);
        const freshDefected = Number(fresh.dcf_defect_qty ?? 0);
        const freshReturned = Number(fresh.dcf_return_qty ?? 0);
        const freshLabtest = Number(fresh.dcf_labtest_qty ?? 0);

        const freshRemain =
          freshOrdered - freshGr - freshDefected - freshReturned - freshLabtest;

        if (freshRemain <= 0) continue;

        const retryAlloc = Math.min(freshRemain, remainingToApply);
        const retried = await dao.applyDefectToOrder(client, {
          plant,
          order_number: row.order_number,
          applyQty: retryAlloc,
          mode,
        });
        if (retried === 0) continue;

        // 로그 생성 (실제 반영에만)
        const yyyymmdd = defect_date;
        const { yyyymmdd: defect_no_yyyymmdd, seq } =
          await dao.getNextDefectNoParts(client);
        const defect_no = buildDefectNo(defect_no_yyyymmdd, seq);

        const logRow = {
          plant_cd: plant,
          defect_form,
          defect_no,
          defect_date: yyyymmdd,
          work_center,
          line_cd,
          machine_cd: machine_cd ?? null,
          material_code,
          component_code: log?.component_code ?? null,
          division: log?.division ?? null,
          defect_qty: retryAlloc,
          defect_type: log?.defect_type ?? null,
          defect_decision: log?.defect_decision ?? null,
          defect_source: log?.defect_source ?? null,
          defect_check: log?.defect_check ?? null,
          mold_code: log?.mold_code ?? null,
          mold_size: log?.mold_size ?? null,
          mold_set: log?.mold_set ?? null,
          mold_id: log?.mold_id ?? null,
          obs_nu: log?.obs_nu ?? null,
          obs_seq_nu: log?.obs_seq_nu ?? null,
          order_number: row.order_number,
          po_id: fresh.po_id ?? row.po_id ?? null,
          aps_id: fresh.aps_id ?? row.aps_id ?? null,
          ...(await resolvePrevIds(row.order_number)),
          creator: null,
          create_dt: null, // DB default NOW()
          create_pc: null,
        };

        try {
          await dao.insertDefectLog(client, logRow);
        } catch (e) {
          if (e?.code === "23505") {
            throw {
              code: "DEFECT_NO_CONFLICT",
              message: "defect_no unique conflict",
            };
          }
          throw e;
        }

        allocations.push({
          order_number: row.order_number,
          applicable_qty: Number(retryAlloc),
          remain_after:
            freshOrdered -
            freshGr -
            (freshDefected + Number(retryAlloc)) -
            freshReturned -
            freshLabtest,
        });

        logs.push({
          defect_no,
          order_number: row.order_number,
          defect_qty: Number(retryAlloc),
        });

        remainingToApply -= Number(retryAlloc);
        continue;
      }

      // 최초 시도 성공 분
      const yyyymmdd = defect_date;
      const { yyyymmdd: defect_no_yyyymmdd, seq } =
        await dao.getNextDefectNoParts(client);
      const defect_no = buildDefectNo(defect_no_yyyymmdd, seq);

      const logRow = {
        plant_cd: plant,
        defect_form,
        defect_no,
        defect_date: yyyymmdd,
        work_center,
        line_cd,
        machine_cd: machine_cd ?? null,
        material_code,
        component_code: log?.component_code ?? null,
        division: log?.division ?? null,
        defect_qty: alloc,
        defect_type: log?.defect_type ?? null,
        defect_decision: log?.defect_decision ?? null,
        defect_source: log?.defect_source ?? null,
        defect_check: log?.defect_check ?? null,
        mold_code: log?.mold_code ?? null,
        mold_size: log?.mold_size ?? null,
        mold_set: log?.mold_set ?? null,
        mold_id: log?.mold_id ?? null,
        obs_nu: log?.obs_nu ?? null,
        obs_seq_nu: log?.obs_seq_nu ?? null,
        order_number: row.order_number,
        po_id: row.po_id ?? null,
        aps_id: row.aps_id ?? null,
        ...(await resolvePrevIds(row.order_number)),
        creator: null,
        create_dt: null,
        create_pc: null,
      };

      try {
        await dao.insertDefectLog(client, logRow);
      } catch (e) {
        if (e?.code === "23505") {
          throw {
            code: "DEFECT_NO_CONFLICT",
            message: "defect_no unique conflict",
          };
        }
        throw e;
      }

      allocations.push({
        order_number: row.order_number,
        applicable_qty: Number(alloc),
        remain_after: ordered - gr - (defected + Number(alloc)) - returned - labtest,
      });

      logs.push({
        defect_no,
        order_number: row.order_number,
        defect_qty: Number(alloc),
      });

      remainingToApply -= Number(alloc);
    }

    page += 1;
  }

  // 전량 반영 실패(동시성 변화 등) → 컨트롤러에서 409로 변환
  if (remainingToApply > 0) {
    throw {
      code: "DEFECT_QTY_CHANGED",
      totalRequested: Number(defect_qty),
      totalCapacity: Number(defect_qty) - Number(remainingToApply),
      notAppliedQty: Number(remainingToApply),
      allocations,
    };
  }

  return { allocations, logs };
}

/**
 * 핵심 분배 서비스 (시뮬레이션 후 조건 충족 시 실제 반영)
 */
export async function distribute(client, params) {
  const {
    plant,
    work_center,
    line_cd,
    material_code,
    defect_qty,
    defect_form,
    defect_date,
    log = {},
    machine_cd,
  } = params;

  const totalRequested = Number(defect_qty);

  try {
    await client.query("BEGIN");
    // statement timeout 30s
    await client.query(`SET LOCAL statement_timeout = '30s'`);

    // 1) 시뮬레이션
    const sim = await simulateAllocations(client, {
      plant,
      work_center,
      line_cd,
      material_code,
      defect_qty: totalRequested,
    });

    if (sim.totalCapacity < totalRequested) {
      await client.query("ROLLBACK");
      return {
        status: "EXCEEDED",
        totalRequested,
        totalCapacity: sim.totalCapacity,
        notAppliedQty: totalRequested - sim.totalCapacity,
        allocations: sim.allocations, // would-apply plan
      };
    }

    // 2) 실제 반영
    const applied = await applyAllocations(client, {
      plant,
      work_center,
      line_cd,
      material_code,
      defect_qty: totalRequested,
      defect_form,
      defect_date,
      log,
      machine_cd,
    });

    await client.query("COMMIT");

    return {
      status: "OK",
      totalRequested,
      totalApplied: totalRequested,
      allocations: applied.allocations,
      logs: applied.logs,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    throw err;
  }
}
