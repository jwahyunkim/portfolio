// src/renderer/components/defectCard.tsx
import React, { useMemo } from "react";

type SelectedDefect = {
  code: string;
  label: string;
};

type DefectItem = {
  /** API가 value/label로 올 수도 있고, code/label로 올 수도 있음 */
  value?: string;
  code?: string;
  label: string;

  /** 오른쪽 표시값(숫자) */
  ftt: number;
  hfpa: number;
};

type Props = {
  items: DefectItem[];
  columns: number;
  rows: number;

  /** 다중 선택: 부모가 들고 있는 선택 목록 */
  selectedDefects: SelectedDefect[];

  /** 클릭 시 부모로 전달(부모에서 토글 처리) */
  onToggle: (defect: SelectedDefect) => void;
};

export default function defectCard({
  items,
  columns,
  rows,
  selectedDefects,
  onToggle,
}: Props) {
  const capacity = Math.max(0, columns) * Math.max(0, rows);
  const visibleItems = useMemo(() => items.slice(0, capacity), [items, capacity]);

  const selectedSet = useMemo(() => {
    return new Set(selectedDefects.map((d) => d.code));
  }, [selectedDefects]);

  const gridStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${Math.max(1, rows)}, minmax(0, 1fr))`,
    gap: "0",
  };

  const cardButtonBaseStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    border: "1px solid rgba(0, 0, 0, 1)",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    padding: 0,
    overflow: "hidden",
  };

  const cardInnerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "grid",
    gridTemplateColumns: "1fr 72px",
    minWidth: 0,
    minHeight: 0,
  };

  const leftAreaBaseStyle: React.CSSProperties = {
    backgroundColor: "#156082",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: 400,
    lineHeight: 1.1,
    padding: "6px",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "normal",
  };

  const leftTextClampStyle: React.CSSProperties = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "normal",
    wordBreak: "break-word",
    textAlign: "center",
  };

  const leftAreaSelectedStyle: React.CSSProperties = {
    // 테두리(왼쪽 영역만)
    // boxShadow: "inset 0 0 0 3px rgba(0, 0, 0, 1)",
    // 배경색도 변경(조금 더 진하게)
    backgroundColor: "#ffe600ff",
    color: "black",
  };

  const rightColStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateRows: "repeat(4, minmax(0, 1fr))",
    borderLeft: "1px solid rgba(0, 0, 0, 1)",
    minWidth: 0,
    minHeight: 0,
  };

  const rightCellBaseStyle: React.CSSProperties = {
    borderBottom: "1px solid rgba(0, 0, 0, 1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 700,
  };

  const rightLabelBaseStyle: React.CSSProperties = {
    ...rightCellBaseStyle,
    fontSize: "12px",
  };

  const rightLabelFttStyle: React.CSSProperties = {
    ...rightLabelBaseStyle,
    backgroundColor: "#dceaf7",
  };

  const rightLabelHfpaStyle: React.CSSProperties = {
    ...rightLabelBaseStyle,
    backgroundColor: "#d9f2d0",
  };

  const rightValueStyle: React.CSSProperties = {
    ...rightCellBaseStyle,
    backgroundColor: "#ffffff",
    fontSize: "14px",
  };

  return (
    <div style={gridStyle}>
      {visibleItems.map((item, idx) => {
        const code = item.code ?? item.value ?? item.label;
        const label = item.label;
        const isSelected = selectedSet.has(code);

        return (
          <button
            key={`${code}-${idx}`}
            type="button"
            style={cardButtonBaseStyle}
            onClick={() => onToggle({ code, label })}
            aria-pressed={isSelected}
            title={label}
          >
            <div style={cardInnerStyle}>
              <div
                style={{
                  ...leftAreaBaseStyle,
                  ...(isSelected ? leftAreaSelectedStyle : {}),
                }}
              >
                <div style={leftTextClampStyle}>{label}</div>
              </div>

              <div style={rightColStyle}>
                <div style={rightLabelFttStyle}>FTT</div>
                <div style={rightValueStyle}>{item.ftt}</div>
                <div style={rightLabelHfpaStyle}>HFPA</div>
                <div style={{ ...rightValueStyle, borderBottom: "0" }}>{item.hfpa}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
