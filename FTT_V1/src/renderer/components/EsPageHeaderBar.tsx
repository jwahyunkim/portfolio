// src/renderer/components/EsPageHeaderBar.tsx
// ▶ 공용 상단 헤더 바
// ▶ 기존 E_ScanOutgoing_Header 의 상단 보라색 영역을 100% 그대로 공용화
//    - 왼쪽: 타이틀 (i18n key 필수)
//    - 오른쪽: 뒤로가기 아이콘 + ClockDisplay (서버 시간/타임존 포함)

import React, { useEffect } from "react";
import { FlexBox, Label } from "@ui5/webcomponents-react";
import { useNavigate } from "react-router-dom";

import "@ui5/webcomponents-react/dist/Assets.js";
import "@ui5/webcomponents-icons/dist/Assets.js";
import "@ui5/webcomponents-localization/dist/Assets.js";

import { initI18n, t } from "../utils/i18n";
import ClockDisplay from "./ClockDisplay";

import backIcon from "@renderer/resources/Back-Icon.png";

export interface EsPageHeaderBarProps {
  /** 헤더 타이틀에 사용할 i18n 키 (예: "app.title.escanHeader") */
  titleKey: string;

  /** 기본값: true. false 로 주면 뒤로가기 아이콘을 숨김 */
  showBackButton?: boolean;

  /**
   * 뒤로가기 클릭 시 호출.
   * - 지정 안 하면 기본으로 navigate("/") 실행
   */
  onBackClick?: () => void;

  /**
   * ClockDisplay 왼쪽(=오른쪽 영역 안)에 추가로 넣고 싶은 내용이 있을 때 사용.
   * 예: 버전 표시, 상태 아이콘 등
   */
  rightExtra?: React.ReactNode;
}

const EsPageHeaderBar: React.FC<EsPageHeaderBarProps> = ({
  titleKey,
  showBackButton = true,
  onBackClick,
  rightExtra,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    // 페이지에서 따로 신경 안 써도 항상 i18n 초기화 되도록 공용 처리
    initI18n().catch(() => {});
  }, []);

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
      return;
    }
    // 기본 동작: 메인 메뉴로 이동
    navigate("/");
  };

  return (
    <FlexBox
      style={{ backgroundColor: "#0F005F", height: "5rem" }}
      justifyContent="SpaceBetween"
      alignItems="Center"
    >
      {/* 🔹 왼쪽: 타이틀 (무조건 i18n key 사용) */}
      <Label
        style={{
          fontSize: "2rem",
          fontWeight: "bold",
          color: "white",
          paddingLeft: "0.75rem",
        }}
      >
        {t(titleKey)}
      </Label>

      {/* 🔹 오른쪽: Back 아이콘 + (옵션 영역) + ClockDisplay */}
      <FlexBox
        direction="Row"
        alignItems="Start"
        style={{ gap: "1rem", paddingRight: "0.75rem" }}
      >
        {showBackButton && (
          <img
            src={backIcon}
            alt={t("app.icon.backAlt")}
            onClick={handleBackClick}
            style={{
              width: "60px",
              height: "70px",
              padding: 0,
              marginTop: 6,
              cursor: "pointer",
            }}
          />
        )}

        {/* 필요 시 추가로 상태/버전 표시 등 넣을 자리 */}
        {rightExtra}

        {/* 기존과 동일하게 서버/타임존 연동 ClockDisplay 사용 */}
        <ClockDisplay />
      </FlexBox>
    </FlexBox>
  );
};

export default EsPageHeaderBar;
