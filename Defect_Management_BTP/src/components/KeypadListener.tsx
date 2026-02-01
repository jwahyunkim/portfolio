// src/components/HFPAKeypadListener.tsx

import { useEffect, useState, useRef } from 'react'
import { fetchHFPADefectCode, type FetchHFPADefectCodeParams } from '../data/api'

// 테이블 한 줄 타입 (팝업에서도 재사용할 수 있게 export)
export interface HFPATableRow {
  keypad: string
  reason: string
  qty: string
}

// 선택된 불량 (향후 백엔드 전송용)
export interface SelectedDefect {
  keypad: string
  reason: string
  qty: number
}

export interface HFPAKeypadListenerProps {
  // 팝업 열렸을 때만 동작하도록 제어
  enabled?: boolean
  // KeypadListener가 처리한 결과를 바깥으로 전달
  onUpdate: (payload: {
    tableRows: HFPATableRow[]
    selectedDefects: SelectedDefect[]
    loading: boolean
    errorMsg: string
  }) => void
}

/**
 * HFPA 전용 Keypad Listener
 *
 * - 내부에서 HFPA 불량 코드 API 호출 (plant_cd='C200', code_class_cd='HFPA')
 * - 응답을 테이블용 데이터(HFPATableRow[])로 가공
 * - Numpad 숫자 입력 시
 *   - 해당 keypad 행의 Qty +1
 *   - Qty>0 행만 SelectedDefect[] 로 모아 onUpdate 로 전달
 */
export default function HFPAKeypadListener({
  enabled = true,
  onUpdate,
}: HFPAKeypadListenerProps) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [tableRows, setTableRows] = useState<HFPATableRow[]>([])
  const [selectedDefects, setSelectedDefects] = useState<SelectedDefect[]>([])

  // 중복 호출 방지용 AbortController
  const abortRef = useRef<AbortController | null>(null)

  // 1) HFPA 코드 로드 (API 호출)
  useEffect(() => {
    if (!enabled) return

    const load = async () => {
      if (abortRef.current) abortRef.current.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setLoading(true)
      setErrorMsg('')
      setTableRows([])
      setSelectedDefects([])

      try {
        const params: FetchHFPADefectCodeParams = {
          plant_cd: 'C200',
          code_class_cd: 'HFPA',
        }

        const res = await fetchHFPADefectCode(params)

        const rows: HFPATableRow[] = res.data.map((item) => ({
          keypad: item.value_2 ?? '',   // "2"
          reason: item.code_name ?? '', // "Upper Contamination"
          qty: '',
        }))

        setTableRows(rows)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'request failed'
        setErrorMsg(msg)
        setTableRows([])
        setSelectedDefects([])
      } finally {
        setLoading(false)
      }
    }

    void load()

    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [enabled])

  // 2) 키보드(Numpad) 입력 처리
  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Numpad 숫자만 처리 (Numpad0~Numpad9)
      if (!e.code.startsWith('Numpad')) return
      if (!/^[0-9]$/.test(e.key)) return

      const keypadDigit = e.key // '2' 같은 값

      setTableRows((prev) => {
        const updated = prev.map((row) => {
          if (row.keypad !== keypadDigit) return row
          const currentQty = Number(row.qty) || 0
          const nextQty = currentQty + 1
          return { ...row, qty: String(nextQty) }
        })

        // Qty>0 인 행들을 SelectedDefect 로 정리
        const selected = updated
          .filter((r) => {
            const q = Number(r.qty)
            return !Number.isNaN(q) && q > 0
          })
          .map((r) => ({
            keypad: r.keypad,
            reason: r.reason,
            qty: Number(r.qty),
          }))

        setSelectedDefects(selected)

        return updated
      })
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])

  // 3) 내부 상태가 바뀔 때마다, 정리된 값만 밖으로 배출
  useEffect(() => {
    onUpdate({
      tableRows,
      selectedDefects,
      loading,
      errorMsg,
    })
  }, [tableRows, selectedDefects, loading, errorMsg, onUpdate])

  // 화면에는 아무것도 렌더링하지 않음
  return null
}
