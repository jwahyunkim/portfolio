import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { oracleApi } from "../api/oracleApi";
import ReportGrid from "../components/ReportGrid";
import CustomSelect, { type SelectOption } from "../components/CustomSelect";
import CustomDatePicker from "../components/CustomDatePicker";

type ApiRow = Record<string, any>;
type GridRow = Record<string, any>;

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

// ✅ 서버 컬럼명 -> 그리드 key 매핑(상단)
const TOP_MAP: Record<string, string> = {
  FACTORY_GROUP: "factory_group",
  FACTORY_CD: "factory_code",
  PLANT_NM: "plant",
  LINE_NAME: "line",
  INSPECT_DATE: "inspection_date_dd_mmm_yyyy",
  SEASON: "season",
  MODEL_ID: "model",
  STYLE_NUMBER: "style_code",
  COLOR_CD: "colorway_code",
  PROD_QTY: "total_a_grade_pairs",
  FIRST_REWORK_QTY: "1st_time_rework_pairs",
  TOTAL_REWORK_QTY: "total_rework",
  B_GRADE_QTY: "total_b_grade_pairs_reject",
  C_GRADE_QTY: "total_c_grade_pairs_reject",
};

// ✅ REWORK_001~025 -> *_rework
const REWORK_KEYS = [
  "airbag_defect_rework",
  "alignment_l_r_symmetry_rework",
  "bond_gap_rat_hole_rework",
  "delamination_rework",
  "over_cement_rework",
  "contamination_rework",
  "interior_defect_rework",
  "accessories_defect_rework",
  "color_paint_migration_bleeding_rework",
  "color_mis_match_rework",
  "paint_surface_quality_rework",
  "material_damaged_rework",
  "holes_quality_rework",
  "over_buffing_rework",
  "jump_broken_loose_stitch_rework",
  "thread_end_rework",
  "stitching_margin_rework",
  "off_center_rework",
  "rocking_rework",
  "toe_spring_rework",
  "wrinkle_or_deformed_bottom_rework",
  "wrinkle_or_deformed_upper_rework",
  "x_ray_rework",
  "yellowing_rework",
  "other_defects_rework",
];

// ✅ B_GRADE_001~025 -> *_b_grade
const B_GRADE_KEYS = [
  "airbag_defect_b_grade",
  "alignment_l_r_symmetry_b_grade",
  "bond_gap_rat_hole_b_grade",
  "delamination_b_grade",
  "over_cement_b_grade",
  "contamination_b_grade",
  "interior_defect_b_grade",
  "accessories_defect_b_grade",
  "color_paint_migration_bleeding_b_grade",
  "color_mismatch_b_grade",
  "paint_surface_quality_b_grade",
  "material_damaged_b_grade",
  "holes_quality_b_grade",
  "over_buffing_b_grade",
  "jump_broken_loose_stitch_b_grade",
  "thread_end_b_grade",
  "stitching_margin_b_grade",
  "off_center_b_grade",
  "rocking_b_grade",
  "toe_spring_b_grade",
  "wrinkle_or_deformed_bottom_b_grade",
  "wrinkle_or_deformed_upper_b_grade",
  "x_ray_b_grade",
  "yellowing_b_grade",
  "other_defects_b_grade",
];

// ✅ C_GRADE_001~025 -> *_c_grade
const C_GRADE_KEYS = [
  "airbag_defect_c_grade",
  "alignment_l_r_symmetry_c_grade",
  "bond_gap_rat_hole_c_grade",
  "delamination_c_grade",
  "over_cement_c_grade",
  "contamination_c_grade",
  "interior_defect_c_grade",
  "accessories_defect_c_grade",
  "color_paint_migration_bleeding_c_grade",
  "color_mismatch_c_grade",
  "paint_surface_quality_c_grade",
  "material_damaged_c_grade",
  "holes_quality_c_grade",
  "over_buffing_c_grade",
  "jump_broken_loose_stitch_c_grade",
  "thread_end_c_grade",
  "stitching_margin_c_grade",
  "off_center_c_grade",
  "rocking_c_grade",
  "toe_spring_c_grade",
  "wrinkle_or_deformed_bottom_c_grade",
  "wrinkle_or_deformed_upper_c_grade",
  "x_ray_c_grade",
  "yellowing_c_grade",
  "other_defects_c_grade",
];

function mapApiRowToGridRow(src: ApiRow): GridRow {
  const dst: GridRow = {};

  // 상단 고정
  Object.entries(TOP_MAP).forEach(([from, to]) => {
    dst[to] = src?.[from];
  });

  // REWORK_001~025
  REWORK_KEYS.forEach((toKey, i) => {
    const fromKey = `REWORK_${pad3(i + 1)}`;
    dst[toKey] = src?.[fromKey];
  });

  // B_GRADE_001~025
  B_GRADE_KEYS.forEach((toKey, i) => {
    const fromKey = `B_GRADE_${pad3(i + 1)}`;
    dst[toKey] = src?.[fromKey];
  });

  // C_GRADE_001~025
  C_GRADE_KEYS.forEach((toKey, i) => {
    const fromKey = `C_GRADE_${pad3(i + 1)}`;
    dst[toKey] = src?.[fromKey];
  });

  return dst;
}

export default function FTT_Report_Template() {
  const navigate = useNavigate();
  const [debug, setDebug] = useState(false);

  const headerStyle: React.CSSProperties = {
    backgroundColor: debug ? "blue" : "transparent",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "stretch",
    width: "100%",
    flex: 1,
    minHeight: 0,
  };

  const bodyStyle: React.CSSProperties = {
    backgroundColor: debug ? "orange" : "transparent",
    flex: 16,
    minHeight: 0,
    overflow: "hidden",
  };

  // ---------------------------
  // ✅ Header Params
  // ---------------------------
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [plantCd, setPlantCd] = useState("");
  const [wcCd, setWcCd] = useState("");
  const [lineCd, setLineCd] = useState("");

  const [plantOptions, setPlantOptions] = useState<SelectOption[]>([]);
  const [wcOptions, setWcOptions] = useState<SelectOption[]>([]);
  const [lineOptions, setLineOptions] = useState<SelectOption[]>([]);

  const [loadingPlants, setLoadingPlants] = useState(false);
  const [loadingWcs, setLoadingWcs] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);

  const [loadingSearch, setLoadingSearch] = useState(false);

  const [errorText, setErrorText] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");

  // ---------------------------
  // ✅ Grid Rows (실제 데이터)
  // ---------------------------
  const [rows, setRows] = useState<GridRow[]>([]);

  // ---------------------------
  // ✅ Export hook from ReportGrid
  // ---------------------------
  const exportFnRef = useRef<null | (() => Promise<void>)>(null);
  const [exportReady, setExportReady] = useState(false);

  // ---------------------------
  // ✅ Options load (Plant -> WC -> Line)
  // ---------------------------
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingPlants(true);
      setErrorText("");
      try {
        const r = await oracleApi.getPlantsList();
        if (!alive) return;

        if (!r?.ok) {
          setPlantOptions([]);
          setErrorText(r?.error || "Plant 리스트 조회 실패");
          return;
        }

        const opts: SelectOption[] = (r.rows || [])
          .map((row: any) => {
            const cd = (row?.PLANT_CD ?? "").toString();
            const nm = (row?.PLANT_NM ?? "").toString();
            return { value: cd, label: `${nm}`.trim() };
          })
          .filter((o) => !!o.value);

        setPlantOptions(opts);
      } finally {
        if (alive) setLoadingPlants(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!plantCd) {
        setWcOptions([]);
        setLineOptions([]);
        setLoadingWcs(false);
        setLoadingLines(false);
        return;
      }

      setLoadingWcs(true);
      setErrorText("");
      try {
        const r = await oracleApi.getWorkCentersList(plantCd);
        if (!alive) return;

        if (!r?.ok) {
          setWcOptions([]);
          setErrorText(r?.error || "Work Center 리스트 조회 실패");
          return;
        }

        const opts: SelectOption[] = (r.rows || [])
          .map((row: any) => {
            const cd = (row?.WC_CD ?? "").toString();
            const nm = (row?.WC_NM ?? "").toString();
            return { value: cd, label: `${nm}`.trim() };
          })
          .filter((o) => !!o.value);

        setWcOptions(opts);
      } finally {
        if (alive) setLoadingWcs(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [plantCd]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!plantCd || !wcCd) {
        setLineOptions([]);
        setLoadingLines(false);
        return;
      }

      setLoadingLines(true);
      setErrorText("");
      try {
        const r = await oracleApi.getLinesList(plantCd, wcCd);
        if (!alive) return;

        if (!r?.ok) {
          setLineOptions([]);
          setErrorText(r?.error || "Line 리스트 조회 실패");
          return;
        }

        const opts: SelectOption[] = (r.rows || [])
          .map((row: any) => {
            const cd = (row?.LINE_CD ?? "").toString();
            const nm = (row?.LINE_NM ?? "").toString();
            return { value: cd, label: `${cd} | ${nm}`.trim() };
          })
          .filter((o) => !!o.value);

        setLineOptions(opts);
      } finally {
        if (alive) setLoadingLines(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [plantCd, wcCd]);

  const onPlantChange = (v: string) => {
    setPlantCd(v);
    setWcCd("");
    setLineCd("");
    setWcOptions([]);
    setLineOptions([]);
    setStatusText("");
    setErrorText("");
    setRows([]);
    setExportReady(false);
  };

  const onWcChange = (v: string) => {
    setWcCd(v);
    setLineCd("");
    setLineOptions([]);
    setStatusText("");
    setErrorText("");
    setRows([]);
    setExportReady(false);
  };

  const onLineChange = (v: string) => {
    setLineCd(v);
    setStatusText("");
    setErrorText("");
    setRows([]);
    setExportReady(false);
  };

  // ✅ 날짜만 필수 체크 + 실제 호출
  const handleSearch = useCallback(async () => {
    const missing: string[] = [];
    if (!fromDate) missing.push("시작일");
    if (!toDate) missing.push("종료일");

    if (missing.length) {
      setErrorText(`${missing.join(", ")} 선택 필요`);
      setStatusText("");
      setRows([]);
      setExportReady(false);
      return;
    }

    setLoadingSearch(true);
    setErrorText("");
    setStatusText("조회 중...");
    setRows([]);
    setExportReady(false);

    try {
      const r = await oracleApi.getFttTemplateV1({
        from_date: fromDate,
        to_date: toDate,

        // ✅ 옵션: 값 있을 때만 전달(oracleApi 내부에서도 빈값은 쿼리 제외)
        plant_cd: plantCd || null,
        wc_cd: wcCd || null,
        line_cd: lineCd || null,
      });

      if (!r?.ok) {
        setErrorText(r?.error || "조회 실패");
        setStatusText("");
        return;
      }

      const rawRows: ApiRow[] = (r.rows || []) as ApiRow[];
      const mapped: GridRow[] = rawRows.map(mapApiRowToGridRow);

      setRows(mapped);

      const cnt = mapped.length;
      setStatusText(`조회 완료: ${cnt}건`);
      setErrorText("");
    } catch (e: any) {
      setErrorText(String(e?.message || e));
      setStatusText("");
    } finally {
      setLoadingSearch(false);
    }
  }, [fromDate, toDate, plantCd, wcCd, lineCd]);

  const headerRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.8vw",
    flexWrap: "wrap",
    padding: "0.8vh 1vw",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.9vw",
    opacity: 0.9,
    whiteSpace: "nowrap",
  };

  const btnStyle: React.CSSProperties = {
    padding: "8px 12px",
    cursor: "pointer",
  };

  // ✅ 파라미터/액션 분리
  const paramGroupStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.8vw",
    flexWrap: "wrap",
  };

  const actionGroupStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.6vw",
    marginLeft: "auto",
    flexWrap: "nowrap",
  };

  return (
    <div style={{ height: "97vh", display: "flex", flexDirection: "column" }}>
      <div style={headerStyle}>
        <div style={headerRowStyle}>
          {/* ✅ Left: Params */}
          <div style={paramGroupStyle}>
            <span style={labelStyle}>Date</span>
            <CustomDatePicker
              value={fromDate}
              onChange={(v) => {
                setFromDate(v);
                setStatusText("");
                setErrorText("");
              }}
              boxWidth="10vw"
              boxHeight="4vh"
              innerFont="0.9vw"
              displayFormat="yyyy-MM-dd"
              valueFormat="yyyyMMdd"
            />
            <span style={labelStyle}>~</span>
            <CustomDatePicker
              value={toDate}
              onChange={(v) => {
                setToDate(v);
                setStatusText("");
                setErrorText("");
              }}
              boxWidth="10vw"
              boxHeight="4vh"
              innerFont="0.9vw"
              displayFormat="yyyy-MM-dd"
              valueFormat="yyyyMMdd"
            />

            <span style={labelStyle}>Plant</span>
            <CustomSelect
              options={plantOptions}
              value={plantCd}
              onChange={onPlantChange}
              placeholder="Plant"
              boxWidth="12vw"
              boxHeight="4vh"
              innerFont="0.9vw"
              disabled={loadingPlants}
            />

            <span style={labelStyle}>Work Center</span>
            <CustomSelect
              options={wcOptions}
              value={wcCd}
              onChange={onWcChange}
              placeholder="Work Center"
              boxWidth="14vw"
              boxHeight="4vh"
              innerFont="0.9vw"
              disabled={!plantCd || loadingWcs}
            />

            <span style={labelStyle}>Line</span>
            <CustomSelect
              options={lineOptions}
              value={lineCd}
              onChange={onLineChange}
              placeholder="Line"
              boxWidth="14vw"
              boxHeight="4vh"
              innerFont="0.9vw"
              disabled={!plantCd || !wcCd || loadingLines}
            />
          </div>

          {/* ✅ Right: Actions */}
          <div style={actionGroupStyle}>
            <button style={btnStyle} onClick={handleSearch} disabled={loadingSearch}>
              {loadingSearch ? "Searching..." : "Search"}
            </button>

            <button
              style={btnStyle}
              onClick={() => exportFnRef.current?.()}
              disabled={!exportReady || loadingSearch || rows.length === 0}
            >
              Download
            </button>
          </div>

          {errorText ? (
            <span style={{ fontSize: "0.9vw", color: "#d32f2f" }}>{errorText}</span>
          ) : null}

          {statusText ? (
            <span style={{ fontSize: "0.9vw", color: "#1473e3" }}>{statusText}</span>
          ) : null}
        </div>
      </div>

      <div style={bodyStyle}>
        <div style={{ width: "100%", height: "100%", minHeight: 0 }}>
          <ReportGrid
            rows={rows}
            onExportReady={(fn) => {
              exportFnRef.current = fn;
              setExportReady(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
