// src/pages/Defect_Management_HFPA_POPUP.tsx 

import '../MyApp.css'
import './Defect_Management_HFPA_POPUP.css'

import React, { useEffect, useState, useRef } from 'react'
import { Dialog, Button } from '@ui5/webcomponents-react'
import { format } from 'date-fns'

// import TimeNow from '../../components/TimeNow'

import CustomInput from '../../components/CustomInput'
import FormRow from '../../components/FormRow'
import CustomTable from '../../components/CustomTable'
import CustomMultiButton, { createSpaceIndexFormatter } from '../../components/CustomMultiButton'

import {
  fetchHFPADefectCode,
  type FetchHFPADefectCodeParams,
  fetchHFPAMisspackingScan,
  type FetchHFPAMisspackingScanParams,
  HfpaMisspackingScanItem,
  saveHFPAInspect,
  type HfpaInspectRequestBody,
  type HfpaInspectDefectItem,
} from '../../data/api'

export interface HFPA_PopupProps {
  isOpen: boolean
  scannedValue: string
  plantCd: string
  workCenter: string
  lineCd: string
  onClose: () => void
}

// 테이블 한 줄 타입
interface HFPATableRow {
  keypad: string
  reason: string
  qty: string
  subCode: string   // sub_code 보관용 필드
}

// 선택된 불량(향후 백엔드 전송용)
interface SelectedDefect {
  keypad: string
  reason: string
  qty: number
  subCode: string
}

export default function Defect_Management_HFPA_POPUP({
  isOpen,
  onClose,
  scannedValue,
  plantCd,
  workCenter,
  lineCd,
}: HFPA_PopupProps) {

  // 옵션 상태 (새 API 사용)
  const [loading2, setLoading2] = useState<boolean>(false)
  const [errorMsg2, setErrorMsg2] = useState<string>('')

  // 버튼용 아이템 (Reason)
  const [items, setItems] = useState<string[]>([])

  // 테이블용 데이터
  const [tableData, setTableData] = useState<HFPATableRow[]>([])

  // UCC 조회 결과
  const [scanData, setScanData] = useState<HfpaMisspackingScanItem | null>(null)

  const BUTTON_WIDTH = 160
  const BUTTON_HEIGHT = 85
  const GAP = 8
  const COLS = 3
  const CONTAINER_WIDTH = BUTTON_WIDTH * COLS + GAP * (COLS - 1)

  const abortRef = useRef<AbortController | null>(null)
  const handleSubmitRef = useRef<(() => Promise<void>) | null>(null)



  const loadFilterData = async () => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading2(true)
    setErrorMsg2('')
    setItems([])
    setTableData([])

    try {
      const params: FetchHFPADefectCodeParams = {
        plant_cd: 'C200',
        code_class_cd: 'HFPA',
      }

      const res = await fetchHFPADefectCode(params)

      // 테이블용 rows 생성 + reason 없는 건 제거
      const rows: HFPATableRow[] = res.data
        .map((item) => ({
          keypad: item.value_2 ?? '',
          reason: item.code_name ?? '',
          qty: '',
          subCode: item.sub_code ?? '',
        }))
        .filter((row) => row.reason !== '')

      // items 는 rows 기준으로 동일 인덱스 사용
      setTableData(rows)
      setItems(rows.map((r) => r.reason))
      console.log('rows', rows)
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : 'request failed'
      setErrorMsg2(msg)
      setItems([])
      setTableData([])
    } finally {
      setLoading2(false)
    }
  }

  useEffect(() => {
    void loadFilterData()
  }, [])

  const resetForm = () => {
    setErrorMsg2('')
    setLoading2(false)

    // 선택된 불량(qty) 초기화
    setTableData(prev =>
      prev.map(row => ({
        ...row,
        qty: '',        // 모두 선택 해제
      }))
    )
    setScanData(null)
  }

  useEffect(() => {
    resetForm()
  }, [isOpen])

  // scannedValue(UCC)를 이용하여 misspacking-scan 호출, PO / Style Code 세팅
  useEffect(() => {
    if (!scannedValue) {
      setScanData(null)
      return
    }

    const loadPoAndStyle = async () => {
      try {
        const params: FetchHFPAMisspackingScanParams = {
          exidv: scannedValue.trim(),
        }

        const res = await fetchHFPAMisspackingScan(params)

        console.log('[HFPA misspacking res]', res)

        if (res.success && res.data.length > 0) {
          const first = res.data[0]
          setScanData(first)
          console.log('first', first)
        } else {
          setScanData(null)
        }
      } catch (e: unknown) {
        console.error(e)
        setScanData(null)
      }
    }

    void loadPoAndStyle()
  }, [scannedValue])

  // 공통 처리 함수: keypad(또는 버튼 클릭) 입력 시 qty 토글
  const applyKeypadToggle = (keyLabel: string) => {
    setTableData((prev) => {
      const updated = prev.map((row) => {
        if (row.keypad !== keyLabel) return row

        const currentQty = Number(row.qty) || 0
        const nextQty = currentQty === 0 ? 1 : ''  // 0 ↔ 1 토글

        return { ...row, qty: String(nextQty) }
      })

      const selected = updated
        .filter((r) => Number(r.qty) > 0)
        .map((r) => ({
          keypad: r.keypad,
          reason: r.reason,
          qty: Number(r.qty),
          subCode: r.subCode,
        }))

      console.log('[HFPA selectedDefects]', selected)

      return updated
    })
  }

  // ESC + Numpad 키 처리
  useEffect(() => {
    if (!isOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Enter(일반/넘패드) → Submit
      if (e.key === 'Enter') {
        e.preventDefault()
        void handleSubmitRef.current?.()
        return
      }

      if (!e.code.startsWith('Numpad')) return

      const keyLabel = e.key   // '2', '-', '+', '*', '/', '.' 등

      // 키보드 입력도 공통 로직 사용
      applyKeypadToggle(keyLabel)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // ====== tableData 를 기준으로 선택 상태/선택 불량 계산 ======
  const selectedDefects: SelectedDefect[] = tableData
    .filter((r) => Number(r.qty) > 0)
    .map((r) => ({
      keypad: r.keypad,
      reason: r.reason,
      qty: Number(r.qty),
      subCode: r.subCode,
    }))

  const selectedButtonIndices: number[] = tableData.reduce(
    (acc, row, idx) => {
      if (Number(row.qty) > 0) acc.push(idx)
      return acc
    },
    [] as number[],
  )
  // ======================================================

  const spaceFormatter: (text: string, index: number) => string =
    createSpaceIndexFormatter({
      0: [1],
      2: [1],
      6: [1]
    })

  const columns = [
    { Header: 'Keypad', accessor: 'keypad' },
    { Header: 'Reason', accessor: 'reason' },
    { Header: 'Qty', accessor: 'qty' },
  ]

  // ====== Submit 처리: 선택값 -> saveHFPAInspect 호출 ======
  const handleSubmit = async () => {
    if (!scanData) {
      setErrorMsg2('No results found for UCC No.')
      return
    }

    // if (selectedDefects.length === 0) {
    //   setErrorMsg2('불량을 하나 이상 선택하세요.')
    //   return
    // }

    // defects 배열 변환
    const defects: HfpaInspectDefectItem[] = selectedDefects.map((d) => ({
      defect_cd: d.subCode,
    }))

    // 로컬 시간 기준 날짜/시간 생성
    const now = new Date()
    const inspect_date = format(now, 'yyyyMMdd')
    const hour_cd = format(now, 'HH') // 예: "07"

    const body: HfpaInspectRequestBody = {
      inspect_date,
      plant_cd: plantCd,
      work_center: workCenter,
      line_cd: lineCd,
      hour_cd,
      po_no: scanData.ebeln,
      po_seq: scanData.ebelp,
      ucc_no: scannedValue,
      style_cd: scanData.style_cd,
      size_cd: scanData.size_cd,
      inspector_no: 'test',
      creator: 'test',
      create_pc: 'test',
      defects,
    }

    console.log('[HFPA Submit body]', body)

    setLoading2(true)
    setErrorMsg2('')

    try {
      const res = await saveHFPAInspect(body)

      if (!res.success) {
        setErrorMsg2(res.message ?? '저장에 실패했습니다.')
        console.error('[HFPA Submit fail]', res)
        return
      }

      console.log('[HFPA Submit success]', res)

      resetForm()

      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '네트워크 오류'
      setErrorMsg2(msg)
      console.error('[HFPA Submit error]', e)
    } finally {
      setLoading2(false)
    }
  }
  handleSubmitRef.current = handleSubmit
  // ======================================================

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} className='no-focus fixed-x' style={{ width: 'fit-content', height: 'fit-content' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            fontSize: '1.1rem',
            fontWeight: 600,
            margin: '1vh 0',
            gap: '2vw',
          }}
        >
          <span></span>
          <div style={{ minHeight: 20, display: 'flex', gap: '2vw' }}>
            {loading2 && <span>Loading...</span>}
            {errorMsg2 && <span style={{ color: 'red' }}>{errorMsg2}</span>}
            {/* {selectedDefects.length > 0 && (
              <span>Selected: {selectedDefects.length}</span>
            )} */}
          </div>
        </div>

        <div style={{ height: '2px', backgroundColor: 'black', margin: '0.3vh 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', backgroundColor: '' }}>
          <FormRow label='UCC'>
            <CustomInput
              value={scannedValue}
              readOnly
              boxWidth='15vw'
              boxHeight='3vh'
              innerFont='1rem'
              styleBox={{ backgroundColor: '#ffff00' }}
            />
          </FormRow>
          <FormRow label='PO'>
            <CustomInput
              value={scanData?.po ?? ''}
              readOnly
              boxWidth='15vw'
              boxHeight='3vh'
              innerFont='1rem'
              styleBox={{ backgroundColor: '' }}
            />
          </FormRow>
          <FormRow label='Style Code'>
            <CustomInput
              value={scanData?.style_cd ?? ''}
              readOnly
              boxWidth='15vw'
              boxHeight='3vh'
              innerFont='1rem'
              styleBox={{ backgroundColor: '' }}
            />
          </FormRow>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', width: '100%', backgroundColor: '', gap: '2vw' }}>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', height: 'auto', margin: '1vh', backgroundColor: '' }}>
            <CustomTable
              rootClassName='hfpa-popup-table'
              columns={columns}
              data={tableData}
              colSizes={{
                0: '4vw',
                1: '15vw',
                2: '4vw',
              }}
              rowSizes={{ 0: '5vh' } as Record<number, string>}
              enableHeaderFilter={false}
              enableColumnResize={false}
              horizontalAlign='center'
              verticalAlign='middle'
              onCellClickDetailed={({ gridRow, col, dataIndexFiltered, dataIndexOriginal, row }) => {
                if (!row) return
                console.log({ gridRow, col, dataIndexFiltered, dataIndexOriginal, row })
              }}
              cellStyle={(row, col) => {
                const style: React.CSSProperties = {}

                if (col === 0) {
                  style.borderLeft = '1px solid #ccc'
                }
                if (col === 1) {
                  style.justifyContent = 'left',
                    style.paddingLeft = '1vw'
                }
                if (row === 0) {
                  style.backgroundColor = '#ddebf7'
                  style.fontSize = '1vw'
                  style.fontWeight = '400'
                }
                return style
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', margin: '1vh', backgroundColor: '' }}>
            <div style={{ margin: '', backgroundColor: '' }}>
              <div
                style={{
                  width: CONTAINER_WIDTH,
                  // border: '1px solid #ddd',
                }}
              >
                <CustomMultiButton
                  items={items}
                  formatItemText={spaceFormatter}
                  gap={GAP}
                  variant='none'
                  minWidth={BUTTON_WIDTH}
                  maxWidth={BUTTON_WIDTH}
                  minHeight={BUTTON_HEIGHT}
                  maxHeight={BUTTON_HEIGHT}
                  buttonStyle={{}}
                  fontSize={14}
                  selectionMode='multiple'
                  // tableData 기반으로 선택 상태를 완전히 제어(키보드/버튼 공통)
                  selectedIndices={selectedButtonIndices}
                  onClick={(_text, index) => {
                    const row = tableData[index]
                    if (!row) return
                    // 버튼 클릭도 keypad 입력과 동일한 로직 사용
                    applyKeypadToggle(row.keypad)
                  }}
                />
              </div>
            </div>
          </div>

        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-end',
            margin: '1vh',
            gap: '0.8vw',
          }}
        >
          <Button
            design='Emphasized'
            onClick={() => { void handleSubmit() }}  // async 래핑 → no-misused-promises 해결
          >
            Submit
          </Button>
        </div>

      </div>
    </Dialog>
  )
}
