// src/components/ClockDisplay.tsx
import React from "react";
import { FlexBox, Label } from "@ui5/webcomponents-react";
import {
  usePlantClock,
  formatTimeInTZ,
  formatYYYYMMDDInTZ,
} from "../time/usePlantClock";

type Props = { iconSize?: number };

export default function ClockDisplay({ iconSize = 18 }: Props) {
  const { nowTime, displayReady, displaySource, displayTZ } = usePlantClock();

  const isKnown = displaySource === "plant" || displaySource === "local";
  const sourceDotColor = isKnown ? "#18a558" : "#A9A9A9";
  const title =
    (displaySource === "plant"
      ? "시간 소스: DMC/Plant 표준시간"
      : displaySource === "local"
      ? "시간 소스: 로컬 PC 시간"
      : "시간 소스: 미정") + (displayTZ ? ` / TZ=${displayTZ}` : "");

  return (
    <FlexBox direction="Row" alignItems="Start" style={{ gap: "1rem" }}>
      <div style={{ position: "relative", width: 24, height: 24, marginTop: "12px" }}>
        {displaySource === "local" ? (
          // △ 로컬 소스일 때: 초록 삼각형
          <div
            title={title}
            style={{
              position: "absolute",
              top: 0,
              left: 3,
              width: 0,
              height: 0,
              borderLeft: "9px solid transparent",
              borderRight: "9px solid transparent",
              borderBottom: `16px solid ${sourceDotColor}`,
              filter: "drop-shadow(0 0 2px rgba(0,0,0,0.35))",
              pointerEvents: "none",
            }}
          />
        ) : (
          // ● 플랜트 or 미정: 원형 (미정이면 회색)
          <div
            title={title}
            style={{
              position: "absolute",
              top: 3,
              left: 3,
              width: iconSize,
              height: iconSize,
              borderRadius: "50%",
              backgroundColor: sourceDotColor,
              border: "2px solid white",
            }}
          />
        )}
      </div>

      <FlexBox direction="Column" alignItems="End" style={{ lineHeight: "1.2" }}>
        <Label
          style={{ fontSize: "2rem", color: "white", fontWeight: "bold", marginRight: "0.5rem" }}
          title={displayTZ || undefined}
        >
          {displayReady && displayTZ ? formatYYYYMMDDInTZ(nowTime, displayTZ) : "—"}
        </Label>
        <Label
          style={{ fontSize: "2rem", color: "white", fontWeight: "bold", marginRight: "0.5rem" }}
          title={displayTZ || undefined}
        >
          {displayReady && displayTZ ? formatTimeInTZ(nowTime, displayTZ) : "—"}
        </Label>
      </FlexBox>
    </FlexBox>
  );
}
