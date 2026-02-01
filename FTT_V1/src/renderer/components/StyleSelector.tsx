// src/renderer/components/StyleSelector.tsx
import React, { useEffect, useMemo, useState } from "react";

type Props<T> = {
  title: string;

  items: T[];

  /** 화면에 보일 카드 개수 (기본 5) */
  visibleCount?: number;

  /** 한 번에 넘길 카드 개수 (기본 visibleCount) */
  step?: number;

  /** 선택값(부모 상태) */
  selectedValue?: string;

  /** 선택 변경 콜백(부모 상태 업데이트) */
  onChange?: (value: string, item: T) => void;

  /** item에서 value 뽑는 방법(기본: item.value 또는 String(item)) */
  getValue?: (item: T) => string;

  /** item에서 label 뽑는 방법(기본: item.label 또는 String(item)) */
  getLabel?: (item: T) => string;

  /** 줄바꿈 허용 여부 */
  wrap?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeFontSize(label: string, wrap: boolean) {
  const len = label.length;
  if (wrap) {
    if (len > 40) return 11;
    if (len > 25) return 12;
    return 13;
  }
  if (len > 24) return 10;
  if (len > 18) return 11;
  if (len > 12) return 12;
  return 14;
}

export default function StyleSelector<T>({
  title,
  items,
  visibleCount = 5,
  step,
  selectedValue,
  onChange,
  getValue,
  getLabel,
  wrap = false,
}: Props<T>) {
  const resolvedStep = step ?? visibleCount;

  const valueOf = useMemo(() => {
    return (
      getValue ??
      ((item: T) => {
        const anyItem = item as any;
        if (anyItem && typeof anyItem === "object" && "value" in anyItem) {
          return String(anyItem.value);
        }
        return String(item);
      })
    );
  }, [getValue]);

  const labelOf = useMemo(() => {
    return (
      getLabel ??
      ((item: T) => {
        const anyItem = item as any;
        if (anyItem && typeof anyItem === "object" && "label" in anyItem) {
          return String(anyItem.label);
        }
        return String(item);
      })
    );
  }, [getLabel]);

  const [startIndex, setStartIndex] = useState(0);

  const maxStart = useMemo(() => {
    return Math.max(0, items.length - visibleCount);
  }, [items.length, visibleCount]);

  useEffect(() => {
    setStartIndex((prev) => clamp(prev, 0, maxStart));
  }, [maxStart]);

  const canLeft = startIndex > 0;
  const canRight = startIndex < maxStart;

  const moveLeft = () => {
    setStartIndex((prev) => clamp(prev - resolvedStep, 0, maxStart));
  };

  const moveRight = () => {
    setStartIndex((prev) => clamp(prev + resolvedStep, 0, maxStart));
  };

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, startIndex + visibleCount);
  }, [items, startIndex, visibleCount]);

  const actualVisibleCount = Math.max(1, Math.min(visibleCount, visibleItems.length));

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1px solid rgba(0, 0, 0, 1)",
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: "#156082",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.3rem",
    fontWeight: 500,
    lineHeight: 1.2,
    flex: "1 1 0",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const bodyOuterStyle: React.CSSProperties = {
    flex: "2 1 0",
    minHeight: 0,
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "36px 1fr 36px",
    overflow: "hidden",
    backgroundColor: "#ffffff",
  };

  const arrowBaseStyle: React.CSSProperties = {
    height: "100%",
    width: "100%",
    border: "1px solid rgba(0, 0, 0, 1)",
    backgroundColor: "#ffffff",
    fontSize: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    userSelect: "none",
  };

  const arrowDisabledStyle: React.CSSProperties = {
    backgroundColor: "#f3f3f3",
    color: "#9b9b9b",
    cursor: "not-allowed",
  };

  const cardsWrapStyle: React.CSSProperties = {
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: `repeat(${actualVisibleCount}, minmax(0, 1fr))`,
  };

  const cardButtonBaseStyle: React.CSSProperties = {
    height: "100%",
    width: "100%",
    border: "1px solid rgba(0, 0, 0, 1)",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    minWidth: 0,
    minHeight: 0,
    padding: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  const cardSelectedStyle: React.CSSProperties = {
    // border: "3px solid rgba(0, 0, 0, 1)",
    backgroundColor: "#b9b9b9",
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>{title}</div>

      <div style={bodyOuterStyle}>
        <button
          type="button"
          onClick={moveLeft}
          disabled={!canLeft}
          style={{
            ...arrowBaseStyle,
            ...(!canLeft ? arrowDisabledStyle : {}),
          }}
          aria-label="Previous"
        >
          ◀
        </button>

        <div style={cardsWrapStyle}>
          {visibleItems.map((item) => {
            const v = valueOf(item);
            const label = labelOf(item);
            const isSelected = selectedValue === v;

            const textStyle: React.CSSProperties = {
              fontSize: `${computeFontSize(label, wrap)}px`,
              fontWeight: 600,
              lineHeight: 1.2,
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
              textOverflow: wrap ? "clip" : "ellipsis",
              whiteSpace: wrap ? "normal" : "nowrap",
              wordBreak: wrap ? "break-word" : "normal",
              textAlign: "center",
            };

            return (
              <button
                key={v}
                type="button"
                onClick={() => onChange?.(isSelected ? "" : v, item)}
                style={{
                  ...cardButtonBaseStyle,
                  ...(isSelected ? cardSelectedStyle : {}),
                }}
                aria-pressed={isSelected}
                title={wrap ? "" : label}
              >
                <span style={textStyle}>{label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={moveRight}
          disabled={!canRight}
          style={{
            ...arrowBaseStyle,
            ...(!canRight ? arrowDisabledStyle : {}),
          }}
          aria-label="Next"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
