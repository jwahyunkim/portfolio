// src/pages/Defect_Management_HFPA.tsx

import '../MyApp.css'
import './Defect_Management_HFPA.css'
import Defect_Management_HFPA_POPUP from './Defect_Management_HFPA_POPUP'

import { useRef, useState, useEffect, JSX } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@ui5/webcomponents-react'
// Custom Components
import CustomSelect, { SelectOption } from '../../components/CustomSelect'
import TimeNow from '../../components/TimeNow'
import ScanListener from '../../components/ScanListener'

import AlertDialog, { AlertDialogRef } from '../../components/AlertDialog'
import CustomTable from '../../components/CustomTable'
import {
  fetchHFPADashboard,
  type HfpaDashboardItem,
  type FetchHFPADashboardParams,
  fetchPlants,
  fetchLines,
  type PlantsResponse,
  type LinesResponse,
  fetchFgaWorkCenters,
  type FgaWorkCenterResponse,
} from '../../data/api/index'

export default function Defect_Management_HFPA(): JSX.Element {
  const navigate = useNavigate()
  const [debugMode, setDebugMode] = useState(false)

  // alertRef 사용방법
  //   if (type === 'S' && !p.defects.length) {
  //   alertRef.current?.show("Select defect type!");
  //   return false
  // }
  const alertRef = useRef<AlertDialogRef>(null)

  // 로딩/에러
  const [loading, setLoading] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const [popupOpen, setPopupOpen] = useState(false)
  const [scannedValue, setScannedValue] = useState<string>('')

  // HFPA 대시보드 테이블 데이터
  const [hfpaRows, setHfpaRows] = useState<HfpaDashboardItem[]>([])

  // 선택 상태
  const [plant, setPlant] = useState<string>('') // ex) C200
  const [workCenter, setWorkCenter] = useState<string>('') // ex) 11FGA
  const [line, setLine] = useState<string>('') // ex) LN01

  // 옵션 상태
  const [plantOptions, setPlantOptions] = useState<SelectOption[]>([])
  const [workCenterOptions, setWorkCenterOptions] = useState<SelectOption[]>([])
  const [lineOptions, setLineOptions] = useState<SelectOption[]>([])

  // 컬럼 정의
  const columns = [
    { Header: 'Defect name', accessor: 'div' },
    { Header: '07:00', accessor: 'H_07' },
    { Header: '08:00', accessor: 'H_08' },
    { Header: '09:00', accessor: 'H_09' },
    { Header: '10:00', accessor: 'H_10' },
    { Header: '11:00', accessor: 'H_11' },
    { Header: '12:00', accessor: 'H_12' },
    { Header: '13:00', accessor: 'H_13' },
    { Header: '14:00', accessor: 'H_14' },
    { Header: '15:00', accessor: 'H_15' },
    { Header: '16:00', accessor: 'H_16' },
    { Header: '17:00', accessor: 'H_17' },
    { Header: '18:00', accessor: 'H_18' },
    { Header: 'Total', accessor: 'TOTAL' },
  ]

  // 대시보드 데이터 로더
  const loadDashboard = async (params: FetchHFPADashboardParams) => {
    try {
      setLoading(true)
      setErrorMsg('')

      const res = await fetchHFPADashboard(params)
      setHfpaRows(res.data || [])
    } catch (error) {
      console.error('Failed to load HFPA dashboard:', error)
      setErrorMsg('Failed to load HFPA dashboard')
      alertRef.current?.show('Failed to load HFPA dashboard')
    } finally {
      setLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 옵션 로딩 (Plant / WorkCenter / Line)
  //  - 팝업 구조와 유사하게 하나의 useEffect에서 연쇄 로딩 + 유효성 체크
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        // 1) Plant 옵션 항상 최신화
        const resPlants: PlantsResponse = await fetchPlants()
        const plantOpts: SelectOption[] = (resPlants.data || []).map((p) => ({
          value: p.plant_cd,
          label: `${p.plant_cd} - ${p.plant_nm}`,
        }))
        setPlantOptions(plantOpts)

        // 선택된 plant 가 유효하지 않으면 초기화
        if (plant && !plantOpts.some((opt) => opt.value === plant)) {
          setPlant('')
        }

        // 2) Work Center 옵션 (plant 선택된 경우에만)
        let wcOpts: SelectOption[] = []
        if (plant) {

          const wcRes: FgaWorkCenterResponse = await fetchFgaWorkCenters({
            plant,
          })
          wcOpts = (wcRes.data || []).map((w) => ({
            value: w.code,
            label: `${w.code} - ${w.name}`,
          }))
        }
        setWorkCenterOptions(wcOpts)

        // 선택된 workCenter 가 유효하지 않으면 초기화
        if (workCenter && !wcOpts.some((opt) => opt.value === workCenter)) {
          setWorkCenter('')
        }

        // 3) Line 옵션 (plant + workCenter 둘 다 있을 때만)
        let lineOpts: SelectOption[] = []
        if (plant && workCenter) {
          const lineRes: LinesResponse = await fetchLines({
            plant,
            work_center: workCenter,
          })
          lineOpts = (lineRes.data || []).map((l) => ({
            value: l.line_cd,
            label: `${l.line_cd} - ${l.line_name}`,
          }))
        }
        setLineOptions(lineOpts)

        // 선택된 line 이 유효하지 않으면 초기화
        if (line && !lineOpts.some((opt) => opt.value === line)) {
          setLine('')
        }
      } catch (e) {
        console.error('Failed to load plant/work-center/line options', e)
        alertRef.current?.show('Failed to load plant/work-center/line options')
        // 옵션 로딩 에러가 있어도 화면 자체는 유지
      }
    })()
  }, [plant, workCenter, line]) // line 포함: line이 바뀌어도 옵션 유효성 다시 확인

  // ─────────────────────────────────────────────────────────────
  // 대시보드 자동 호출 (A안): plant, workCenter, line 모두 선택되면 호출
  // inspect_date는 기존 값 유지
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!plant || !workCenter || !line) return
    void loadDashboard({
      plant_cd: plant,
      work_center: workCenter,
      line_cd: line,
      inspect_date: '20251210', // FIXME :: 오늘 날짜로 변경
    })
  }, [plant, workCenter, line])

  const openPopupIfReady = () => {
    if (!plant || !workCenter || !line) {
      alertRef.current?.show('먼저 Plant, Work Center, Line을 선택해 주세요.')
      return
    }
    setPopupOpen(true)
  }

  const handleScan = (code: string) => {
    if (!plant || !workCenter || !line) {
      console.log('test')
      console.log('alertRef.current = ', alertRef.current)

      // keydown 이벤트 컨텍스트에서 한 번 끊고, 다음 tick에서 모달 오픈
      setTimeout(() => {
        alertRef.current?.show('먼저 Plant, Work Center, Line을 선택해 주세요.')
      }, 0)

      return
    }

    setScannedValue(code)
    setPopupOpen(true)
  }

  return (
    <div
      className={debugMode ? 'dev-main' : ''}
      style={{
        height: '98vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: debugMode ? '#00ccff' : '#f5f6f7',
      }}
    >
      <ScanListener onScan={handleScan} allowedLengths={[]} />

      {/* 상단 */}
      <div
        className={debugMode ? 'dev-scope-header' : ''}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
          height: '8vh',
          backgroundColor: '#203764',
        }}
      >
        <div
          style={{
            fontSize: '2vw',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '1vw',
          }}
        >
          <div
            style={{
              fontSize: '3vw',
              fontWeight: '600',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              marginLeft: '1vw',
              cursor: 'pointer',
            }}
            onClick={() => {
              openPopupIfReady()
            }}
          >
            HFPA
          </div>
          <div
            style={{
              fontSize: '1.5vw',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {loading && <span>Loading...</span>}
            {errorMsg && !loading && (
              <span style={{ color: 'yellow', marginLeft: '1vw' }}>{errorMsg}</span>
            )}
          </div>
        </div>

        <Button
          onClick={() => setDebugMode(!debugMode)}
          style={{
            position: 'absolute',
            right: '20vw',
            top: '1.6vh',
          }}
        >
          {debugMode ? 'Debug OFF' : 'Debug ON'}
        </Button>

        {/* 선택 영역: plant / workcenter / line */}
        <div
          style={{
            fontSize: '2vw',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '1vw',
          }}
        >
          {/* plant */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <CustomSelect
              options={plantOptions}
              value={plant}
              onChange={(v) => setPlant(v)}
              placeholder="Select plant"
              boxWidth="11vw"
            />
          </div>

          {/* work center */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <CustomSelect
              options={workCenterOptions}
              value={workCenter}
              onChange={(v) => setWorkCenter(v)}
              placeholder="Select work center"
            />
          </div>

          {/* line */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <CustomSelect
              options={lineOptions}
              value={line}
              onChange={(v) => setLine(v)}
              placeholder="Select line"
              boxWidth="25vw"
            />
          </div>
        </div>

        <div
          style={{
            fontSize: '2vw',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            marginRight: '1vw',
            cursor: 'pointer',
          }}
          onClick={() => {
            void navigate('/')
          }}
        >
          <TimeNow />
        </div>
      </div>

      {/* 필터 행 */}
      <div
        className={debugMode ? 'dev-scope-section filter-row' : 'filter-row'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          backgroundColor: '#ffffff',
        }}
      >
        <div
          className={debugMode ? 'dev-scope-filter-row' : ''}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            margin: '0.5vh',
            gap: '1vw',
          }}
        >
          {/* 옵션 선택 외 여백/지표 카드 */}
          <div
            style={{
              display: 'flex',
              gap: '1vw',
              alignItems: 'center',
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            {/* 첫번째 행 */}
            <div
              style={{
                display: 'flex',
                height: '10vh',
                gap: '0.2vw',
                alignItems: 'center',
                flexWrap: 'nowrap',
                width: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#e7f0fa',
                  }}
                >
                  Production
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#e7f0fa',
                  }}
                >
                  HFPA Rate
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#e7f0fa',
                  }}
                >
                  HFPA Defective Rate
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#e7f0fa',
                  }}
                >
                  HFPA Audit sample
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#e7f0fa',
                  }}
                >
                  HFPA Defective Q'ty
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#e7f0fa',
                  }}
                >
                  HFPA Defect Q'ty
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#ffffe0',
                  }}
                >
                  FTT rate
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#ffffe0',
                  }}
                >
                  FTT defective Q'ty
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  flex: 1,
                  width: '10vw',
                  border: '1px solid black',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flex: 1,
                    border: '1px solid black',
                    background: '#ffffe0',
                  }}
                >
                  FTT defect Q'ty
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '2vw',
                    flex: 2,
                    border: '1px solid black',
                    background: '#ffffff',
                  }}
                >
                  TBI
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid2 */}
      <div
        className={debugMode ? 'dev-scope-grid-section2' : ''}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          margin: '1vh',
          height: '100%',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '100%',
            marginBottom: '0vh',
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          <CustomTable
            rootClassName="hfpa-table"
            columns={columns}
            data={hfpaRows}
            colSizes={{
              0: '15vw',
              [columns.length - 1]: '10vw',
            }}
            rowSizes={{ 0: '5vh' } as Record<number, string>}
            enableHeaderFilter={false}
            enableColumnResize={false}
            horizontalAlign="center"
            verticalAlign="middle"
            visibleRows={20}
            onCellClickDetailed={({
              gridRow,
              col,
              dataIndexFiltered,
              dataIndexOriginal,
              row,
            }) => {
              if (!row) return // 헤더
              console.log({ gridRow, col, dataIndexFiltered, dataIndexOriginal, row })
            }}
            cellStyle={(row, col) => {
              const style: React.CSSProperties = {}

              // 헤더 행
              if (row === 0) {
                style.backgroundColor = '#e9f1fb'
                style.fontSize = '1.2vw'
                return style
              }

              // 첫 번째 컬럼 테두리
              if (col === 0) {
                style.borderRight = '2px solid #869ebd'
                style.borderLeft = '1px solid #888'
              }
              const totalColIndex = columns.length - 1
              if (col === totalColIndex) {
                style.backgroundColor = '#ffffe0'
              }

              // 데이터 행에서 첫 번째 컬럼 값(div)을 기준으로 스타일 지정
              const dataIndex = row - 1 // 헤더 한 줄 때문에 -1
              const rowData = hfpaRows[dataIndex]

              if (rowData?.div?.trim() === 'Defect Total') {
                style.backgroundColor = '#ffffe0'
                style.fontWeight = 'bold'
              }
              if (rowData?.div?.trim() === 'Defective Rate') {
                style.backgroundColor = '#ffffe0'
                style.fontWeight = 'bold'
              }

              if (rowData?.div?.trim() === 'Production Qty') {
                style.backgroundColor = '#ffffe0'
                style.fontWeight = 'bold'
              }

              return style
            }}
          />
        </div>
      </div>

      <Defect_Management_HFPA_POPUP
        isOpen={popupOpen}
        onClose={() => {
          setPopupOpen(false)
          setScannedValue('')
        }}
        scannedValue={scannedValue}
        plantCd={plant}
        workCenter={workCenter}
        lineCd={line}
      />
      <AlertDialog ref={alertRef} />
    </div>
  )
}
