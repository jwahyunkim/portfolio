// src/renderer/components/StatusTile.tsx
import React from "react";

type StyleParts = {
  container?: React.CSSProperties;
  header?: React.CSSProperties;
  body?: React.CSSProperties;
  title?: React.CSSProperties;
  value?: React.CSSProperties;
};

type Props = {
  title: string;
  value: React.ReactNode;
  styles?: StyleParts;
};

export default function StatusTile({ title, value, styles }: Props) {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    // borderRadius: "6px",
    overflow: "hidden",
    border: "1px solid rgba(0, 0, 0, 1)",
    minWidth: 0,
    minHeight: 0,
    height: "100%",
    ...styles?.container,
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: "#156082",
    color: "#ffffff",
    // padding: "6px 8px",
    fontSize: "12px",
    lineHeight: 1.2,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: "1 1 0",
    ...styles?.header,
    ...styles?.title,
  };

  const bodyStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    color: "#000000",
    // padding: "8px",
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "14px",
    fontWeight: 600,
    flex: "2 1 0",
    ...styles?.body,
    ...styles?.value,
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>{title}</div>
      <div style={bodyStyle}>{value}</div>
    </div>
  );
}
