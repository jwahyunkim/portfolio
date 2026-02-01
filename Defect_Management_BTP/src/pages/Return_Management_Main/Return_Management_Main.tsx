import '../MyApp.css'
import './Return_Management_Main.css'

import { useRef, useState, JSX, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@ui5/webcomponents-react'

// Custom Components
import CustomSingleButton from '../../components/CustomSingleButton'
import CustomDatePicker from '../../components/CustomDatePicker'
import CustomSelect from '../../components/CustomSelect'
import TimeNow from '../../components/TimeNow'
import ToggleContainer from '../../components/ToggleContainer'
import AlertDialog, { AlertDialogRef } from "../../components/AlertDialog"
import ConfirmDialog from '../../components/ConfirmDialog'
import CustomTable from '../../components/CustomTable'

// Data/API
import {
  fetchReturnPlants,
  fetchReturnWorkCenters,
  fetchReturnLines,
  fetchDefectResults,
  updateConfirm,
  putScrapStoForReturn,
  type Plant,
  type WorkCenter,
  type ReturnDefectResultRow,
  type DefectItem,
  type ReturnScrapStoInputItem
} from '../../data/api/index'

type HandleOptions = {
  handleConfirm: () => void
  handleCancel: () => void
}

export default function E_Scan_Return_Main(): JSX.Element {
  const navigate = useNavigate()
  const alertRef = useRef<AlertDialogRef>(null)

  // ConfirmDialog 상태
  const [openConfirmDialog, setOpenConfirmDialog] = useState<boolean>(false)
  const [confirmDialogHandlers, setConfirmDialogHandlers] = useState<HandleOptions>({
    handleConfirm: () => setOpenConfirmDialog(false),
    handleCancel: () => setOpenConfirmDialog(false),
  })
  const confirmDialogConfirmLabel = useRef<string>("")
  const confirmDialogBodyKey = useRef<string>("")
  const confirmDialogShowCancel = useRef<boolean>(true)
  const confirmDialogType = useRef<'alert' | 'information' | 'error' | 'success'>('information')

  // Debug 모드
  const [debugMode, setDebugMode] = useState(false)

  // 필터 상태
  const [dateFrom, setDateFrom] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [dateTo, setDateTo] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )

  const [plants, setPlants] = useState<Plant[]>([])
  const [plantCd, setPlantCd] = useState<string>('C200')  // 기본값: Vinh Cuu (C200)

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([])
  const [workCenter, setWorkCenter] = useState<string>('')  // code 값 저장

  const [lines, setLines] = useState<string[]>([])
  const [lineCd, setLineCd] = useState<string>('')

  const [confirmStatus, setConfirmStatus] = useState<string>('N')  // 기본값: Not yet confirm

  // 테이블 데이터
  const [defectResults, setDefectResults] = useState<ReturnDefectResultRow[]>([])

  // 체크박스 선택 상태 (필터된 인덱스 기준)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  // 로딩 및 에러
  const [loading, setLoading] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>('')

  // AbortController
  const abortRef = useRef<AbortController | null>(null)

  /**
   * 날짜 형식 변환: YYYY-MM-DD → YYYYMMDD
   */
  const formatDateToYYYYMMDD = (dateStr: string): string => {
    return dateStr.replace(/-/g, '')
  }

  // 행 고유키(필터/정렬 변경에도 안정적으로 동일)
  // defect_no는 중복 가능하므로 복합키 사용
  const keyFor = (r: ReturnDefectResultRow): string => `${r.plant_cd}__${r.defect_form}__${r.defect_no}`

  /**
   * Plant 목록 로드
   */
  const loadPlants = async () => {
    try {
      const res = await fetchReturnPlants()
      if (res.success) {
        setPlants(res.data)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load plants'
      console.error('[loadPlants] Error:', msg)
    }
  }

  /**
   * Work Center 목록 로드 (Plant 변경 시)
   */
  const loadWorkCenters = async () => {
    if (!plantCd) {
      setWorkCenters([])
      return
    }

    try {
      const res = await fetchReturnWorkCenters({
        plant: plantCd
      })
      if (res.success) {
        setWorkCenters(res.data)  // 전체 객체 저장 [{ code, name }, ...]

        // 기존 선택값(code)이 새 목록에 없으면 초기화
        if (workCenter && !res.data.some(wc => wc.code === workCenter)) {
          setWorkCenter('')
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load work centers'
      console.error('[loadWorkCenters] Error:', msg)
      setWorkCenters([])
    }
  }

  /**
   * Line 목록 로드 (Plant, Work Center 변경 시)
   */
  const loadLines = async () => {
    if (!plantCd) {
      setLines([])
      return
    }

    try {
      const res = await fetchReturnLines({
        plant: plantCd,
        work_center: workCenter || undefined
      })
      if (res.success) {
        const codes = res.data.map((line) => line.line_cd)
        setLines(codes)

        // 기존 선택값이 새 목록에 없으면 초기화
        if (lineCd && !codes.includes(lineCd)) {
          setLineCd('')
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load lines'
      console.error('[loadLines] Error:', msg)
      setLines([])
    }
  }

  /**
   * Search 버튼 클릭 (Defect Result 조회)
   */
  const handleSearch = async () => {
    // 필수 필드 검증
    if (!dateFrom || !dateTo) {
      alertRef.current?.show("Please select date range!")
      return
    }
    if (!plantCd) {
      alertRef.current?.show("Please select plant!")
      return
    }

    setLoading(true)
    setErrorMsg('')
    setSelectedRows(new Set())  // 선택 초기화

    try {
      if (abortRef.current) {
        abortRef.current.abort()
      }
      const ac = new AbortController()
      abortRef.current = ac

      // ALL 기준 조회 후 cfm_yn 기반 필터링 수행
      const res = await fetchDefectResults({
        date_from: formatDateToYYYYMMDD(dateFrom),
        date_to: formatDateToYYYYMMDD(dateTo),
        plant_cd: plantCd,
        work_center: workCenter || undefined,
        line_cd: lineCd || undefined,
        confirm_status: 'ALL'
      })

      if (res.success) {
        const rows = res.data
        const locallyFiltered =
          confirmStatus === 'Y'
            ? rows.filter(r => r.cfm_yn === 'Y')
            : confirmStatus === 'N'
              ? rows.filter(r => r.cfm_yn !== 'Y')
              : rows
        setDefectResults(locallyFiltered)
      } else {
        alertRef.current?.show("Failed to load defect results.")
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      console.error("[handleSearch] Error:", error)
      setErrorMsg(msg)
      alertRef.current?.show(`Error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Save 버튼 클릭 (Confirm 업데이트)
   */
  const handleSave = async () => {
    if (selectedRows.size === 0) {
      alertRef.current?.show("Please select at least one item!")
      return
    }

    // 확인 메시지 - ConfirmDialog 사용
    confirmDialogBodyKey.current = "Do you want to confirm the selected items?"
    confirmDialogConfirmLabel.current = "Yes"
    confirmDialogShowCancel.current = true
    confirmDialogType.current = 'alert'

    setConfirmDialogHandlers({
      handleConfirm: async () => {
        setOpenConfirmDialog(false)

        // 선택된 행의 PK 정보 수집
        const defectItems: DefectItem[] = []
        const rowMap = new Map(defectResults.map(r => [keyFor(r), r]))
        selectedRows.forEach((k) => {
          const row = rowMap.get(k)
          if (row) {
            defectItems.push({
              plant_cd: row.plant_cd,
              defect_form: row.defect_form,
              defect_no: row.defect_no
            })
          }
        })

        if (defectItems.length === 0) {
          alertRef.current?.show("No valid items selected!")
          return
        }

        // 디버깅: 전송할 데이터 확인
        console.log('[handleSave] Sending defectItems:', defectItems)

        setLoading(true)
        setErrorMsg('')

        try {
          const res = await updateConfirm({
            defect_items: defectItems,  // PK 배열 전송 (plant_cd, defect_form, defect_no)
            cfm_user: 'testUser'          // 프론트엔드에서 cfm_user 전달 (추후 로그인 기능 추가 시 변경)
          })

          // 디버깅: 응답 확인
          console.log('[handleSave] Response:', res)

          if (res.success) {
            // SAP OData 호출 (defect_decision 기반 proctype 결정)
            // - defect_decision='S': proctype='S', plant_cd → plant_cd (현재 공장 내 폐기)
            //    : 항상 Odata 호출
            // - defect_decision='R': proctype='R', plant_cd → prev_plant_cd (이전 공장으로 반품)
            //    : 현재 공장 (plant) 와 이전 공장 (prev_plant) 가 같으면 Odata 호출 X
            //    : 다르면 Odata 호출

            // lgort/umlgo는 서버에서 ST_LOC 조회로 계산
            const odataItems: ReturnScrapStoInputItem[] = []
            selectedRows.forEach((k) => {
              const row = rowMap.get(k)
              if (row) {
                const isScrap = row.defect_decision === 'S'
                const proctype = (isScrap ? 'S' : 'R') as 'S' | 'R'

                // Return 분기 (현재 공장 (plant) 와 이전 공장 (prev_plant) 가 같으면 Odata 호출 X)
                if (!isScrap) {
                  const plantCd = row.plant_cd ?? ''
                  const prevPlantCd = row.prev_plant_cd ?? ''
                  
                  if (plantCd === prevPlantCd) {
                    console.log('현재 공장과 이전 공장 같음 Odata 미 처리(R)')
                    return // 호출 X
                  }
                }

                odataItems.push({
                  defectno: row.defect_no,
                  proctype,
                  poid: row.po_id ?? undefined,
                  apsid: row.aps_id ?? undefined,
                  matnr: row.material_code ?? undefined,
                  werks: row.plant_cd,
                  umwrk: isScrap ? row.plant_cd : (row.prev_plant_cd ?? row.plant_cd),
                  menge: row.quantity,
                  meins: 'PR'
                })
              }
            })

            if (odataItems.length > 0) {
              try {
                console.log('[handleSave] Calling SAP OData with items:', odataItems)
                const odataRes = await putScrapStoForReturn(odataItems)
                console.log('[handleSave] SAP OData response:', odataRes)
              } catch (odataError) {
                const odataMsg = odataError instanceof Error ? odataError.message : 'SAP OData error'
                console.error('[handleSave] SAP OData Error:', odataError)
                alertRef.current?.show(`Confirmed but SAP error: ${odataMsg}`)
              }
            } else {
              console.log('[handleSave] No OData items to process (all Returns with same plant)')
            }

            alertRef.current?.show(`Successfully confirmed ${res.data.updated_count} items!`)

            // 데이터 갱신 (재조회)
            void handleSearch()

            // 선택 초기화
            setSelectedRows(new Set())
          } else {
            alertRef.current?.show("Failed to update confirm status.")
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error'
          console.error("[handleSave] Error:", error)
          alertRef.current?.show(`Error: ${msg}`)
        } finally {
          setLoading(false)
        }
      },
      handleCancel: () => {
        setOpenConfirmDialog(false)
      },
    })

    setOpenConfirmDialog(true)
  }

  /**
   * 초기 로드
   */
  useEffect(() => {
    void loadPlants()
  }, [])

  /**
   * Plant 변경 시 Work Center, Line 로드
   */
  useEffect(() => {
    void loadWorkCenters()
    void loadLines()
  }, [plantCd])

  /**
   * Work Center 변경 시 Line 로드
   */
  useEffect(() => {
    void loadLines()
  }, [workCenter])

  /**
   * 날짜 포맷 변환: YYYY-MM-DD -> YYYY/MM/DD
   * (백엔드에서 YYYY-MM-DD 형식으로 변환되어 옴)
   */
  const formatDateDisplay = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    // YYYY-MM-DD 형식을 YYYY/MM/DD로 변환
    if (dateStr.includes('-')) {
      return dateStr.replace(/-/g, '/')
    }
    return dateStr
  }

  /**
   * 테이블 컬럼 정의
   */
  const columns = [
    {
      Header: "Date",
      accessor: (row: ReturnDefectResultRow) => formatDateDisplay(row.defect_date)
    },
    { Header: "Time", accessor: "create_time" },
    { Header: "Plant", accessor: "plant_nm" },
    { Header: "Work Center", accessor: "work_center_name" },
    { Header: "Line", accessor: "line_cd" },
    { Header: "Process", accessor: "process_name" },
    { Header: "Supplier", accessor: "supplier_name" },
    { Header: "Material", accessor: "material" },
    { Header: "Component", accessor: "component" },
    { Header: "Style Name", accessor: "style_name" },
    { Header: "Style Code", accessor: "style_code" },
    { Header: "Type", accessor: "type" },
    { Header: "Scrap/Return", accessor: "defect_decision" },
    { Header: "Reason", accessor: "reason_name" },
    { Header: "Size", accessor: "size" },
    { Header: "Division", accessor: "division" },
    { Header: "Quantity", accessor: "quantity" },
    {
      Header: "Confirm",
      accessor: (row: ReturnDefectResultRow, ) => {
        const isDisabled = row.cfm_yn === 'Y'
        const k = keyFor(row)
        const isChecked = selectedRows.has(k)

        return (
          <input
            type="checkbox"
            checked={isChecked}
            disabled={isDisabled}
            value={row.cfm_yn || 'N'}
            onChange={(e) => {
              const newSet = new Set(selectedRows)
              if (e.target.checked) {
                newSet.add(k)
              } else {
                newSet.delete(k)
              }
              setSelectedRows(newSet)
            }}
            style={{
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              width: '16px',
              height: '16px'
            }}
          />
        )
      }
    }
  ]

  /**
   * Plant 옵션 맵 생성 (CustomSelect용)
   */
  const plantOptions: Record<string, string> = {}
  plants.forEach((p) => {
    plantOptions[p.plant_cd] = p.plant_nm
  })

  /**
   * Work Center 옵션 맵 생성 (CustomSelect용)
   * code → name 매핑 (code를 value로, name을 label로 사용)
   */
  const workCenterOptions: Record<string, string> = {}
  workCenters.forEach((wc) => {
    workCenterOptions[wc.code] = wc.name
  })

  return (
    <div
      className={debugMode ? 'dev-main' : ''}
      style={{
        height: '98vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: debugMode ? '#00ccff' : '#f5f6f7',
        overflowX: 'hidden'  // 전체 화면 가로 스크롤 방지
      }}
    >
      {/* 상단 헤더 */}
      <div
        className={debugMode ? 'dev-scope-header' : ''}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
          height: '8vh',
          backgroundColor: '#203764'
        }}
      >
        <div
          style={{
            fontSize: '2vw',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            marginLeft: '1vw'
          }}
        >
          Confirm Management
        </div>
        <Button onClick={() => setDebugMode(!debugMode)}>
          {debugMode ? 'Debug OFF' : 'Debug ON'}
        </Button>
        <div
          style={{
            fontSize: '2vw',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            marginRight: '1vw',
            cursor: 'pointer'
          }}
          onClick={() => { void navigate('/') }}
        >
          <TimeNow />
        </div>
      </div>

      {/* 필터 영역 */}
      <div
        className={debugMode ? 'dev-scope-section filter-row' : 'filter-row'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          backgroundColor: '#ffffff'
        }}
      >
        <div
          className={debugMode ? 'dev-scope-filter-row' : ''}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            margin: '2vh',
            gap: '1vw'
          }}
        >
          {/* 첫 번째 행 */}
          <div
            style={{
              display: "flex",
              gap: "2vw",
              alignItems: "center",
              flexWrap: "nowrap",
              width: '100%'
            }}
          >
            {/* Date From ~ To */}
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
                value={dateFrom}
                onChange={setDateFrom}
                boxWidth="8vw"
                boxHeight="4vh"
                innerFont="0.9vw"
                displayFormat="yyyy-MM-dd"
                valueFormat="yyyy-MM-dd"
              />
              <span style={{ alignSelf: 'center', fontSize: '1.2rem', color: '#556b82' }}>~</span>
              <CustomDatePicker
                value={dateTo}
                onChange={setDateTo}
                boxWidth="8vw"
                boxHeight="4vh"
                innerFont="0.9vw"
                displayFormat="yyyy-MM-dd"
                valueFormat="yyyy-MM-dd"
              />
            </div>

            {/* Plant */}
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
                value={plantCd}
                onChange={setPlantCd}
                placeholder=""
                selectFontSize="0.9vw"
                iconSize="1vw"
                name="plantCd"
                boxWidth="8vw"
              />
            </div>

            {/* Work Center */}
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
                boxWidth="10vw"
                optionVH={6}
              />
            </div>

            {/* Line */}
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
                Line
              </span>
              <CustomSelect
                options={lines}
                value={lineCd}
                onChange={setLineCd}
                placeholder=""
                selectFontSize="0.9vw"
                iconSize="1vw"
                name="lineCd"
                boxWidth="6vw"
              />
            </div>

            {/* Confirm */}
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
                Confirm
              </span>
              <CustomSelect
                options={{
                  'ALL': 'ALL',
                  'Y': 'Confirmed',
                  'N': 'Not yet confirm'
                }}
                value={confirmStatus}
                onChange={setConfirmStatus}
                placeholder=""
                selectFontSize="0.9vw"
                iconSize="1vw"
                name="confirmStatus"
                boxWidth="8vw"
              />
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '1vw' }}>
              <CustomSingleButton
                title='Search'
                width='8vw'
                emphasized={false}
                onClick={() => { void handleSearch() }}
              />
              <CustomSingleButton
                title='Save'
                width='8vw'
                emphasized={true}
                onClick={() => { void handleSave() }}
              />
              {/* 로딩/에러 표시 */}
              {loading && <span style={{ marginLeft: '1vw' }}>Loading...</span>}
              {errorMsg && <span style={{ color: 'red', marginLeft: '1vw' }}>{errorMsg}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 테이블 영역 */}
      <div
        className={debugMode ? 'dev-scope-grid-section2' : ''}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          margin: '1vh',
          height: 'auto',
        }}
      >
        <ToggleContainer
          title='Confirm Information'
          titleStyle={{ fontSize: '1.3rem', margin: '0 10px', fontWeight: 'bolder' }}
          topBarWidth="97vw"
          topBarStyle={{
            height: '5vh',
            borderBottom: '1px solid #3a3a3aff',
            backgroundColor: '#ffff',
            boxShadow: "0 2px 6px #00000014"
          }}
          defaultCollapsed={false}
          style={{ width: 'auto', height: 'auto' }}
          contentWrapperStyle={{ width: '96.1vw', backgroundColor: '#ffff', overflowX: 'auto' }}
        >
          <div
            style={{
              height: '68vh',
              width: 'fit-content',
              marginBottom: '0vh',
              overflowY: 'auto',
              overflowX: 'auto'
            }}
          >
            <CustomTable
              rootClassName='kang-table3'
              columns={columns}
              data={defectResults}
              colSizes={{
                0: "8vw",   // Date
                1: "6vw",   // Time
                2: "8vw",   // Plant
                3: "10vw",  // Work Center
                4: "6vw",   // Line
                5: "10vw",  // Process
                6: "10vw",  // Supplier
                7: "12vw",  // Material
                8: "10vw",  // Component
                9: "12vw",  // Style Name
                10: "10vw", // Style Code
                11: "6vw",  // Type
                12: "8vw",  // Scrap/Return
                13: "10vw", // Reason
                14: "6vw",  // Size
                15: "6vw",  // Division
                16: "6vw",  // Quantity
                17: "6vw",  // Confirm
              }}
              autoFitContent={{ enabled: true, paddingPx: 20, includeHeader: true }}
              rowSizes={{ 0: '6vh' } as Record<number, string>}
              defaultRowSize='4vh'
              horizontalAlign="center"
              verticalAlign="middle"
              hasVerticalOverflow
              visibleRows={15}
              onCellClickDetailed={({ gridRow, col, dataIndexFiltered, dataIndexOriginal, row }) => {
                if (!row) return // 헤더 클릭 무시
                console.log({ gridRow, col, dataIndexFiltered, dataIndexOriginal, row })
              }}
              cellStyle={(r, c) => {
                // 헤더 행(r=0)은 기본 스타일 유지 (중앙 정렬)
                if (r === 0) return {}

                // 데이터 행만 정렬 적용
                const leftCols = [7, 8, 9, 11, 13, 14] // Material, Component, Style Name, Type, Reason, Size
                const rightCols = [16] // Quantity

                if (leftCols.includes(c)) {
                  return { justifyContent: 'flex-start', paddingLeft: '12px' }
                }
                if (rightCols.includes(c)) {
                  return { justifyContent: 'flex-end', paddingRight: '12px' }
                }

                return {}
              }}
            />
          </div>
        </ToggleContainer>
      </div>

      {/* Alert Dialog */}
      <AlertDialog ref={alertRef} />

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={openConfirmDialog}
        onConfirm={() => confirmDialogHandlers.handleConfirm()}
        onCancel={() => confirmDialogHandlers.handleCancel()}
        confirmLabel={confirmDialogConfirmLabel.current}
        bodyKey={confirmDialogBodyKey.current}
        showCancel={confirmDialogShowCancel.current}
        type={confirmDialogType.current}
      />
    </div>
  )
}
