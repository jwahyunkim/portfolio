// src/renderer/pages/FTT_Report.tsx
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusTile from "../components/StatusTile";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { oracleApi, type DefectItemRow, type FttStatusRow } from "../api/oracleApi";

export default function FTT_Report() {
  const navigate = useNavigate();
  const [debug, setDebug] = useState(false);

  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const [fttStatus, setFttStatus] = useState<FttStatusRow | null>(null);
  const [fttStatusError, setFttStatusError] = useState<string | null>(null);

  const [defects, setDefects] = useState<DefectItemRow[]>([]);
  const [defectsError, setDefectsError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      chartRef.current?.chart?.reflow();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const r = await oracleApi.getFttStatus();
      if (!alive) return;

      if (!r?.ok) {
        setFttStatus(null);
        setFttStatusError(r?.error || "FTT Status 조회 실패");
        return;
      }

      setFttStatus((r.rows?.[0] as FttStatusRow) ?? null);
      setFttStatusError(null);
    })().catch((e: any) => {
      if (!alive) return;
      setFttStatus(null);
      setFttStatusError(String(e?.message || e));
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const r = await oracleApi.getDefects();
      if (!alive) return;

      if (!r?.ok) {
        setDefects([]);
        setDefectsError(r?.error || "Defects 조회 실패");
        return;
      }

      setDefects((r.rows as DefectItemRow[]) ?? []);
      setDefectsError(null);
    })().catch((e: any) => {
      if (!alive) return;
      setDefects([]);
      setDefectsError(String(e?.message || e));
    });

    return () => {
      alive = false;
    };
  }, []);

  const fmtInt = (n: number | null | undefined) => {
    if (n === null || n === undefined) return "-";
    return new Intl.NumberFormat("en-US").format(Math.trunc(n));
  };

  const fmtFixed = (n: number | null | undefined, digits: number) => {
    if (n === null || n === undefined) return "-";
    return Number(n).toFixed(digits);
  };

  // 백엔드가 0~1 비율로 주거나 0~100 퍼센트로 줘도 화면이 안 깨지게 처리
  const fmtPercent = (n: number | null | undefined) => {
    if (n === null || n === undefined) return "-";
    const v = n >= 0 && n <= 1 ? n * 100 : n;
    return `${v.toFixed(1)}%`;
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: debug ? "blue" : "transparent",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "stretch",
    width: "100%",
    flex: 4,
    minHeight: 0,
  };

  const headerTopStyle: React.CSSProperties = {
    backgroundColor: debug ? "grey" : "transparent",
    padding: "8px",
    flex: "1 1 0",
    minWidth: 0,
    alignSelf: "stretch",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const headerBottomStyle: React.CSSProperties = {
    backgroundColor: debug ? "green" : "transparent",
    padding: "8px",
    flex: "1 1 0",
    minWidth: 0,
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const headerGridStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "0",
    minWidth: 0,
    alignItems: "stretch",
  };

  const bodyStyle: React.CSSProperties = {
    backgroundColor: debug ? "orange" : "transparent",
    flex: 8,
    minHeight: 0,
    overflow: "visible",
  };

  const footerStyle: React.CSSProperties = {
    backgroundColor: debug ? "red" : "transparent",
    flex: 1,
    minHeight: 0,
    padding: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "8px",
  };

  const debugBtnStyle: React.CSSProperties = {
    position: "absolute",
    top: "12px",
    right: "12px",
    zIndex: 9999,
  };

  const footerBtnStyle: React.CSSProperties = {
    height: "100%",
    minHeight: 0,
    border: "1px solid rgba(0, 0, 0, 1)",
    backgroundColor: "#156082",
    color: "#ffffff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4vw",
    fontSize: "18px",
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const defectData = defects;

  const sortedDefectData = defectData
    .map((d, idx) => ({ ...d, __idx: idx }))
    .sort((a, b) => b.ftt - a.ftt || a.__idx - b.__idx)
    .map(({ __idx, ...rest }) => rest);

  const categories = sortedDefectData.map((d) => d.label);

  const chartOptions: Highcharts.Options = {
    chart: {
      type: "column",
      marginBottom: 200,
      marginLeft: 125,
    },
    title: {
      text: "",
      margin: 0,
    },
    xAxis: {
      type: "category",
      categories,
      labels: {
        enabled: true,
        rotation: -45,
        align: "right",
        style: {
          fontSize: "1rem",
          whiteSpace: "nowrap",
        },
      },
    },
    yAxis: {
      title: {
        text: "",
        margin: 0,
      },
      allowDecimals: false,
      min: 0,
    },
    tooltip: {
      shared: true,
    },
    plotOptions: {
      column: {
        grouping: true,
        borderWidth: 0,
        dataLabels: {
          enabled: true,
        },
      },
    },
    series: [
      {
        type: "column",
        name: "Defect",
        data: sortedDefectData.map((d) => d.ftt),
      },
      // {
      //   type: "column",
      //   name: "HFPA",
      //   data: defectData.map((d) => d.hfpa),
      // },
    ],
    credits: {
      enabled: false,
    },
    legend: {
      enabled: true,
      layout: "horizontal",
      align: "right",
      verticalAlign: "top",
      x: -10,
      y: 0,
    },
  };

  const showErr = fttStatusError ? "ERR" : undefined;

  return (
    <div style={{ height: "97vh", display: "flex", flexDirection: "column" }}>
      {/* <button style={debugBtnStyle} onClick={() => setDebug((v) => !v)}>
        Debug
      </button> */}

      <div style={headerStyle}>
        <div style={headerTopStyle}>
          <div style={headerGridStyle}>
            <StatusTile
              title="Production"
              value={showErr || fmtInt(fttStatus?.PROD_QTY ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="FTT"
              value={showErr || fmtPercent(fttStatus?.FTT_RATE ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="Rework rate"
              value={showErr || fmtPercent(fttStatus?.REWORK_RATE ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="DPU"
              value={showErr || fmtFixed(fttStatus?.DPU ?? null, 2)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="DPMO"
              value={showErr || fmtInt(fttStatus?.DPMO ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="Reject rate"
              value={showErr || fmtPercent(fttStatus?.REJECT_RATE ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
          </div>
        </div>

        <div style={headerBottomStyle}>
          <div style={headerGridStyle}>
            <StatusTile
              title="1st rework"
              value={showErr || fmtInt(fttStatus?.["1ST_REWORK_QTY"] ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="Multi rework"
              value={showErr || fmtInt(fttStatus?.MULTI_REWORK_QTY ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="Total rework"
              value={showErr || fmtInt(fttStatus?.REWORK_QTY ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="# Defect"
              value={showErr || fmtInt(fttStatus?.DEFECT_QTY ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="B/C Grade"
              value={showErr || fmtInt(fttStatus?.BC_QTY ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
            <StatusTile
              title="Rework Effectiveness"
              value={showErr || fmtPercent(fttStatus?.REWORK_EFFECTIVENESS ?? null)}
              styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: "500" } }}
            />
          </div>
        </div>
      </div>

      <div style={bodyStyle}>
        {defectsError ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
              textAlign: "center",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            {defectsError}
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", minHeight: 0 }}>
            <HighchartsReact
              ref={chartRef}
              highcharts={Highcharts}
              options={chartOptions}
              containerProps={{ style: { width: "100%", height: "100%" } }}
            />
          </div>
        )}
      </div>

      <div style={footerStyle}>
        <button style={footerBtnStyle} onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
    </div>
  );
}
