// src/renderer/components/SizeSelector.tsx
import React, { useMemo } from "react";

type Props = {
    title: string;
    items: string[];

    /** 선택값(부모 상태) */
    selectedValue: string;

    /** 선택 변경 콜백(부모 상태 업데이트) */
    onChange: (value: string) => void;
};

export default function SizeSelector({ title, items, selectedValue, onChange }: Props) {
    const options = useMemo(() => items, [items]);

    const containerStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid rgba(0, 0, 0, 1)",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
    };

    const headerStyle: React.CSSProperties = {
        backgroundColor: "#156082",
        color: "#ffffff",
        fontSize: "1.3rem",
        fontWeight: 500,
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
    };

    // body 자체가 selectbox처럼 보이게: select는 테두리/배경 없이 body를 꽉 채움
    const bodyStyle: React.CSSProperties = {
        backgroundColor: "#ffffff",
        color: "#000000",
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        flex: "2 1 0",
        padding: "0",
        boxSizing: "border-box",
        cursor: "pointer",
    };

    // select는 body 전체를 클릭 영역으로 사용 + 화살표 제거 + 가운데 정렬
    const selectStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        minWidth: 0,
        border: "none",
        backgroundColor: "transparent",
        outline: "none",
        fontSize: "1.6rem",
        fontWeight: 600,
        lineHeight: 1.4,
        padding: "0.8vh 0.8rem",
        boxSizing: "border-box",
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        textAlign: "center",
        textAlignLast: "center",
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>{title}</div>
            <div style={bodyStyle}>
                <select
                    style={selectStyle}
                    value={selectedValue}
                    onChange={(e) => onChange(e.target.value)}
                >
                    <option value="" hidden disabled></option>
                    {options.map((v) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
