// src/pages/Defect_Management_BONDING.tsx
import '../MyApp.css'
import './Defect_Management_Bonding.css'
import Defect_Management_Bonding_POPUP from './Defect_Management_Bonding_POPUP'

import { useRef, useState, JSX, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@ui5/webcomponents-react'
// Custom Components
import CustomSingleButton from '../../components/CustomSingleButton'
import TimeNow from '../../components/TimeNow'
import CustomSelect from '../../components/CustomSelect'
import ToggleContainer from '../../components/ToggleContainer'
import CustomDatePicker from '../../components/CustomDatePicker'

import AlertDialog, { AlertDialogRef } from "../../components/AlertDialog";
import CustomTable from '../../components/CustomTable'
import {
  fetchPlants,
  fetchFgaWorkCenters,
  fetchDefectResultReportBySize,
  type DefectResultRow,
} from '../../data/api/index'

type DefectResultRowWithCheck = DefectResultRow

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function getTodayYYYYMMDD() {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}


export default function Defect_Management_BONDING(): JSX.Element {

  const navigate = useNavigate()
  const [debugMode, setDebugMode] = useState(false)

  const [plant, setPlant] = useState<string>("")
  const [plantOptions, setPlantOptions] = useState<Record<string, string>>({}) // code → name

  const [workCenter, setWorkCenter] = useState<string>("")
  const [workCenterOptions, setWorkCenterOptions] = useState<Record<string, string>>({}) // code → name

  const [reportRows, setReportRows] = useState<DefectResultRowWithCheck[]>([])

  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")

  // alertRef 사용방법
  //   if (type === 'S' && !p.defects.length) {
  //   alertRef.current?.show("Select defect type!");
  //   return false
  // }
  const alertRef = useRef<AlertDialogRef>(null);

  // 로딩중 표시 변수
  const [loading2, setLoading2] = useState<boolean>(false)
  const [errorMsg2, setErrorMsg2] = useState<string>('')

  const [popupOpen, setPopupOpen] = useState(false)

  const columns = [
    { Header: "Defect Date", accessor: "defect_date" },
    { Header: "Plant", accessor: "plant_name" },
    { Header: "Work Center", accessor: "work_center_name" },
    { Header: "Line", accessor: "line_name" },
    // { Header: "Material Code", accessor: "material_code" },
    { Header: "Style Name", accessor: "zcf_style_nm" },
    { Header: "Style Code", accessor: "zcf_style_cd" },
    { Header: "Total", accessor: "defect_qty_sum" },
    { Header: "1", accessor: "size_1" },
    { Header: "1T", accessor: "size_1t" },
    { Header: "2", accessor: "size_2" },
    { Header: "2T", accessor: "size_2t" },
    { Header: "3", accessor: "size_3" },
    { Header: "3T", accessor: "size_3t" },
    { Header: "4", accessor: "size_4" },
    { Header: "4T", accessor: "size_4t" },
    { Header: "5", accessor: "size_5" },
    { Header: "5T", accessor: "size_5t" },
    { Header: "6", accessor: "size_6" },
    { Header: "6T", accessor: "size_6t" },
    { Header: "7", accessor: "size_7" },
    { Header: "7T", accessor: "size_7t" },
    { Header: "8", accessor: "size_8" },
    { Header: "8T", accessor: "size_8t" },
    { Header: "9", accessor: "size_9" },
    { Header: "9T", accessor: "size_9t" },
    { Header: "10", accessor: "size_10" },
    { Header: "10T", accessor: "size_10t" },
    { Header: "11", accessor: "size_11" },
    { Header: "11T", accessor: "size_11t" },
    { Header: "12", accessor: "size_12" },
    { Header: "12T", accessor: "size_12t" },
    { Header: "13", accessor: "size_13" },
    { Header: "13T", accessor: "size_13t" },
    { Header: "14", accessor: "size_14" },
    { Header: "OTHERS", accessor: "size_others" },
    // { Header: "Order No", accessor: "order_number" },
  ];

  const abortRef = useRef<AbortController | null>(null)

  //TODO:: 사용안함 삭제 해야됨
  // defect_check → S/Q 컬럼으로 가공
  const processReportRows = (rows: DefectResultRow[]): DefectResultRowWithCheck[] => {
    return rows.map((row) => {
      const typedRow = row as Record<string, unknown>
      const check = typeof typedRow['defect_check'] === 'string' ? typedRow['defect_check'] : ''
      const qty = (typedRow['defect_qty'] ?? '') as number | string | null

      return {
        ...row,
        SelfCheck: check === 'S' ? qty : '',
        QC: check === 'Q' ? qty : '',
      }
    })
  }

  const loadFilterData = async () => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading2(true)
    setErrorMsg2('')

    try {
      const plantResp = await fetchPlants()
      const plantMap: Record<string, string> = Object.fromEntries(
        plantResp.data.map((p: { plant_cd: string; plant_nm: string }) => [p.plant_cd, p.plant_nm])
      )
      setPlantOptions(plantMap)

      const plantCodes = Object.keys(plantMap)
      if (plant && !plantCodes.includes(plant)) {
        setPlant('')
      }

      let wcMap: Record<string, string> = {}
      if (plant) {
        const workCenterResp = await fetchFgaWorkCenters({
          plant: plant,
        })
        wcMap = Object.fromEntries(
          workCenterResp.data.map((wc: { code: string; name: string }) => [wc.code, wc.name])
        )
      }
      setWorkCenterOptions(wcMap)

      const wcCodes = Object.keys(wcMap)
      if (workCenter && !wcCodes.includes(workCenter)) {
        setWorkCenter('')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request failed'
      setErrorMsg2(msg)
    } finally {
      setLoading2(false)
    }
  }

  const handleSearch = async () => {
    try {
      if (!plant) {
        alertRef.current?.show("Select plant!");
        return;
      }

      const res = await fetchDefectResultReportBySize({
        plantCd: plant,
        defectForm: "BONDING",
        // defectForm: "BTM_INT",
        workCenter: workCenter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (!res.success) {
        alertRef.current?.show(res.message || "Failed to load defect report.");
        return;
      }
      console.log('res', res)

      const processed = processReportRows(res.data)
      setReportRows(processed);

      console.log('reportRows', reportRows)
    } catch (error) {
      console.error("Error in handleSearch (defect result report):", error);
      alertRef.current?.show("Error while loading defect report.");
    }
  };

  useEffect(() => {
    void loadFilterData()
  }, [])

  useEffect(() => {
    void loadFilterData()
  }, [plant, workCenter])
  //////////

  return (
    <div className={debugMode ? 'dev-main' : ''} style={{ height: '98vh', display: 'flex', flexDirection: 'column', backgroundColor: debugMode ? '#00ccff' : '#f5f6f7' }}>
      {/* 상단 */}
      <div
        className={debugMode ? 'dev-scope-header' : ''}
        style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0, height: '8vh', backgroundColor: '#203764' }}
      >
        <div style={{ fontSize: '2vw', color: 'white', display: 'flex', alignItems: 'center', marginLeft: '1vw' }}>
          Bonding Test
        </div>
        <Button onClick={() => setDebugMode(!debugMode)}>{debugMode ? 'Debug OFF' : 'Debug ON'}</Button>
        <div
          style={{ fontSize: '2vw', color: 'white', display: 'flex', alignItems: 'center', marginRight: '1vw' }}
          onClick={() => { void navigate('/'); }}
        >
          <TimeNow />
        </div>
      </div>

      {/* 필터 행 */}
      <div className={debugMode ? 'dev-scope-section filter-row' : 'filter-row'} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, backgroundColor: '#ffffff' }}>
        <div className={debugMode ? 'dev-scope-filter-row' : ''} style={{ display: 'flex', alignItems: 'flex-start', margin: '2vh', gap: '1vw' }}>
          {/* 옵션 선택 */}
          <div style={{ display: "flex", gap: "1vw", alignItems: "center", flexWrap: "wrap", width: '100%' }}>
            {/* 첫번째 행 */}
            <div style={{ display: "flex", gap: "2vw", alignItems: "center", flexWrap: "wrap", width: '100%' }}>

              <div style={{ display: "flex", flexDirection: 'row', alignItems: "flex-start", gap: '1vw' }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    color: "#556b82",
                    borderRadius: "0.25rem",
                    fontWeight: 'normal',
                    fontSize: "1.2rem",
                    height: "4vh",
                  }}
                >
                  Date
                </span>
                <CustomDatePicker
                  value={startDate}
                  onChange={setStartDate}
                  boxWidth="10vw"
                  boxHeight="4vh"
                  innerFont="1vw"
                  displayFormat="yyyy-MM-dd"
                  valueFormat="yyyyMMdd"
                />
                <span style={{ alignSelf: 'center', fontSize: '1.2rem', color: '#556b82' }}>~</span>
                <CustomDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  boxWidth="10vw"
                  boxHeight="4vh"
                  innerFont="1vw"
                  displayFormat="yyyy-MM-dd"
                  valueFormat="yyyyMMdd"
                />
              </div>

              <div style={{ display: "flex", flexDirection: 'row', alignItems: "flex-start", gap: '1vw' }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    color: "#556b82",
                    borderRadius: "0.25rem",
                    fontWeight: 'normal',
                    fontSize: "1.2rem",
                    height: "4vh",
                  }}
                >
                  Plant
                </span>
                <CustomSelect
                  options={plantOptions}
                  value={plant}
                  onChange={setPlant}
                  placeholder=""
                  selectFontSize="0.9vw"
                  iconSize="1vw"
                  name="plant"
                  boxWidth="10vw"
                />
              </div>

              <div style={{ display: "flex", flexDirection: 'row', alignItems: "flex-start", gap: '1vw' }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    color: "#556b82",
                    borderRadius: "0.25rem",
                    fontWeight: 'normal',
                    fontSize: "1.2rem",
                    height: "4vh",
                  }}
                >
                  Work Center
                </span>
                <CustomSelect
                  options={workCenterOptions}
                  value={workCenter}
                  onChange={setWorkCenter}
                  placeholder=""
                  selectFontSize="0.9vw"
                  iconSize="1vw"
                  name="workCenter"
                  boxWidth="20vw"
                />
              </div>

              <div style={{ display: "flex", flexDirection: 'row', alignItems: "flex-start", gap: '1vw' }}>
                <CustomSingleButton
                  title='Search'
                  width='8vw'
                  emphasized={false}
                  onClick={() => { void handleSearch(); }}
                />
                <CustomSingleButton
                  title='Register'
                  width='8vw'
                  onClick={() => { setPopupOpen(true) }}
                />
              </div>
            </div>
          </div>
        </div>

      </div>
      {/* Grid2 */}
      <div
        className={debugMode ? 'dev-scope-grid-section2' : ''}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', margin: '1vh', height: 'auto' }}
      >
        <ToggleContainer
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>Defect Information</span>
              {loading2 && <span>Loading...</span>}
              {errorMsg2 && <span style={{ color: 'red' }}>{errorMsg2}</span>}
            </div>
          }
          titleStyle={{ fontSize: '1.3rem', margin: '0 10px', fontWeight: 'bolder' }}
          topBarWidth="97vw"
          topBarStyle={{ height: '5vh', borderBottom: '1px solid #3a3a3aff', backgroundColor: '#ffff', boxShadow: "0 2px 6px #00000014" }}
          defaultCollapsed={false}
          style={{ width: 'auto', height: 'auto' }}
          contentWrapperStyle={{ width: '96.1vw', backgroundColor: '#ffff', overflowX: 'auto' }}
        >
          <div style={{ height: 'fit-content', width: 'fit-content', marginBottom: '0vh', overflowY: 'auto', overflowX: 'auto' }}>
            <CustomTable
              rootClassName='my-table3 report-by-size'
              columns={columns}
              data={reportRows}

              // colSizes={{
              //   0: "7vw",
              //   1: "6vw",
              //   2: "12vw",
              //   3: "5.3vw",
              //   // 4: "15vw",
              //   // 5: "15vw",
              //   6: "4vw",
              //   7: "4vw",
              //   8: "10vw",
              //   9: "5vw",
              //   10: "4vw",
              //   11: "8vw",
              //   12: "4vw",
              // }}
              subtotalBy={0}
              // subtotalLabel='Sub Total'
              subtotalLabel={(groupValue) => {
                // groupValue → 안전하게 문자열로 변환
                const rawDate =
                  typeof groupValue === 'string' || typeof groupValue === 'number'
                    ? String(groupValue)
                    : '';

                // 20251127 → 2025-11-27
                const date =
                  rawDate.length === 8 && /^\d{8}$/.test(rawDate)
                    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                    : rawDate;

                // plant 는 문자열이라고 했으니 문자열일 때만 사용 //plant 사용하려면 subtotalLabel={(groupValue, firstRow) => { 이걸로
                // const plant =
                //   firstRow && typeof (firstRow).plant_name === 'string'
                //     ? (firstRow).plant_name
                //     : '';

                return `SubTotal  (${date})`;
              }}
              subtotalColsInclude={[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34]}
              subtotalLabelSpan={3}
              totalRowSize='5vh'
              totalColsInclude={[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34]}
              totalLabel='Total'
              showTotalRow={true}
              autoFitContent={{ enabled: true, paddingPx: 30, includeHeader: true }}
              rowSizes={{ 0: '6vh' } as Record<number, string>}
              defaultRowSize='4vh'
              horizontalAlign="center"
              verticalAlign="middle"
              hasVerticalOverflow
              mergedCellsSpecMode='original'
              visibleRows={15}
              onCellClickDetailed={({ gridRow, col, dataIndexFiltered, dataIndexOriginal, row }) => {
                if (!row) return
                console.log({ gridRow, col, dataIndexFiltered, dataIndexOriginal, row })
              }}
              cellStyle={(_row, col) => {
                if (col === 0)
                  return {
                    justifyContent: 'flex-start',
                    paddingLeft: '20px'   // margin 대신 padding 사용
                  }
                return {}
              }}



            />
          </div>
        </ToggleContainer>
      </div>
      <Defect_Management_Bonding_POPUP
        isOpen={popupOpen}
        onClose={() => { setPopupOpen(false) }}
        onCloseWithSelection={({ plant, workCenter, defectDate }) => {
          setPlant(plant)
          setWorkCenter(workCenter)


          const dateParam = defectDate || getTodayYYYYMMDD()
          setStartDate(dateParam)
          setEndDate(dateParam)


          void fetchDefectResultReportBySize({
            plantCd: plant,
            defectForm: "BONDING",
            workCenter: workCenter || undefined,
            startDate: dateParam,
            endDate: dateParam,
          }).then((res) => {
            if (!res.success) return
            const processed = processReportRows(res.data)
            setReportRows(processed)
          })
        }}
      />
      <AlertDialog ref={alertRef} />
    </div>
  )
}
