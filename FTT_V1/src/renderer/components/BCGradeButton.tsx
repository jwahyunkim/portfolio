// src/renderer/components/BCGradeButton.tsx
import React from "react";

type Grade = "B" | "C";

type Props = {
  grade: Grade;
};

export default function BCGradeButton({ grade }: Props) {
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
        {grade} Grade
      </div>
    </div>
  );
}
