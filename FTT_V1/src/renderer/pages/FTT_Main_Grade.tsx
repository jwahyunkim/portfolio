// src/renderer/pages/FTT_Main_Grade.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusTile from "../components/StatusTile";
import StyleSelector from "../components/StyleSelector";
import DefectCard from "../components/defectCard";
import Popup from "../components/Popup";
import BCGradeButton from "../components/BCGradeButton";
import SizeSelector from "../components/SizeSelector";
import { oracleApi } from "../api";
// 불량 유형은 "객체 배열"로 관리
type DefectType = {
  code: string;
  label: string;
};

type Grade = "B" | "C";

type PendingPayload = {
  styleValue: string;
  sizeValue: string;
  grade: Grade;
  defectTypes: DefectType[]; // 객체 배열
};

type FttStatusRow = {
  PLANT_NM: string | null;
  LINE_NM: string | number | null;
  PROD_QTY: number | null;
  REWORK_QTY: number | null;
  BC_QTY: number | null;
  FTT_RATE: number | null;
};

export default function FTT_Main_Grade() {
  const navigate = useNavigate();
  const [debug, setDebug] = useState(false);

  // ✅ StatusTile에 들어갈 값 (Plant=이름, Line=코드)
  const [plantName, setPlantName] = useState<string>("");
  const [lineCode, setLineCode] = useState<string>("");

  // ✅ FTT Status (API)
  const [fttStatus, setFttStatus] = useState<FttStatusRow | null>(null);

  // ✅ DefectCard items (API)
  const [defectItems, setDefectItems] = useState<
    { value: string; label: string; ftt: number; hfpa: number }[]
  >([]);

  // StyleSelector 선택값(부모에서 상태관리 → 나중에 다른 값들과 합쳐 API로 전송)
  const [selectedStyle, setSelectedStyle] = useState<string>("");

  // 예시 데이터(실제는 API/상태에서 주입)
  const [styleItems, setStyleItems] = useState<
    { value: string; label: string }[]
  >([]);

  // SizeSelector 선택값(부모에서 상태관리)
  const [selectedSize, setSelectedSize] = useState<string>("");

  // ✅ SizeSelector items (API)
  const [sizeItems, setSizeItems] = useState<string[]>([]);

  // 불량 유형(객체 배열) - 이 화면에서 선택될 예정
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);

  // B/C Grade(시작값 B 고정)
  const [selectedGrade, setSelectedGrade] = useState<Grade>("B");

  // OK 클릭 시 담아두는 payload (API는 아직 없음)
  const [pendingPayload, setPendingPayload] = useState<PendingPayload | null>(null);

  const [popupMessage, setPopupMessage] = useState<string | null>(null);

  // 더미 Size 데이터(1T~10T)
  // const sizeItems = ["1T", "2T", "3T", "4T", "5T", "6T", "7T", "8T", "9T", "10T"];

  // ✅ 최초 1회: Plant/Line/Defects/Styles/FTT-Status 로드
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [plantsRes, linesRes, defectsRes, stylesRes, fttStatusRes] = await Promise.all([
          oracleApi.getPlants(),
          oracleApi.getLines(),
          oracleApi.getDefects(),
          oracleApi.getStyles(),
          oracleApi.getFttStatus(),
        ]);

        if (!alive) return;

        const plant = plantsRes?.rows?.[0]?.PLANT_NM ?? "";
        const line = linesRes?.rows?.[0]?.LINE_CD ?? "";
        const defects = defectsRes?.rows ?? [];
        const styles = stylesRes?.rows ?? [];
        const statusRow = fttStatusRes?.rows?.[0] ?? null;

        setPlantName(String(plant || ""));
        setLineCode(String(line || ""));
        setDefectItems(defects);
        setFttStatus(statusRow);

        // 보여지는 텍스트는 label이 아니라 value로(=label을 value로 맞춤)
        setStyleItems(
          styles.map((s) => {
            const v = (s?.value ?? "").toString();
            return { value: v, label: v };
          }),
        );
      } catch (e: any) {
        if (!alive) return;
        setPopupMessage(String(e?.message || e));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const headerStyle: React.CSSProperties = {
    backgroundColor: debug ? "blue" : "transparent",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    width: "100%",
    flex: 2,
    minHeight: 0,
  };

  const headerLeftStyle: React.CSSProperties = {
    backgroundColor: debug ? "grey" : "transparent",
    padding: "8px",
    flex: "1 1 0",
    minWidth: 0,
    alignSelf: "stretch",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const headerRightStyle: React.CSSProperties = {
    backgroundColor: debug ? "green" : "transparent",
    padding: "8px",
    flex: "1 1 0",
    minWidth: 0,
    alignSelf: "stretch",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    gap: "8px",
  };

  const headerLeftGridStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "0",
    minWidth: 0,
    alignItems: "stretch",
  };

  const bodyStyle: React.CSSProperties = {
    backgroundColor: debug ? "orange" : "transparent",
    flex: 8,
    minHeight: 0,
  };

  const footerStyle: React.CSSProperties = {
    backgroundColor: debug ? "red" : "transparent",
    flex: 2,
    minHeight: 0,
    padding: "8px",
  };

  const debugBtnStyle: React.CSSProperties = {
    position: "absolute",
    top: "12px",
    right: "12px",
    zIndex: 9999,
  };

  // Footer UI
  const footerGridStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "0",
    alignItems: "stretch",
  };

  const footerBtnBaseStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    border: "1px solid rgba(0, 0, 0, 1)",
    backgroundColor: "#156082",
    color: "#ffffff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  const footerBtnTextStyle: React.CSSProperties = {
    fontSize: "2.5rem",
    fontWeight: 500,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  };

  const onClickBCGrade = () => {
    // FIXME: replace route
    navigate("/ftt/rework");
  };

  const onClickReport = () => {
    // FIXME: replace route
    navigate("/ftt/report");
  };

  const onClickClear = () => {
    setSelectedStyle("");
    setSelectedSize("");
    setSizeItems([]);
    setDefectTypes([]);
    setPendingPayload(null);
    setSelectedGrade("B");
  };

  const onClickGradeToggle = () => {
    setSelectedGrade((prev) => (prev === "B" ? "C" : "B"));
  };

  const onClickOK = async () => {
    const styleMissing = selectedStyle.trim() === "";
    const sizeMissing = selectedSize.trim() === "";
    const defectMissing = defectTypes.length === 0;
    const gradeMissing = selectedGrade !== "B" && selectedGrade !== "C";

    if (styleMissing && sizeMissing && defectMissing && gradeMissing) {
      setPopupMessage("Please select a style, a size, a grade, and at least one defect.");
      return;
    }
    if (styleMissing && sizeMissing && defectMissing) {
      setPopupMessage("Please select a style, a size, and at least one defect.");
      return;
    }
    if (styleMissing && sizeMissing) {
      setPopupMessage("Please select a style and a size.");
      return;
    }
    if (styleMissing && defectMissing) {
      setPopupMessage("Please select a style and at least one defect.");
      return;
    }
    if (sizeMissing && defectMissing) {
      setPopupMessage("Please select a size and at least one defect.");
      return;
    }
    if (styleMissing) {
      setPopupMessage("Please select a style.");
      return;
    }
    if (sizeMissing) {
      setPopupMessage("Please select a size.");
      return;
    }
    if (gradeMissing) {
      setPopupMessage("Please select a grade.");
      return;
    }
    if (defectMissing) {
      setPopupMessage("Please select at least one defect.");
      return;
    }

    setPendingPayload({
      styleValue: selectedStyle,
      sizeValue: selectedSize,
      grade: selectedGrade,
      defectTypes, // 객체 배열
    });

    try {
      const defect_type = defectTypes.map((d) => d.code).join(",");
      const defect_qty = defectTypes.length;

      await oracleApi.saveFttResultV1({
        material_cd: selectedStyle, // 테스트: 빈값
        style_cd: selectedStyle,
        size_cd: selectedSize,
        ftt_type: selectedGrade, // "B" | "C"
        defect_type, // "001" or "001,002"
        rework_count: 0,
        defect_qty, // 선택한 불량 개수
        creator: "TEST",
        create_pc: "TEST",
      });

      setPopupMessage("Saved");
      onClickClear();
    } catch (e: any) {
      setPopupMessage(String(e?.message || e));
    }
  };

  const onToggleDefect = (defect: DefectType) => {
    setDefectTypes((prev) => {
      const exists = prev.some((d) => d.code === defect.code);
      if (exists) return prev.filter((d) => d.code !== defect.code);
      return [...prev, defect];
    });
  };

  const handleStyleChange = (value: string) => {
    setSelectedStyle(value);

    // A안: 스타일 변경 시 size는 무조건 초기화
    setSelectedSize("");

    const style = String(value ?? "").trim();
    if (!style) {
      setSizeItems([]);
      return;
    }

    (async () => {
      try {
        const r = await oracleApi.getStyleSizes(style);
        if (!r?.ok) {
          setSizeItems([]);
          setPopupMessage(r?.error || "Size 조회 실패");
          return;
        }

        const items = (r?.rows ?? [])
          .map((x: any) => (x?.value ?? "").toString())
          .filter((v: string) => v.trim() !== "");

        setSizeItems(items);
      } catch (e: any) {
        setSizeItems([]);
        setPopupMessage(String(e?.message || e));
      }
    })();
  };

  const productionValue =
    fttStatus?.PROD_QTY === null || fttStatus?.PROD_QTY === undefined ? "-" : String(fttStatus.PROD_QTY);

  const reworkValue =
    fttStatus?.REWORK_QTY === null || fttStatus?.REWORK_QTY === undefined ? "-" : String(fttStatus.REWORK_QTY);

  const bcValue =
    fttStatus?.BC_QTY === null || fttStatus?.BC_QTY === undefined ? "-" : String(fttStatus.BC_QTY);

  const fttValue =
    fttStatus?.FTT_RATE === null || fttStatus?.FTT_RATE === undefined ? "-" : `${fttStatus.FTT_RATE}%`;

  return (
    <div style={{ height: "97vh", display: "flex", flexDirection: "column" }}>
      <button style={debugBtnStyle} onClick={() => setDebug((v) => !v)}>
        Debug
      </button>

      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <div style={headerLeftGridStyle}>
            <StatusTile title="Plant" value={plantName} styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "1.3rem", fontWeight: '500' } }} />
            <StatusTile title="Line" value={lineCode} styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "1.3rem", fontWeight: '500' } }} />
            <StatusTile title="Production" value={productionValue} styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: '500' } }} />
            <StatusTile title="Rework" value={reworkValue} styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: '500' } }} />
            <StatusTile title="B/C Grade" value={bcValue} styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: '500' } }} />
            <StatusTile title="FTT" value={fttValue} styles={{ header: { fontSize: "1.3rem" }, body: { fontSize: "2rem", fontWeight: '500' } }} />
          </div>
        </div>

        <div style={headerRightStyle}>
          <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, flex: "4 1 0" }}>
            <StyleSelector
              title="Style"
              items={styleItems}
              visibleCount={4}
              step={3}
              selectedValue={selectedStyle}
              onChange={handleStyleChange}
              wrap={false}
            />
          </div>

          <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, flex: "1 1 0" }}>
            <SizeSelector
              title="Size"
              items={sizeItems}
              selectedValue={selectedSize}
              onChange={(value) => setSelectedSize(value)}
            />
          </div>
        </div>
      </div>

      <div style={bodyStyle}>
        <div
          style={{
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            padding: "8px",
            boxSizing: "border-box",
          }}
        >
          <DefectCard
            items={defectItems}
            columns={5}
            rows={5}
            selectedDefects={defectTypes}
            onToggle={(d) => onToggleDefect(d)}
          />
        </div>
      </div>

      <div style={footerStyle}>
        <div style={footerGridStyle}>
          <button type="button" style={footerBtnBaseStyle} onClick={onClickBCGrade}>
            <div style={footerBtnTextStyle}>Rework</div>
          </button>

          <button type="button" style={footerBtnBaseStyle} onClick={onClickReport}>
            <div style={footerBtnTextStyle}>Report</div>
          </button>

          <button type="button" style={footerBtnBaseStyle} onClick={onClickClear}>
            <div style={footerBtnTextStyle}>Clear</div>
          </button>

          <button type="button" style={footerBtnBaseStyle} onClick={onClickGradeToggle}>
            <BCGradeButton grade={selectedGrade} />
          </button>

          <button type="button" style={footerBtnBaseStyle} onClick={onClickOK}>
            <div style={footerBtnTextStyle}>OK</div>
          </button>
        </div>
      </div>

      {/* pendingPayload는 OK 클릭 시 "담기는" 값. (API 전송은 아직 없음) */}
      {/* debug용으로만 유지하고, 화면에는 표시하지 않음 */}
      {/* console.log 등은 요청 없어서 추가하지 않음 */}

      <Popup
        open={popupMessage !== null}
        message={popupMessage ?? ""}
        onClose={() => setPopupMessage(null)}
      />
    </div>
  );
}
