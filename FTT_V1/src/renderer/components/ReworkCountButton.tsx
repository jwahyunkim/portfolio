// src/renderer/components/ReworkCountButton.tsx
import React from "react";

type ReworkStage = "1st" | "Multi";

type Props = {
  reworkStage: ReworkStage;
};

export default function ReworkCountButton({ reworkStage }: Props) {
  const label = reworkStage === "Multi" ? "Multi" : "1st";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        padding: "6px",
      }}
    >
      <div
        style={{
          fontSize: "2.5rem",
          fontWeight: 500,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label} Rework
      </div>
    </div>
  );
}
