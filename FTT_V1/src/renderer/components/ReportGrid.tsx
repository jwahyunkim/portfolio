import React, { useCallback, useEffect, useMemo } from "react";
import ExcelJS from "exceljs";
// NOTE: TS에서 JSON import 에러나면 tsconfig.json에 "resolveJsonModule": true 필요
import defaultColumnsJson from "./reportGrid.columns.json";

type Row = Record<string, any>;

type ColumnDef = {
  /** rows의 key */
  key: string;

  /** 화면/엑셀 헤더 텍스트 */
  header: string;

  /** 화면 표시 폭(px) */
  widthPx?: number;

  /** 엑셀 열 너비(Excel width 단위) */
  xlsxWidth?: number;

  /** 헤더 텍스트 90도 회전(엑셀/화면 둘 다) */
  rotateHeader?: boolean;

  /** 헤더 배경색(ARGB: FF + RRGGBB) */
  headerBg?: string;

  /** 헤더 글자색(ARGB: FF + RRGGBB) */
  headerFontColor?: string;

  /** 기본 셀 배경색(ARGB: FF + RRGGBB) */
  cellBg?: string;

  /** 기본 정렬 */
  align?: "left" | "center" | "right";
};

type CellStyle = {
  bg?: string; // ARGB
  fontColor?: string; // ARGB
  bold?: boolean;
  align?: "left" | "center" | "right";
};

type Props = {
  /** API 결과를 그대로 rows로 넣으면 됨 */
  rows?: Row[];

  /** 컬럼 정의(사용자가 수정) */
  columns?: ColumnDef[];

  /** 다운로드 파일명 */
  filename?: string;

  /** 시트명 */
  sheetName?: string;

  /**
   * 셀 스타일 규칙(사용자가 수정)
   * - 반환값이 있으면 해당 셀에만 덮어씀
   */
  getCellStyle?: (args: {
    row: Row;
    col: ColumnDef;
    value: any;
    rowIndex: number;
  }) => CellStyle | null;

  /** 내보내기 버튼 표시 여부(기본: true) */
  // showExportButton?: boolean;

  /** 부모에서 export 실행할 수 있게 함수 전달 */
  onExportReady?: (fn: () => Promise<void>) => void;
};

function downloadXlsx(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeArgb(argb?: string, fallback: string = "FFFFFFFF") {
  const v = (argb ?? "").trim().toUpperCase();
  // 기대: "FFRRGGBB"
  if (/^[0-9A-F]{8}$/.test(v)) return v;
  return fallback;
}

function argbToCss(argb?: string, fallbackCss: string = "#FFFFFF") {
  const v = normalizeArgb(argb, "FFFFFFFF");
  // "FFRRGGBB" -> "#RRGGBB"
  const hex = `#${v.slice(2)}`;
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallbackCss;
}

/** Excel width <-> px 변환(대략). 정확 일치가 목적이면 widthPx/xlsxWidth 둘 다 명시 추천 */
function excelWidthToPx(width: number) {
  // 경험치 기반 근사값(기본 폰트 11 기준)
  return Math.round(width * 7);
}
function pxToExcelWidth(px: number) {
  const w = Math.round(px / 7);
  return Math.max(1, Math.min(255, w));
}

/**
 * ✅ 화면/엑셀 동기화용 단일 설정 변수
 * - 높이/테두리/폰트/폭 계산을 여기서만 관리
 */
const GRID_SYNC = {
  headerHeight: 300, // 화면(px) / 엑셀(pt 느낌) 동기값(대략)
  bodyHeight: 25, // 화면(px) / 엑셀(pt 느낌) 동기값(대략)

  fontFamily: "Arial, Arial, sans-serif",
  fontSize: 15,

  // 테두리(화면 CSS)
  borderHeaderCss: "#BFBFBF",
  borderBodyCss: "#E0E0E0",

  // 테두리(엑셀 ARGB)
  borderHeaderArgb: "FFBFBFBF",
  borderBodyArgb: "FFE0E0E0",

  // 폭 동기화 전략: widthPx 우선, 없으면 xlsxWidth를 px로 환산
  getColWidthPx: (c: ColumnDef) => {
    if (typeof c.widthPx === "number") return c.widthPx;
    if (typeof c.xlsxWidth === "number") return excelWidthToPx(c.xlsxWidth);
    return 120;
  },

  // 폭 동기화 전략: xlsxWidth 우선, 없으면 widthPx를 엑셀 width로 환산
  getColWidthXlsx: (c: ColumnDef) => {
    if (typeof c.xlsxWidth === "number") return c.xlsxWidth;
    if (typeof c.widthPx === "number") return pxToExcelWidth(c.widthPx);
    return 15;
  },

  // ✅ 화면 표시 최소 행 수(데이터가 이보다 적으면 빈 행 채움)
  minBodyRows: 30,
};

function computeCellStyle(args: {
  row: Row;
  col: ColumnDef;
  value: any;
  rowIndex: number;
  getCellStyle?: Props["getCellStyle"];
}): Required<CellStyle> {
  const { row, col, value, rowIndex, getCellStyle } = args;

  // 기본
  let bg = normalizeArgb(col.cellBg, "FFFFFFFF");
  let fontColor = "FF000000";
  let bold = false;
  let align: "left" | "center" | "right" = col.align ?? "left";

  // 예시 규칙(사용자가 마음대로 수정)
  // - ftt가 90 미만이면 빨강
  // - qty가 1000 이상이면 연노랑
  if (col.key === "ftt" && typeof value === "number" && value < 90) {
    bg = "FFFFC7CE";
    fontColor = "FF9C0006";
    bold = true;
  }
  if (col.key === "qty" && typeof value === "number" && value >= 1000) {
    bg = "FFFFF2CC";
  }

  // 사용자 규칙(최종 덮어쓰기)
  if (getCellStyle) {
    const custom = getCellStyle({ row, col, value, rowIndex });
    if (custom) {
      if (custom.bg) bg = normalizeArgb(custom.bg, bg);
      if (custom.fontColor) fontColor = normalizeArgb(custom.fontColor, fontColor);
      if (typeof custom.bold === "boolean") bold = custom.bold;
      if (custom.align) align = custom.align;
    }
  }

  return { bg, fontColor, bold, align };
}

export default function ReportGrid({
  rows,
  columns,
  filename = "report.xlsx",
  sheetName = "Sheet1",
  getCellStyle,
  // showExportButton = true,
  onExportReady,
}: Props) {
  // ✅ 사용자가 여기만 수정하면 됨(컬럼/회전/폭/색상 등)
  // - 기본 컬럼은 JSON에서 불러옴: ./reportGrid.columns.json
  const defaultColumns: ColumnDef[] = (defaultColumnsJson as unknown) as ColumnDef[];

  const cols = columns?.length ? columns : defaultColumns;

  // ✅ API rows가 아직 없을 때 화면 테스트용(사용자가 제거/수정 가능)
  const defaultRows: Row[] = useMemo(
    () => [
      { date: "",  },
      // { date: "2025-12-30", line: "B", model: "ST-002", qty: 980, ftt: 92.4 },
      // { date: "2025-12-30", line: "C", model: "ST-003", qty: 450, ftt: 88.1 },
    ],
    []
  );

  const data = rows?.length ? rows : defaultRows;

  // ✅ 화면용: 최소 50행(데이터가 부족하면 빈 행 채움), 데이터가 많으면 그대로
  const displayRows: Row[] = useMemo(() => {
    const base = Array.isArray(data) ? data : [];
    const min = GRID_SYNC.minBodyRows;
    if (base.length >= min) return base;

    const padCount = min - base.length;
    const padded: Row[] = base.slice();

    for (let i = 0; i < padCount; i += 1) {
      padded.push({}); // 빈 행
    }
    return padded;
  }, [data]);

  const handleExport = useCallback(async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    // 1) 컬럼(폭 포함) - ✅ GRID_SYNC로 동기화
    ws.columns = cols.map((c) => ({
      header: c.header,
      key: c.key,
      width: GRID_SYNC.getColWidthXlsx(c),
    }));

    // 2) 헤더 스타일(색/회전/정렬) - ✅ JSON(header/\n, rotateHeader)을 기준으로 화면과 동일하게
    const headerRow = ws.getRow(1);
    headerRow.height = GRID_SYNC.headerHeight;

    cols.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);

      const headerBg = normalizeArgb(c.headerBg, "FFF2F2F2");
      const headerFontColor = normalizeArgb(c.headerFontColor, "FF000000");

      // ✅ rotateHeader는 boolean true만 회전으로 인정(문자열 "false" 방지)
      const rotate = c.rotateHeader === true;

      // ✅ JSON header에 \n이 있으면 엑셀도 줄바꿈(wrapText)
      const hasNewline = (c.header ?? "").includes("\n");

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: headerBg },
      };

      cell.font = {
        bold: true,
        color: { argb: headerFontColor },
      };

      cell.alignment = {
        horizontal: c.align ?? "center",
        vertical: "middle",
        textRotation: rotate ? 90 : 0,
        wrapText: hasNewline, // ✅ JSON 기준
      };

      cell.border = {
        top: { style: "thin", color: { argb: GRID_SYNC.borderHeaderArgb } },
        left: { style: "thin", color: { argb: GRID_SYNC.borderHeaderArgb } },
        bottom: { style: "thin", color: { argb: GRID_SYNC.borderHeaderArgb } },
        right: { style: "thin", color: { argb: GRID_SYNC.borderHeaderArgb } },
      };
    });

    // 3) 데이터 추가(✅ 엑셀은 실제 데이터만. 빈 행 50개 채우기 미포함)
    data.forEach((r) => {
      const rowValues: Record<string, any> = {};
      cols.forEach((c) => {
        rowValues[c.key] = r?.[c.key];
      });
      ws.addRow(rowValues);
    });

    // 4) 바디 셀 스타일 - ✅ GRID_SYNC로 동기화
    ws.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber === 1) return; // header

      row.height = GRID_SYNC.bodyHeight;

      cols.forEach((c, idx) => {
        const cell = row.getCell(idx + 1);
        const value = (cell as any).value;

        const computed = computeCellStyle({
          row: data[rowNumber - 2],
          col: c,
          value,
          rowIndex: rowNumber - 2,
          getCellStyle,
        });

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: computed.bg },
        };

        cell.font = {
          ...(cell.font ?? {}),
          bold: computed.bold,
          color: { argb: computed.fontColor },
        };

        cell.alignment = {
          horizontal: computed.align,
          vertical: "middle",
          wrapText: false,
        };

        cell.border = {
          top: { style: "thin", color: { argb: GRID_SYNC.borderBodyArgb } },
          left: { style: "thin", color: { argb: GRID_SYNC.borderBodyArgb } },
          bottom: { style: "thin", color: { argb: GRID_SYNC.borderBodyArgb } },
          right: { style: "thin", color: { argb: GRID_SYNC.borderBodyArgb } },
        };
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    downloadXlsx(buf as ArrayBuffer, filename);
  }, [cols, data, filename, getCellStyle, sheetName]);

  useEffect(() => {
    if (!onExportReady) return;
    onExportReady(handleExport);
  }, [onExportReady, handleExport]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* {showExportButton ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={handleExport} style={{ padding: "8px 12px", cursor: "pointer" }}>
            엑셀로 내보내기(.xlsx)
          </button>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            (동기화 기준: JSON header의 \\n / rotateHeader, 화면 최소 {GRID_SYNC.minBodyRows}행)
          </div>
        </div>
      ) : null} */}

      <div
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          overflow: "auto",
          maxHeight: "90vh",
          background: "#fff",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "max-content",
            minWidth: "100%",
            fontFamily: GRID_SYNC.fontFamily,
            fontSize: GRID_SYNC.fontSize,
          }}
        >
          <thead>
            <tr style={{ height: GRID_SYNC.headerHeight }}>
              {cols.map((c) => {
                const headerBg = normalizeArgb(c.headerBg, "FFF2F2F2");
                const headerFontColor = normalizeArgb(c.headerFontColor, "FF000000");
                const widthPx = GRID_SYNC.getColWidthPx(c);

                // ✅ rotateHeader는 boolean true만 회전으로 인정
                const rotate = c.rotateHeader === true;

                // ✅ JSON header에 \n이 있으면 화면도 줄바꿈
                const hasNewline = (c.header ?? "").includes("\n");

                return (
                  <th
                    key={c.key}
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 1,

                      height: GRID_SYNC.headerHeight,
                      width: widthPx,
                      minWidth: widthPx,
                      maxWidth: widthPx,

                      padding: 0,
                      textAlign: c.align ?? "center",
                      verticalAlign: "middle",
                      fontWeight: 700,

                      background: argbToCss(headerBg, "#F2F2F2"),
                      color: argbToCss(headerFontColor, "#000000"),

                      borderTop: `1px solid ${GRID_SYNC.borderHeaderCss}`,
                      borderLeft: `1px solid ${GRID_SYNC.borderHeaderCss}`,
                      borderRight: `1px solid ${GRID_SYNC.borderHeaderCss}`,
                      borderBottom: `1px solid ${GRID_SYNC.borderHeaderCss}`,

                      userSelect: "none",
                    }}
                  >
                    <div
                      style={{
                        height: GRID_SYNC.headerHeight,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {rotate ? (
                        <div
                          style={{
                            display: "inline-block",
                            transform: "rotate(-90deg)", // 반시계 90도
                            transformOrigin: "center",
                            whiteSpace: hasNewline ? "pre-line" : "nowrap", // ✅ JSON 기준
                            textAlign: "center",
                          }}
                        >
                          {c.header}
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: "0 6px",
                            whiteSpace: hasNewline ? "pre-line" : "nowrap", // ✅ JSON 기준
                            overflow: "hidden",
                            textAlign: "center",
                          }}
                        >
                          {c.header}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((r, ri) => (
              <tr key={ri} style={{ height: GRID_SYNC.bodyHeight }}>
                {cols.map((c) => {
                  const widthPx = GRID_SYNC.getColWidthPx(c);
                  const v = r?.[c.key];
                  const txt = v === null || v === undefined ? "" : String(v);

                  const computed = computeCellStyle({
                    row: r,
                    col: c,
                    value: v,
                    rowIndex: ri,
                    getCellStyle,
                  });

                  return (
                    <td
                      key={c.key}
                      style={{
                        height: GRID_SYNC.bodyHeight,
                        width: widthPx,
                        minWidth: widthPx,
                        maxWidth: widthPx,

                        padding: 0,
                        verticalAlign: "middle",

                        background: argbToCss(computed.bg, "#FFFFFF"),
                        color: argbToCss(computed.fontColor, "#000000"),
                        fontWeight: computed.bold ? 700 : 400,
                        textAlign: computed.align,

                        borderTop: `1px solid ${GRID_SYNC.borderBodyCss}`,
                        borderLeft: `1px solid ${GRID_SYNC.borderBodyCss}`,
                        borderRight: `1px solid ${GRID_SYNC.borderBodyCss}`,
                        borderBottom: `1px solid ${GRID_SYNC.borderBodyCss}`,
                      }}
                      title={txt}
                    >
                      <div
                        style={{
                          height: GRID_SYNC.bodyHeight,
                          display: "flex",
                          alignItems: "center",
                          justifyContent:
                            computed.align === "right"
                              ? "flex-end"
                              : computed.align === "center"
                              ? "center"
                              : "flex-start",
                          padding: "0 8px",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {txt}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
