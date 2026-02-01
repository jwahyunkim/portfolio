import '../MyApp.css'
import './ScrapRework_Management_Main.css'

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
import CustomTable from '../../components/CustomTable'

// Data/API
import {
  fetchScrapConfirmPlants,
  fetchScrapConfirmWorkCenters,
  fetchScrapConfirmProcesses,
  fetchScrapConfirmResults,
  saveScrapConfirmData,
  saveReworkData,
  putScrapStoForScrap,
  type Plant,
  type ScrapResultRow,
  type ScrapItem,
  type ScrapStoForScrapInputItem
} from '../../data/api/index'

export default function ScrapRework_Management_Main(): JSX.Element {
  const navigate = useNavigate()
  const alertRef = useRef<AlertDialogRef>(null)

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

  const [workCenters, setWorkCenters] = useState<string[]>([])
  const [workCenter, setWorkCenter] = useState<string>('')

  const [processes, setProcesses] = useState<string[]>([])
  const [supProcesses, setSupProcesses] = useState<string[]>([])
  const [processCd, setProcessCd] = useState<string>('') // supply Process와 동일쿼리 사용으로 동시사용 (추후 요청시 삭제될 필드 - supply process)
  const [supProcessCd, setSupProcessCd] = useState<string>('')

  const [confirmStatus, setConfirmStatus] = useState<string>('Not yet confirm')  // 기본값: Not yet confirm

  // 테이블 데이터
  const [scrapResults, setScrapResults] = useState<ScrapResultRow[]>([])

  // Input 편집 상태 (빈 문자열 허용)
  const [editedRows, setEditedRows] = useState<Record<string, { scrap_qty: number | ''; rework_qty: number | '' }>>({})

  // 로딩 및 에러
  const [loading, setLoading] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>('')

  // AbortController
  const abortRef = useRef<AbortController | null>(null)

  /**
   * 날짜 형식 변환: YYYY-MM-DD → YYYYMMDD (UI반영 X 백엔드 전송용.)
   */
  const formatDateToYYYYMMDD = (dateStr: string): string => {
    return dateStr.replace(/-/g, '')
  }

  // 행 고유키(필터/정렬 변경에도 안정적으로 동일)
  const keyFor = (r: ScrapResultRow): string => `${r.plant_cd}__${r.defect_form}__${r.defect_no}`

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
   * Plant 목록 로드
   */
  const loadPlants = async () => {
    try {
      const res = await fetchScrapConfirmPlants()
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
      const res = await fetchScrapConfirmWorkCenters({
        plant: plantCd
      })
      if (res.success) {
        const names = res.data.map((wc) => wc.name)
        setWorkCenters(names)

        // 기존 선택값이 새 목록에 없으면 초기화
        if (workCenter && !names.includes(workCenter)) {
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
   * Process, supplyProcess 목록 로드 (Plant 변경 시)
   */
  const loadProcesses = async () => {
    if (!plantCd) {
      setProcesses([])
      setSupProcesses([])
      return
    }

    try {
      const res = await fetchScrapConfirmProcesses({
        plant: plantCd
      })
      if (res.success) {
        const names = res.data.map((proc) => proc.op_nm)
        setProcesses(names)
        setSupProcesses(names)

        // 기존 선택값이 새 목록에 없으면 초기화
        if (processCd && !names.includes(processCd)) {
          setProcessCd('')
          setSupProcessCd('')
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load processes'
      console.error('[loadProcesses] Error:', msg)
      setProcesses([])
      setSupProcesses([])
    }
  }


  /**
   * Search 버튼 클릭 (Scrap Result 조회)
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
    setEditedRows({})  // 조회 시 편집 초기화

    try {
      if (abortRef.current) {
        abortRef.current.abort()
      }
      const ac = new AbortController()
      abortRef.current = ac

      // 서버 필터 불일치에 대비: 항상 ALL로 조회 후 프론트에서 확정/미확정 필터 적용
      const res = await fetchScrapConfirmResults({
        date_from: formatDateToYYYYMMDD(dateFrom),
        date_to: formatDateToYYYYMMDD(dateTo),
        plant_cd: plantCd,
        work_center: workCenter || undefined,
        confirm_status: 'ALL'
      })

      if (res.success) {
        const rows = res.data
        const locallyFiltered =
          confirmStatus === 'Confirmed'
            ? rows.filter(r => r.decision_dt !== null)
            : confirmStatus === 'Not yet confirm'
              ? rows.filter(r => r.decision_dt === null)
              : rows
        setScrapResults(locallyFiltered)
      } else {
        alertRef.current?.show("Failed to load scrap results.")
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
   * Save 버튼 클릭 (Scrap/Rework 수량 저장)
   * 
   */
  const handleSave = async () => {
    if (Object.keys(editedRows).length === 0) {
      alertRef.current?.show("Please enter Scrap or Rework quantities!")
      return
    }

    // 확인 메시지
    const confirmed = window.confirm("Do you want to save the entered quantities?")
    if (!confirmed) {
      return
    }

    // 편집된 행의 PK 정보 수집
    const scrapItems: ScrapItem[] = []
    const rowMap = new Map(scrapResults.map(r => [keyFor(r), r]))
    Object.entries(editedRows).forEach(([k, { scrap_qty, rework_qty }]) => {
      // 빈 문자열은 0으로 변환
      const scrap = typeof scrap_qty === 'number' ? scrap_qty : 0
      const rework = typeof rework_qty === 'number' ? rework_qty : 0

      if (scrap === 0 && rework === 0) {
        return
      }

      const row = rowMap.get(k)
      if (row) {
        scrapItems.push({
          plant_cd: row.plant_cd,
          defect_form: row.defect_form,
          defect_no: row.defect_no,
          scrap_qty: scrap,
          rework_qty: rework
        })
      }
    })

    if (scrapItems.length === 0) {
      alertRef.current?.show("No valid items to save!")
      return
    }

    // 디버깅: 전송할 데이터 확인
    console.log('[handleSave] Sending scrapItems:', scrapItems)

    setLoading(true)
    setErrorMsg('')

    try {

      // 1. scrap/rework 동시 업데이트 api 호출
      const scrapRes = await saveScrapConfirmData({
        scrap_items: scrapItems,
        decision_user: 'testUser'  // 추후 로그인 기능 추가 시 변경
      })

      // 디버깅: 응답 확인
      console.log('[handleSave] Response:', scrapRes)

      if (scrapRes.status !== 'OK') {
        alertRef.current?.show("Failed to save scrap/rework data.")
        return
      }

      // 2. SAP OData 호출 (Scrap - proctype: 'S', scrap_qty > 0 인 항목만)
      // werks/umwrk: prev_plant_cd, lgort/umlgo는 서버에서 ST_LOC 조회로 계산
      const scrapOnlyItems = scrapItems.filter(item => item.scrap_qty > 0)
      if (scrapOnlyItems.length > 0) {
        const odataItems: ScrapStoForScrapInputItem[] = scrapOnlyItems.map(item => {
          const row = rowMap.get(`${item.plant_cd}__${item.defect_form}__${item.defect_no}`)
          return {
            defectno: item.defect_no,
            proctype: 'S' as const,
            poid: row?.prev_po_id ?? undefined,
            apsid: row?.prev_aps_id ?? undefined,
            matnr: row?.component_code ?? undefined,
            werks: row?.prev_plant_cd ?? undefined,
            umwrk: row?.prev_plant_cd ?? undefined,
            menge: item.scrap_qty,
            meins: 'PR'
          }
        })

        try {
          console.log('[handleSave] Calling SAP OData for Scrap:', odataItems)
          const odataRes = await putScrapStoForScrap(odataItems)
          console.log('[handleSave] SAP OData response:', odataRes)
        } catch (odataError) {
          const odataMsg = odataError instanceof Error ? odataError.message : 'SAP OData error'
          console.error('[handleSave] SAP OData Error:', odataError)
          alertRef.current?.show(`Saved but SAP Scrap error: ${odataMsg}`)
        }
      }

      // Rework 항목 필터링 (rework_qty > 0 ) - 추후 확인 필요
      const reworkItems = scrapItems.filter(item => item.rework_qty > 0)

      if (reworkItems.length > 0) {
        // SP 요구 포맷으로 변환
        const reworkData = reworkItems.map(item => `${item.defect_no}|${item.rework_qty}`).join(',')
        console.log('[handleSave] Rework data:', reworkData)

        // Rework API 호출 ( sp + odata)
        const reworkRes = await saveReworkData({
          data: reworkData,
          user: 'testUser' // 추후 로그인 기능 추가 시 변경 
        })

        console.log('[handleSave] Rework response:', reworkRes)

        // SAP 결과 로깅
        if (reworkRes.sap_failed_count > 0) {
          console.warn(
            `[handleSave] SAP 일부 실패: 성공 ${reworkRes.sap_success_count}, 실패 ${reworkRes.sap_failed_count}`
          )
          if (reworkRes.errors && reworkRes.errors.length > 0 ) {
            console.error('[handleSave] SAP 에러 목록:', reworkRes.errors)
          }
        }
      } else {
        console.log('[handleSave] Rework 항목 없음 (Scrap만 처리)')
      }

      // 재조회 (완료 대기)
      await handleSearch()

      // 성공 알림
      let successMsg = `Successfully saved ${scrapRes.updated_count} items!`

      // Rework 결과 추가 표시
      if (reworkItems.length > 0) {
        successMsg += `\nRework: ${reworkItems.length} items processed.`
      }

      alertRef.current?.show(successMsg)

      // 편집 초기화
      setEditedRows({})
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      console.error("[handleSave] Error:", error)
      alertRef.current?.show(`Error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 초기 로드
   */
  useEffect(() => {
    void loadPlants()
  }, [])

  /**
   * Plant 변경 시 Work Center, Process 로드
   */
  useEffect(() => {
    void loadWorkCenters()
    void loadProcesses()
  }, [plantCd])

  /**
   * 더블클릭 시 Quantity 값 적용 핸들러
   */
  const handleDoubleClickToApplyQuantity = (row: ScrapResultRow, field: 'scrap' | 'rework') => {
    const maxQty = Number(row.quantity ?? 0)
    const k = keyFor(row)

    setEditedRows(prev => ({
      ...prev,
      [k]: {
        scrap_qty: field === 'scrap' ? maxQty : 0,
        rework_qty: field === 'rework' ? maxQty : 0
      }
    }))
  }

  /**
   * 테이블 컬럼 정의
   */
  const columns = [
    {
      Header: "Date",
      accessor: (row: ScrapResultRow) => formatDateDisplay(row.defect_date)
    },
    { Header: "Plant", accessor: "plant_nm" },
    { Header: "Work Center", accessor: "work_center_name" },
    { Header: "Line", accessor: "line_cd" },
    { Header: "Process", accessor: "process_name" },
    { Header: "Supply Process", accessor: "supplier_name" },
    { Header: "Material", accessor: "material_name" },
    { Header: "Component", accessor: "component_name" },
    { Header: "Style Name", accessor: "style_name" },
    { Header: "Style Code", accessor: "style_code" },
    { Header: "Type", accessor: "type" },
    { Header: "Reason", accessor: "reason_name" },
    { Header: "Size", accessor: "size" },
    { Header: "Division", accessor: "division" },
    { Header: "Quantity", accessor: "quantity" },
    {
      Header: "Scrap",
      accessor: (row: ScrapResultRow) => {
        const isDisabled = row.decision_dt !== null
        const k = keyFor(row)
        const currentValue = editedRows[k]?.scrap_qty ?? row.scrap_qty ?? 0

        return (
          <input
            type="number"
            value={currentValue}
            disabled={isDisabled}
            onFocus={() => {
              // 0이면 빈값으로 (입력 편의성)
              if (currentValue === 0) {
                setEditedRows(prev => ({
                  ...prev,
                  [k]: {
                    scrap_qty: '',
                    rework_qty: prev[k]?.rework_qty ?? row.rework_qty ?? 0
                  }
                }))
              }
            }}
            onChange={(e) => {
              const inputValue = e.target.value
              const maxQty = Number(row.quantity ?? 0)

              // 빈 문자열 허용 
              if (inputValue === '') {
                setEditedRows(prev => ({
                  ...prev,
                  [k]: {
                    scrap_qty: '',
                    rework_qty: prev[k]?.rework_qty ?? row.rework_qty ?? 0
                  }
                }))
                return
              }

              const newScrap = Number(inputValue)

              // 음수 방지
              if (newScrap < 0) return

              // quantity 초과 방지
              if (newScrap > maxQty) return

              // 자동 계산: rework = quantity - scrap
              const autoRework = maxQty - newScrap

              setEditedRows(prev => ({
                ...prev,
                [k]: {
                  scrap_qty: newScrap,
                  rework_qty: autoRework
                }
              }))
            }}
            onBlur={() => {
              // 빈값이면 0으로 변환
              if (currentValue === '') {
                const maxQty = Number(row.quantity ?? 0)
                const k = keyFor(row)
                setEditedRows(prev => ({
                  ...prev,
                  [k]: {
                    scrap_qty: 0,
                    rework_qty: maxQty
                  }
                }))
              }
            }}
            onDoubleClick={() => handleDoubleClickToApplyQuantity(row, 'scrap')}
            style={{
              width: '80px',
              padding: '4px',
              textAlign: 'right',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              backgroundColor: isDisabled ? '#f0f0f0' : 'white',
              border: '1px solid #d0d0d0',
              borderRadius: '2px'
            }}
          />
        )
      }
    },
    {
      Header: "Rework",
      accessor: (row: ScrapResultRow) => {
        const isDisabled = row.decision_dt !== null
        const k = keyFor(row)
        const currentValue = editedRows[k]?.rework_qty ?? row.rework_qty ?? 0

        return (
          <input
            type="number"
            value={currentValue}
            disabled={isDisabled}
            onFocus={() => {
              // 0이면 빈값으로 (입력 편의성)
              if (currentValue === 0) {
                setEditedRows(prev => ({
                  ...prev,
                  [k]: {
                    scrap_qty: prev[k]?.scrap_qty ?? row.scrap_qty ?? 0,
                    rework_qty: ''
                  }
                }))
              }
            }}
            onChange={(e) => {
              const inputValue = e.target.value
              const maxQty = Number(row.quantity ?? 0)

              // 빈 문자열 허용 (삭제 가능하게)
              if (inputValue === '') {
                setEditedRows(prev => ({
                  ...prev,
                  [k]: {
                    scrap_qty: prev[k]?.scrap_qty ?? row.scrap_qty ?? 0,
                    rework_qty: ''
                  }
                }))
                return
              }

              const newRework = Number(inputValue)

              // 음수 방지
              if (newRework < 0) return

              // quantity 초과 방지
              if (newRework > maxQty) return

              // 자동 계산: scrap = quantity - rework
              const autoScrap = maxQty - newRework

              setEditedRows(prev => ({
                ...prev,
                [k]: {
                  scrap_qty: autoScrap,
                  rework_qty: newRework
                }
              }))
            }}
            onBlur={() => {
              // 빈값이면 0으로 변환
              if (currentValue === '') {
                const maxQty = Number(row.quantity ?? 0)
                setEditedRows(prev => ({
                  ...prev,
                  [k]: {
                    scrap_qty: maxQty,
                    rework_qty: 0
                  }
                }))
              }
            }}
            onDoubleClick={() => handleDoubleClickToApplyQuantity(row, 'rework')}
            style={{
              width: '80px',
              padding: '4px',
              textAlign: 'right',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              backgroundColor: isDisabled ? '#f0f0f0' : 'white',
              border: '1px solid #d0d0d0',
              borderRadius: '2px'
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

  return (
    <div
      className={debugMode ? 'dev-main' : ''}
      style={{
        height: '98vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: debugMode ? '#00ccff' : '#f5f6f7',
        overflow: 'hidden'  // 전체 화면 가로 스크롤 방지
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
          Scrap/Rework Management
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
            flexDirection: 'column',
            margin: '2vh',
            gap: '1vh'
          }}
        >
          {/* 필터 및 버튼 한 줄 */}
          <div
            style={{
              display: "flex",
              gap: "0.5vw",
              alignItems: "center",
              flexWrap: "nowrap",
              width: '100%'
            }}
          >
            {/* Date From ~ To */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '0.3vw' }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  color: "#556b82",
                  fontWeight: 'normal',
                  fontSize: "1.2rem",
                  whiteSpace: "nowrap"
                }}
              >
                Date
              </span>
              <CustomDatePicker
                value={dateFrom}
                onChange={setDateFrom}
                boxWidth="7vw"
                boxHeight="4vh"
                innerFont="0.8vw"
                displayFormat="yyyy-MM-dd"
                valueFormat="yyyy-MM-dd"
              />
              <span style={{ alignSelf: 'center', fontSize: '1.2rem', color: '#556b82' }}>~</span>
              <CustomDatePicker
                value={dateTo}
                onChange={setDateTo}
                boxWidth="7vw"
                boxHeight="4vh"
                innerFont="0.8vw"
                displayFormat="yyyy-MM-dd"
                valueFormat="yyyy-MM-dd"
              />
            </div>

            {/* Plant */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '0.3vw' }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  color: "#556b82",
                  fontWeight: 'normal',
                  fontSize: "1.2rem",
                  whiteSpace: "nowrap"
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
                iconSize="0.8vw"
                name="plantCd"
                boxWidth="7vw"
              />
            </div>

            {/* Work Center */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '0.3vw' }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  color: "#556b82",
                  fontWeight: 'normal',
                  fontSize: "1.2rem",
                  whiteSpace: "nowrap"
                }}
              >
                Work Center
              </span>
              <CustomSelect
                options={workCenters}
                value={workCenter}
                onChange={setWorkCenter}
                placeholder=""
                selectFontSize="0.8vw"
                iconSize="1vw"
                name="workCenter"
                boxWidth="7vw"
                optionVH={9}
              />
            </div>

            {/* Process */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '0.3vw' }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  color: "#556b82",
                  fontWeight: 'normal',
                  fontSize: "1.2rem",
                  whiteSpace: "nowrap"
                }}
              >
                Process
              </span>
              <CustomSelect
                options={processes}
                value={processCd}
                onChange={setProcessCd}
                placeholder=""
                selectFontSize="0.9vw"
                innerFont="0.8vw"
                iconSize="1vw"
                name="processCd"
                boxWidth="8vw"
                optionVH={9}
              />
            </div>

            {/* Supply Process */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '0.3vw' }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  color: "#556b82",
                  fontWeight: 'normal',
                  fontSize: "1.2rem",
                  whiteSpace: "nowrap"
                }}
              >
                Supply Process
              </span>
              <CustomSelect
                options={supProcesses}
                value={supProcessCd}
                onChange={setSupProcessCd}
                placeholder=""
                selectFontSize="0.9vw"
                innerFont="0.8vw"
                iconSize="1vw"
                name="supProcessCd"
                boxWidth="8vw"
                optionVH={9}
              />
            </div>

            {/* Confirm */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '0.3vw' }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  color: "#556b82",
                  fontWeight: 'normal',
                  fontSize: "1.2rem",
                  whiteSpace: "nowrap"
                }}
              >
                Confirm
              </span>
              <CustomSelect
                options={{
                  'ALL': 'ALL',
                  'Confirmed': 'Confirmed',
                  'Not yet confirm': 'Not yet confirm'
                }}
                value={confirmStatus}
                onChange={setConfirmStatus}
                placeholder=""
                selectFontSize="0.8vw"
                iconSize="1vw"
                name="confirmStatus"
                boxWidth="8vw"
              />
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", flexDirection: 'row', alignItems: "center", gap: '0.5vw', marginLeft: 'auto' }}>
              <CustomSingleButton
                title='Search'
                width='7vw'
                emphasized={false}
                onClick={() => { void handleSearch() }}
              />
              <CustomSingleButton
                title='Save'
                width='7vw'
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
          title='Scrap/Rework Information'
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
              height: 'fit-content',
              width: 'fit-content',
              marginBottom: '0vh',
              overflowY: 'auto',
              overflowX: 'auto'
            }}
          >
            <CustomTable
              rootClassName='kang-table3'
              columns={columns}
              data={scrapResults}
              colSizes={{
                0: "8vw",   // Date
                1: "8vw",   // Plant
                2: "10vw",  // Work Center
                3: "6vw",   // Line
                4: "10vw",  // Process
                5: "10vw",  // Supply Process
                6: "10vw",  // Material
                7: "10vw",  // Component
                8: "12vw",  // Style Name
                9: "10vw",  // Style Code
                10: "6vw",  // Type
                11: "10vw", // Reason
                12: "6vw",  // Size
                13: "6vw",  // Division
                14: "6vw",  // Quantity
                15: "8vw",  // Scrap (input)
                16: "8vw",  // Rework (input)
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
                const leftCols = [6, 7, 8, 10, 11, 12] // Material, Component, Style Name, Type, Reason, Size
                const rightCols = [14, 15, 16] // Quantity, Scrap, Rework

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
    </div>
  )
}
