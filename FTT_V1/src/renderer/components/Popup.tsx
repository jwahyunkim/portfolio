// src/renderer/components/Popup.tsx
import React from "react";

type Props = {
  open: boolean;
  message: string;
  onClose: () => void;
};

export default function Popup({ open, message, onClose }: Props) {
  if (!open) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
  };

  const modalStyle: React.CSSProperties = {
    width: "520px",
    maxWidth: "90vw",
    backgroundColor: "#ffffff",
    border: "1px solid rgba(0, 0, 0, 1)",
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    backgroundColor: "#156082",
    color: "#ffffff",
    padding: "10px 12px",
    fontSize: "16px",
    fontWeight: 700,
    lineHeight: 1.2,
    borderBottom: "1px solid rgba(0, 0, 0, 1)",
  };

  const bodyStyle: React.CSSProperties = {
    padding: "16px 12px",
    fontSize: "16px",
    fontWeight: 600,
    lineHeight: 1.3,
    color: "#000000",
    wordBreak: "break-word",
  };

  const footerStyle: React.CSSProperties = {
    padding: "10px 12px",
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    borderTop: "1px solid rgba(0, 0, 0, 1)",
  };

  const okBtnStyle: React.CSSProperties = {
    width: "120px",
    height: "42px",
    border: "1px solid rgba(0, 0, 0, 1)",
    backgroundColor: "#156082",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 700,
  };

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>Notice</div>
        <div style={bodyStyle}>{message}</div>
        <div style={footerStyle}>
          <button type="button" style={okBtnStyle} onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
