import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * UI5 유사 버튼 그리드
 * - 부모 컨테이너의 실시간 크기(ResizeObserver)를 기준으로 행 단위로 배치
 * - 각 버튼 폭/높이는 텍스트 실제 픽셀 폭(measureText)과 폰트/패딩으로 계산
 * - 컨테이너를 넘는 높이는 overflow-auto로 스크롤 처리
 * - 선택 상태 관리 및 단일/다중/비활성 선택 모드 지원
 * - 선택 상태 스타일을 프롭스(selectedVariant)로 지정 가능
 */

// 파일 상단 어딘가(컴포넌트 밖)
const EMPTY_SELECTION: number[] = [];

type Ui5ButtonVariant =
  | "default"
  | "none"
  | "emphasized"
  | "transparent"
  | "positive"
  | "negative"
  | "attention";

export type Ui5LikeButtonGridProps = {
  /** 1차원 텍스트 배열 */
  items: string[];
  /** 버튼 스타일 변형(기본 상태) */
  variant?: Ui5ButtonVariant;
  /** 선택 상태 스타일 변형 */
  selectedVariant?: Ui5ButtonVariant;
  /** 버튼 간격(px) */
  gap?: number;
  /** 수평 패딩(px) */
  paddingX?: number;
  /** 수직 패딩(px) */
  paddingY?: number;
  /** 폰트: size(px), weight, family 각각 별도 지정 */
  fontSize?: number; // px
  fontWeight?: number | "normal" | "bold" | "bolder" | "lighter";
  fontFamily?: string;
  /** 버튼 최소/최대 크기 제약 */
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** 클릭 핸들러 */
  onClick?: (text: string, index: number) => void;
  /** 외부 클래스 */
  className?: string;

  /** 선택 모드: 단일/다중/없음 */
  selectionMode?: "single" | "multiple" | "none";
  /**
   * 선택 상태 제어용(Controlled)
   * - 선택된 인덱스 배열
   */
  selectedIndices?: number[];
  /**
   * 비제어 기본 선택값(Uncontrolled)
   */
  defaultSelectedIndices?: number[];
  /**
   * 선택 변경 콜백
   */
  onSelectionChange?: (selectedIndices: number[], selectedTexts: string[]) => void;

  /** 컨테이너 채움 옵션 */
  fillWidth?: boolean; // 부모 폭을 채움(기본 true)
  fillHeight?: boolean; // 부모 높이를 채움(기본 false, 미지정 시 내용 높이만큼)

  buttonStyle?: React.CSSProperties; // 인라인 스타일 주입

  /**
   * 버튼별 텍스트 가공용 훅
   * - 예: 인덱스별 N번째 공백을 '\n'으로 치환해 줄바꿈 제어
   */
  formatItemText?: (text: string, index: number) => string;
};

export default function CustomMultiButton(props: Ui5LikeButtonGridProps) {
  const {
    items,
    variant = "default",
    selectedVariant = "emphasized", // 없으면 variant로 폴백
    gap = 8,
    paddingX = 12,
    paddingY = 6,
    fontSize = 14,
    fontWeight = 400,
    fontFamily = "'Noto Sans', ui-sans-serif, system-ui",
    minWidth = 32,
    minHeight = 34, // 버튼들의 높이
    maxWidth,
    maxHeight,
    onClick,
    className,
    selectionMode = "single",
    selectedIndices,
    defaultSelectedIndices = [],
    onSelectionChange,
    fillWidth = true,
    fillHeight = false,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  // --- 선택 상태 관리 (Controlled 우선, 아니면 Uncontrolled) ---
  const isControlled = Array.isArray(selectedIndices);
  const [internalSelected, setInternalSelected] =
    useState<number[]>(defaultSelectedIndices);

  // none 모드일 때는 항상 선택 없음으로 간주
  const effectiveSelected = useMemo(() => {
    if (selectionMode === "none") return EMPTY_SELECTION;
    return isControlled ? selectedIndices : internalSelected;
  }, [selectionMode, isControlled, selectedIndices, internalSelected]);

  const selectedSet = useMemo(
    () => new Set(effectiveSelected),
    [effectiveSelected]
  );

  // 부모 크기 추적
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setContainerSize({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measure = useMemo(
    () => createMeasurer(fontSize, fontWeight, fontFamily),
    [fontSize, fontWeight, fontFamily]
  );

  const buttons = useMemo(() => {
    const sizes = items.map((text, originalIndex) => {
      // 표시용 텍스트: formatItemText가 있으면 가공, 없으면 원본
      const displayText = props.formatItemText
        ? props.formatItemText(text, originalIndex)
        : text;

      // 줄 단위로 나누어 가장 긴 줄의 폭을 기준으로 버튼 폭 계산
      const lines = displayText.split("\n");
      const textW = Math.max(...lines.map((line) => measure(line)));

      const width = clamp(
        Math.ceil(textW + paddingX * 2),
        minWidth,
        maxWidth ?? Infinity
      );

      // 높이는 기존 로직 그대로 유지 (줄 수와 무관)
      const height = clamp(
        Math.ceil(fontSize * 1.2 + paddingY * 2),
        minHeight,
        maxHeight ?? Infinity
      );

      return { text, displayText, width, height, originalIndex };
    });

    // 행 포장
    const lines: { items: typeof sizes; y: number; height: number }[] = [];
    let x = 0,
      y = 0,
      lineH = 0;
    let current: typeof sizes = [];
    const cw = Math.max(containerSize.w, 0);

    sizes.forEach((btn) => {
      const wWithGap = (current.length ? gap : 0) + btn.width;
      if (x + wWithGap > cw && current.length) {
        lines.push({ items: current, y, height: lineH });
        y += lineH + gap;
        x = 0;
        lineH = 0;
        current = [];
      }
      current.push(btn);
      x += (current.length > 1 ? gap : 0) + btn.width;
      lineH = Math.max(lineH, btn.height);
    });
    if (current.length) {
      lines.push({ items: current, y, height: lineH });
      y += lineH;
    }

    const totalHeight = lines.reduce(
      (acc, l, i) => acc + l.height + (i ? gap : 0),
      0
    );

    return { lines, totalHeight };
  }, [
    items,
    containerSize.w,
    gap,
    measure,
    paddingX,
    paddingY,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    fontSize,
    props.formatItemText,
  ]);

  const theme = ui5ThemeFor(variant);
  const selectedTheme = ui5ThemeFor(selectedVariant ?? variant);

  // --- 선택 처리 ---
  const commitSelection = (next: number[]) => {
    if (selectionMode === "none") return; // 선택 비활성
    if (!isControlled) setInternalSelected(next);
    if (onSelectionChange) {
      const texts = next
        .map((i) => items[i])
        .filter((v) => typeof v !== "undefined");
      onSelectionChange(next, texts);
    }
  };

  const toggleIndex = (idx: number) => {
    if (selectionMode === "none") return; // 선택 비활성
    if (selectionMode === "single") {
      const isSame =
        effectiveSelected.length === 1 && effectiveSelected[0] === idx;
      commitSelection(isSame ? [] : [idx]);
    } else {
      const next = new Set(effectiveSelected);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      commitSelection(Array.from(next).sort((a, b) => a - b));
    }
  };

  const innerHeight = fillHeight
    ? Math.max(buttons.totalHeight, containerSize.h) // 부모 높이를 채우되, 내용이 더 크면 스크롤
    : buttons.totalHeight; // 부모 높이 미고정 시, 내용 높이만큼만 차지

  return (
    <div
      ref={containerRef}
      className={["relative overflow-auto", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: fillWidth ? "100%" : undefined,
        height: fillHeight ? "100%" : undefined,
        maxWidth: "100%",
        maxHeight: "100%",
      }}
      role="list"
      aria-label="ui5-like button grid"
    >
      <div style={{ position: "relative", height: innerHeight }}>
        {buttons.lines.map((line, li) => (
          <div
            key={li}
            style={{
              position: "absolute",
              top: line.y,
              left: 0,
              height: line.height,
              display: "flex",
              gap,
            }}
          >
            {line.items.map((btn, bi) => {
              const isSelected =
                selectionMode !== "none" && selectedSet.has(btn.originalIndex);
              const variantClass = isSelected
                ? selectedTheme.className
                : theme.className;
              return (
                <button
                  key={bi}
                  type="button"
                  onClick={() => {
                    toggleIndex(btn.originalIndex);
                    if (onClick)
                      onClick(items[btn.originalIndex], btn.originalIndex); // 원본 텍스트 유지
                  }}
                  className={`ui5-btn shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded ${variantClass}`}
                  style={{
                    width: btn.width,
                    height: btn.height,
                    fontFamily,
                    fontSize,
                    fontWeight,
                    lineHeight: 1.2,
                    padding: `${paddingY}px ${paddingX}px`,
                    ...props.buttonStyle, // 외부 스타일 병합
                  }}
                  aria-pressed={
                    selectionMode !== "none" ? isSelected : undefined
                  }
                  data-selected={
                    selectionMode !== "none"
                      ? isSelected
                        ? "true"
                        : "false"
                      : undefined
                  }
                >
                  {btn.displayText}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <style>{cssReset}</style>
      <style>{ui5Styles}</style>
    </div>
  );
}

/** Utilities */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toCanvasFont(
  sizePx: number,
  weight: Ui5LikeButtonGridProps["fontWeight"],
  family: string
) {
  const w = typeof weight === "number" ? String(weight) : weight || "normal";
  return `${w} ${sizePx}px ${family}`;
}

function createMeasurer(
  sizePx: number,
  weight: Ui5LikeButtonGridProps["fontWeight"],
  family: string
) {
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1)
      : document.createElement("canvas");

  // 두 컨텍스트 공통 타입으로 강제하여 'RenderingContext' 유니온 회피
  // 기존 get2dCtx 블록 교체
  type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  const isOffscreenCanvas = (c: unknown): c is OffscreenCanvas =>
    typeof OffscreenCanvas !== "undefined" && c instanceof OffscreenCanvas;

  const get2dCtx = (c: HTMLCanvasElement | OffscreenCanvas): Ctx2D => {
    const ctx = isOffscreenCanvas(c) ? c.getContext("2d") : c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    return ctx as Ctx2D;
  };

  const ctx = get2dCtx(canvas);

  return (text: string) => {
    ctx.font = toCanvasFont(sizePx, weight, family);
    const metrics = ctx.measureText(text);
    return metrics.width;
  };
}

function ui5ThemeFor(variant: Ui5ButtonVariant) {
  switch (variant) {
    case "emphasized":
      return { className: "ui5-emphasized" };
    case "transparent":
      return { className: "ui5-transparent" };
    case "positive":
      return { className: "ui5-positive" };
    case "negative":
      return { className: "ui5-negative" };
    case "attention":
      return { className: "ui5-attention" };
    case "none":
      return { className: "ui5-none" };
    default:
      return { className: "ui5-default" };
  }
}

const cssReset = `
.ui5-btn {
  border: none;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background-color 120ms ease, box-shadow 120ms ease, transform 60ms ease;
  user-select: none;
  white-space: pre-line;
}
.ui5-btn:active { transform: translateY(0.5px); }
.ui5-btn:disabled { cursor: not-allowed; opacity: 0.6; }
`;

const ui5Styles = `
/* SAP UI5 유사 팔레트/상태 */
.ui5-default { background-color: #ffffff; color: #0064d9; box-shadow: inset 0 0 0 1px #bbbbbb; }
.ui5-default:hover { background-color: #efefef; }
.ui5-default:active { background-color: #e5e5e5; }

.ui5-none { background-color: #ffffff; color: #000000ff; box-shadow: inset 0 0 0 1px #bbbbbb; }
.ui5-none:hover { background-color: #efefef; }
.ui5-none:active { background-color: #e5e5e5; }

.ui5-emphasized { background-color: #0070f2; color: #fff; box-shadow: inset 0 0 0 1px #0a6ed1; }
.ui5-emphasized:hover { background-color: #085caf; }
.ui5-emphasized:active { background-color: #074a8c; }

.ui5-transparent { background-color: transparent; color: #0a6ed1; box-shadow: inset 0 0 0 1px transparent; }
.ui5-transparent:hover { background-color: rgba(10,110,209,0.10); }
.ui5-transparent:active { background-color: rgba(10,110,209,0.16); }

.ui5-positive { background-color: #107e3e; color: #fff; box-shadow: inset 0 0 0 1px #107e3e; }
.ui5-positive:hover { background-color: #0e6f37; }

.ui5-negative { background-color: #bb0000; color: #fff; box-shadow: inset 0 0 0 1px #bb0000; }
.ui5-negative:hover { background-color: #9f0000; }

.ui5-attention { background-color: #e9730c; color: #fff; box-shadow: inset 0 0 0 1px #e9730c; }
.ui5-attention:hover { background-color: #cf660b; }

/* 선택 상태 스타일(기본 규칙). 선택된 버튼은 강조 외곽선 등 */
.ui5-btn[data-selected="true"].ui5-default { background-color: #eaf1fb; box-shadow: inset 0 0 0 1px #0a6ed1; }
.ui5-btn[data-selected="true"].ui5-none { background-color: #eaf1fb; box-shadow: inset 0 0 0 1px #0a6ed1; }
.ui5-btn[data-selected="true"].ui5-emphasized { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.9); }
.ui5-btn[data-selected="true"].ui5-transparent { background-color: rgba(10,110,209,0.20); box-shadow: inset 0 0 0 1px #0a6ed1; }
.ui5-btn[data-selected="true"].ui5-positive { box-shadow: inset 0 0 0 2px #ffffff; filter: brightness(1.05); }
.ui5-btn[data-selected="true"].ui5-negative { boxhadow: inset 0 0 0 2px #ffffff; filter: brightness(1.05); }
.ui5-btn[data-selected="true"].ui5-attention { box-shadow: inset 0 0 0 2px #ffffff; filter: brightness(1.05); }
`;

// 버튼 인덱스별 공백 순번 규칙 타입
export type LineBreakRules = Record<number, number[]>;

/**
 * 인덱스별 N번째 공백을 '\n'으로 치환하는 formatItemText 생성기
 */
export function createSpaceIndexFormatter(
  rules: LineBreakRules
): (text: string, index: number) => string {
  return (text: string, index: number): string => {
    const targets = rules[index];
    if (!targets || targets.length === 0) return text;

    let spaceCount = 0;
    let result = "";

    for (const ch of text) {
      if (ch === " ") {
        spaceCount += 1;
        if (targets.includes(spaceCount)) {
          result += "\n"; // 이 공백은 줄바꿈으로 치환
          continue;
        }
      }
      result += ch;
    }

    return result;
  };
}

