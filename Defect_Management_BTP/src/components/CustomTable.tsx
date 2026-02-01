import React, { JSX } from 'react'
import { createPortal } from 'react-dom'
import CustomSelect from './CustomSelect'
import { Icon } from '@ui5/webcomponents-react'
import '@ui5/webcomponents-icons/dist/filter'

interface MergedCell {
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
}

type Align = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'

type AccessorFn<T> = (row: T, rowIndex: number) => React.ReactNode
export interface ColumnDef<T = unknown> {
  Header: React.ReactNode
  accessor: string | AccessorFn<T>
  id?: string
  align?: Align
  vAlign?: VAlign
}

function isIndexable(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function deepGet(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!isIndexable(acc)) return undefined
    return acc[key]
  }, obj)
}

type MatchMode = 'includes' | 'startsWith' | 'equals'

interface AutoFitContentOption {
  enabled: boolean          // 기본 16
  paddingPx?: number
  includeHeader?: boolean   // 기본 true
}

// 서브토탈 1행 정보
interface SubtotalRow<T> {
  groupValue: unknown
  label: string
  totals: (number | null)[]
  rows: T[]
}

interface CustomTableProps<T = unknown> {
  rootClassName?: string
  scrollClassName?: string

  /** 모드 A: 직접 행/열 정의 */
  rows?: number
  cols?: number
  cellContent?: (row: number, col: number) => React.ReactNode | null

  /** 모드 B: AnalyticalTable 유사 */
  columns?: ColumnDef<T>[]
  data?: T[]
  headerRow?: boolean

  /** 필터링(모드 B에서만 적용) */
  globalFilterValue?: string
  columnFilters?: Record<number | string, string>
  filterCaseSensitive?: boolean
  filterTrim?: boolean
  filterMatchMode?: MatchMode
  getFilterText?: (cellValue: unknown) => string

  /** 헤더 필터링 제어 */
  enableHeaderFilter?: boolean
  showHeaderFilterValue?: boolean

  /** 사이즈/스타일 */
  colSizes?: Record<number, string>
  rowSizes?: Record<number, string>
  defaultRowSize?: string
  defaultColSize?: string
  cellStyle?: (row: number, col: number) => React.CSSProperties

  /** 병합
   * - display: props로 받은 좌표를 화면 그리드 좌표로 그대로 사용
   * - original: props로 받은 좌표를 "원본 인덱스 스펙"으로 간주하고,
   *             필터 결과의 보이는 원본 인덱스와 교차하여 연속 구간만 동적 병합
   */
  mergedCells?: MergedCell[]
  mergedCellsSpecMode?: 'display' | 'original'

  horizontalAlign?: Align
  verticalAlign?: VAlign

  /** 열별 정렬(수평/수직) 오버라이드 */
  columnAlign?: Record<number, Align>
  columnVAlign?: Record<number, VAlign>

  /** 헤더 고정 + 본문 스크롤(세로) 모드 제어 */
  hasVerticalOverflow?: boolean

  /** 열 리사이징 제어 */
  enableColumnResize?: boolean

  /** 보이게 할 본문(데이터) 행 수 (헤더 제외).
   *  B모드 + 서브토탈 사용 시:
   *  → 데이터 + 서브토탈를 합한 “전체 행 수”와 비교해서
   *     최소 visibleRows 만큼은 그리드 행을 만들어 줌(데이터는 자르지 않음)
   */
  visibleRows?: number

  /** 클릭 이벤트 */
  onCellClick?: (row: number, col: number) => void
  onCellClickDetailed?: (info: {
    gridRow: number
    col: number
    dataIndexFiltered?: number
    dataIndexOriginal?: number
    row?: T
  }) => void

  /** 바디 셀 호버 제어(헤더에는 적용하지 않음) */
  enableHover?: boolean
  hoverCellStyle?: React.CSSProperties
  /** 호버 범위 선택: 'cell' = 단일 셀, 'row' = 행 전체 */
  hoverMode?: 'cell' | 'row'

  /** 합계 행 제어(모드 B에서만 적용) */
  showTotalRow?: boolean
  /** 합계 행 라벨 텍스트(첫 번째 열) */
  totalLabel?: string
  /** 합계 행 고정 높이(필터 후에도 적용, split header/body 모드에서만 사용) */
  totalRowSize?: string
  /** 합계에 포함할 컬럼 목록(인덱스 또는 id/accessor 문자열) */
  totalColsInclude?: Array<number | string>
  /** 리사이즈 중 컬럼 합이 이 값 아래로 내려가지 않도록 강제 */
  minTableWidth?: number | string

  /** ▼ 신규 1: colSizes를 "최소폭"으로만 쓰는 모드 */
  useColSizesAsMin?: boolean

  /** 내용에 맞춰 최소폭 갱신 */
  autoFitContent?: AutoFitContentOption

  /** ▼ 서브토탈(모드 B 전용) */
  /** 그룹 기준 컬럼(숫자 인덱스) */
  subtotalBy?: number
  /** 서브토탈 라벨(문자열 or 함수) */
  subtotalLabel?: string | ((groupValue: unknown, firstRow?: T, rows?: T[]) => string)
  /** 서브토탈 합산 대상 컬럼 인덱스 목록 */
  subtotalColsInclude?: number[]
  /** 계산된 서브토탈 정보 콜백 */
  onSubtotalsComputed?: (rows: SubtotalRow<T>[]) => void
  /** 서브토탈 라벨이 차지할 열 수(기본 1: 병합 없음) */
  subtotalLabelSpan?: number
}

/** 단위→px. 'px'|'vw'|'vh'만 지원. 'fr' 및 기타는 무시(=null) */
function toPxOrNull(v?: string): number | null {
  if (!v) return null
  const s = String(v).trim()
  const m = /^(\d+(?:\.\d+)?)(px|vw|vh)$/i.exec(s)
  if (!m) return null
  const n = parseFloat(m[1])
  const u = m[2].toLowerCase()
  if (u === 'px') return n
  if (typeof window !== 'undefined') {
    if (u === 'vw') return Math.round((window.innerWidth * n) / 100)
    if (u === 'vh') return Math.round((window.innerHeight * n) / 100)
  }
  return null
}

function CustomTable<T = unknown>({
  rootClassName,
  scrollClassName,

  // 공통
  colSizes = {},
  rowSizes = {},
  defaultRowSize = 'auto',
  defaultColSize = 'auto',
  cellStyle = () => ({}),
  mergedCells = [],
  mergedCellsSpecMode = 'display',
  horizontalAlign = 'left',
  verticalAlign = 'middle',
  onCellClick,
  onCellClickDetailed,

  // 열별 정렬 오버라이드
  columnAlign = {},
  columnVAlign = {},

  // 모드 A
  rows,
  cols,
  cellContent,

  // 모드 B
  columns,
  data,
  headerRow = true,

  // 필터
  globalFilterValue,
  columnFilters,
  filterCaseSensitive = false,
  filterTrim = true,
  filterMatchMode = 'includes',
  getFilterText,

  // 헤더 필터 옵션
  enableHeaderFilter = true,
  showHeaderFilterValue = false,

  // 세로 오버플로우 제어
  hasVerticalOverflow = false,

  // 열 리사이징 제어
  enableColumnResize = true,
  minTableWidth,
  // 보이는 행 수
  visibleRows,

  // 호버
  enableHover = false,
  hoverCellStyle = { backgroundColor: '#eef2ff' },
  hoverMode = 'cell',

  // 합계
  showTotalRow = false,
  totalLabel = 'Total',
  totalRowSize,
  totalColsInclude,

  // 신규
  useColSizesAsMin = false,
  autoFitContent = { enabled: false, paddingPx: 16, includeHeader: true },

  // 서브토탈
  subtotalBy,
  subtotalLabel,
  subtotalColsInclude,
  onSubtotalsComputed,
  subtotalLabelSpan = 1
}: CustomTableProps<T>): JSX.Element {
  const useAnalytical = Array.isArray(columns) && Array.isArray(data)

  // ===== 텍스트 정규화/매칭 유틸 =====

  const toText = React.useCallback(
    (v: unknown) => {
      if (getFilterText) return getFilterText(v)
      if (v == null) return ''
      if (v instanceof Date) return v.toISOString()

      // ReactElement 체크 (checkbox 등의 value 속성 읽기)
      if (React.isValidElement(v)) {
        const props = v.props as Record<string, unknown>
        if (props && typeof props.value === 'string') {
          return props.value
        }
        return ''
      }

      switch (typeof v) {
        case 'string': return v
        case 'number': return v.toString()
        case 'boolean': return v ? 'true' : 'false'
        default: return ''
      }
    },
    [getFilterText]
  )

  // 측정(텍스트 폭 필요할 때 사용)
  function measureTextWidth(text: string, font: string): number {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 0
    ctx.font = font
    return ctx.measureText(text).width
  }

  // ===== 헤더 셀렉트 기반 내부 필터 상태 =====
  const [uiColumnFilters, setUiColumnFilters] = React.useState<Record<number, string | undefined>>({})

  // 외부(columnFilters) + 내부(uiColumnFilters) 머지 → 인덱스 기준 맵
  const effectiveColumnFilters = React.useMemo(() => {
    if (!useAnalytical) return {} as Record<number, string>
    const map: Record<number, string> = {}
    if (columnFilters) {
      Object.entries(columnFilters).forEach(([k, v]) => {
        if (v == null || String(v).trim() === '') return
        const idx = Number.isNaN(Number(k))
          ? (columns || []).findIndex(col => {
            if (typeof col.accessor === 'string') return col.accessor === k || col.id === k
            return col.id === k
          })
          : Number(k)
        if (idx >= 0) map[idx] = String(v)
      })
    }
    Object.entries(uiColumnFilters).forEach(([k, v]) => {
      if (v == null || v === '') return
      map[Number(k)] = v
    })
    return map
  }, [columnFilters, uiColumnFilters, columns, useAnalytical])

  // ===== 1단계: 전역/컬럼 필터 적용 =====
  const applyFilters = React.useCallback(
    (rowsIn: T[]) => {
      if (!useAnalytical) return rowsIn

      const normalizeLocal = (s: string) => {
        const t = filterTrim ? s.trim() : s
        return filterCaseSensitive ? t : t.toLowerCase()
      }
      const toTextLocal = (v: unknown) => {
        if (getFilterText) return getFilterText(v)
        if (v == null) return ''
        if (v instanceof Date) return v.toISOString()

      // ReactElement 체크 (checkbox 등의 value 속성 읽기)
      if (React.isValidElement(v)) {
        const props = v.props as Record<string, unknown>
        if (props && typeof props.value === 'string') {
          return props.value
        }
        return ''
      }

        switch (typeof v) {
          case 'string': return v
          case 'number': return v.toString()
          case 'boolean': return v ? 'true' : 'false'
          default: return ''
        }
      }

      const matchLocal = (cell: unknown, query: string) => {
        const cellText = normalizeLocal(toTextLocal(cell))
        const q = normalizeLocal(query)
        if (q === '') return true
        if (filterMatchMode === 'equals') return cellText === q
        if (filterMatchMode === 'startsWith') return cellText.startsWith(q)
        return cellText.includes(q)
      }

      const hasGlobal = !!(globalFilterValue && normalizeLocal(globalFilterValue) !== '')
      const hasColumn = Object.keys(effectiveColumnFilters).length > 0
      if (!hasGlobal && !hasColumn) return rowsIn

      return rowsIn.filter((row, originalIndex) => {
        if (hasGlobal) {
          const anyHit = (columns || []).some(col => {
            const acc = col.accessor
            const cell = typeof acc === 'function' ? acc(row, originalIndex) : deepGet(row, acc)
            return matchLocal(cell, globalFilterValue)
          })
          if (!anyHit) return false
        }
        if (hasColumn) {
          for (let cIdx = 0; cIdx < (columns?.length || 0); cIdx++) {
            const q = effectiveColumnFilters[cIdx]
            if (q == null || String(q).trim() === '') continue
            const acc = columns[cIdx].accessor
            const cell = typeof acc === 'function' ? acc(row, originalIndex) : deepGet(row, acc)
            if (normalizeLocal(toTextLocal(cell)) !== normalizeLocal(String(q))) return false
          }
        }
        return true
      })
    },
    [
      useAnalytical,
      globalFilterValue,
      effectiveColumnFilters,
      columns,
      getFilterText,
      filterTrim,
      filterCaseSensitive,
      filterMatchMode
    ]
  )

  // 원본 인덱스 매핑 유지 + 필터 적용 전체
  const originalIndexed = React.useMemo(
    () => (useAnalytical ? data?.map((r, i) => ({ r, i })) ?? [] : []),
    [useAnalytical, data]
  )

  const filteredIndexedAll = React.useMemo(() => {
    if (!useAnalytical) return []
    const applied = applyFilters(originalIndexed.map(x => x.r))
    return applied.map(r => {
      const oi = originalIndexed.find(x => x.r === r)?.i ?? -1
      return { r, i: oi }
    })
  }, [useAnalytical, applyFilters, originalIndexed])

  // ===== visibleRows + 서브토탈/확장 행 구성 =====

  // 모드 B에서만 의미 있는 플래그
  const subtotalEnabled = useAnalytical && typeof subtotalBy === 'number'

  // 전체 컬럼 수
  const effectiveCols = useAnalytical ? (columns?.length ?? 0) : (cols ?? 0)

  // 셀 원시 값 추출
  const getRawValue = React.useCallback(
    (rowObj: T, dataRowIndex: number, c: number): unknown => {
      const acc = columns?.[c]?.accessor
      if (typeof acc === 'function') return acc(rowObj, dataRowIndex)
      if (typeof acc === 'string') return deepGet(rowObj, acc)
      return undefined
    },
    [columns]
  )

  // 숫자 변환
  const toNumber = (val: unknown): number | null => {
    if (val == null) return null
    if (typeof val === 'number' && Number.isFinite(val)) return val
    if (typeof val === 'string') {
      const s = val.replace(/,/g, '').trim()
      if (s === '') return null
      const n = Number(s)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  /** 서브토탈 + “확장된 행 배열(데이터/서브토탈 순서)” 구성 */
  const { subtotalRows, expandedRowsAll } = React.useMemo(() => {
    // Analytical 모드가 아니면: 서브토탈 없음, 데이터 행만 사용
    if (!useAnalytical || !subtotalEnabled) {
      return {
        subtotalRows: [] as SubtotalRow<T>[],
        expandedRowsAll: filteredIndexedAll.map((_, idx) => ({
          kind: 'data' as const,
          filteredIndex: idx
        }))
      }
    }

    if (!columns || columns.length === 0) {
      return {
        subtotalRows: [] as SubtotalRow<T>[],
        expandedRowsAll: filteredIndexedAll.map((_, idx) => ({
          kind: 'data' as const,
          filteredIndex: idx
        }))
      }
    }

    const groupColIdx = subtotalBy
    if (groupColIdx < 0 || groupColIdx >= columns.length) {
      return {
        subtotalRows: [] as SubtotalRow<T>[],
        expandedRowsAll: filteredIndexedAll.map((_, idx) => ({
          kind: 'data' as const,
          filteredIndex: idx
        }))
      }
    }

    // 서브토탈 합산 대상 컬럼 인덱스 집합
    const includeSet = new Set<number>()
    if (Array.isArray(subtotalColsInclude) && subtotalColsInclude.length > 0) {
      subtotalColsInclude.forEach(i => {
        if (Number.isInteger(i) && i >= 0 && i < columns.length) {
          includeSet.add(i)
        }
      })
    } else if (Array.isArray(totalColsInclude) && totalColsInclude.length > 0) {
      for (let c = 0; c < columns.length; c++) {
        for (const key of totalColsInclude) {
          if (typeof key === 'number') {
            if (key === c) { includeSet.add(c); break }
          } else if (typeof key === 'string') {
            const col = columns[c]
            const idMatch = col?.id === key
            const accMatch = typeof col?.accessor === 'string' && col.accessor === key
            if (idMatch || accMatch) { includeSet.add(c); break }
          }
        }
      }
    }

    // 합산할 컬럼이 하나도 없으면 서브토탈 비활성
    if (includeSet.size === 0) {
      return {
        subtotalRows: [] as SubtotalRow<T>[],
        expandedRowsAll: filteredIndexedAll.map((_, idx) => ({
          kind: 'data' as const,
          filteredIndex: idx
        }))
      }
    }

    const resultSub: SubtotalRow<T>[] = []
    const expanded: Array<
      | { kind: 'data'; filteredIndex: number }
      | { kind: 'subtotal'; subtotalIndex: number }
    > = []

    let currentKey: string | null = null
    let currentValue: unknown = undefined
    let currentIndices: number[] = []

    const flushGroup = () => {
      if (!currentIndices.length) return

      const colTotals = new Array<number | null>(columns.length).fill(null)

      for (let c = 0; c < columns.length; c++) {
        if (!includeSet.has(c)) continue
        let sum = 0
        let has = false
        for (const fi of currentIndices) {
          const rowObj = filteredIndexedAll[fi].r
          const raw = getRawValue(rowObj, fi, c)
          const n = toNumber(raw)
          if (n != null) {
            has = true
            sum += n
          }
        }
        colTotals[c] = has ? sum : null
      }

      // ✅ 추가/이동: labelText 계산보다 먼저 groupRows 생성
      const groupRows = currentIndices.map(fi => filteredIndexedAll[fi].r)

      let labelText: string
      if (typeof subtotalLabel === 'function') {
        // ✅ 변경: firstRow, rows 전달
        labelText = subtotalLabel(currentValue, groupRows[0], groupRows)
      } else if (typeof subtotalLabel === 'string') {
        labelText = subtotalLabel
      } else {
        const base = toText(currentValue)
        labelText = base ? `${base} 소계` : '소계'
      }


      const subIndex = resultSub.length
      resultSub.push({
        groupValue: currentValue,
        label: labelText,
        totals: colTotals,
        rows: groupRows
      })

      // 데이터 행들
      currentIndices.forEach(fi => {
        expanded.push({ kind: 'data', filteredIndex: fi })
      })
      // 해당 그룹의 서브토탈 행
      expanded.push({ kind: 'subtotal', subtotalIndex: subIndex })

      currentIndices = []
    }

    for (let fi = 0; fi < filteredIndexedAll.length; fi++) {
      const rowObj = filteredIndexedAll[fi].r
      const gRaw = getRawValue(rowObj, fi, groupColIdx)
      const gKey = toText(gRaw)

      if (currentKey === null) {
        currentKey = gKey
        currentValue = gRaw
        currentIndices = [fi]
      } else if (gKey === currentKey) {
        currentIndices.push(fi)
      } else {
        flushGroup()
        currentKey = gKey
        currentValue = gRaw
        currentIndices = [fi]
      }
    }
    flushGroup()

    return {
      subtotalRows: resultSub,
      expandedRowsAll: expanded
    }
  }, [
    useAnalytical,
    subtotalEnabled,
    columns,
    filteredIndexedAll,
    subtotalBy,
    subtotalColsInclude,
    totalColsInclude,
    getRawValue,
    toNumber,
    toText
  ])

  /** visibleRows 적용:
   *  - 데이터 + 서브토탈 전체 개수와 비교해서
   *  - "최소 행 수"만 보장 (데이터는 잘라내지 않음)
   */
  const expandedRowsToRender = React.useMemo(
    () => {
      if (!useAnalytical) {
        return [] as Array<
          { kind: 'data'; filteredIndex: number } |
          { kind: 'subtotal'; subtotalIndex: number }
        >
      }
      // 항상 전체 확장 행 배열 사용
      return expandedRowsAll
    },
    [useAnalytical, expandedRowsAll]
  )

  /** 화면에 실제로 보이는 “데이터 행”들만 따로 추출 */
  const dataRowDescriptors = React.useMemo(
    () =>
      useAnalytical
        ? expandedRowsToRender.filter(
          (it): it is { kind: 'data'; filteredIndex: number } => it.kind === 'data'
        )
        : [],
    [useAnalytical, expandedRowsToRender]
  )

  /** 보이는 데이터 행에 대한 filteredIndexed */
  const filteredIndexed = React.useMemo(
    () =>
      useAnalytical
        ? dataRowDescriptors.map(d => filteredIndexedAll[d.filteredIndex])
        : [],
    [useAnalytical, dataRowDescriptors, filteredIndexedAll]
  )

  /** 보이는 데이터 행에 대한 순수 데이터 배열 */
  const dataForRender: T[] = React.useMemo(
    () => (useAnalytical ? filteredIndexed.map(x => x.r) : []),
    [useAnalytical, filteredIndexed]
  )

  /** 확장 행에 대한 메타(확장 인덱스 → 데이터 인덱스 또는 서브토탈 인덱스) */
  const expandedMeta = React.useMemo(
    () => {
      if (!useAnalytical) {
        return [] as Array<
          | { kind: 'data'; dataIndex: number }
          | { kind: 'subtotal'; subtotalIndex: number }
        >
      }
      const result: Array<
        | { kind: 'data'; dataIndex: number }
        | { kind: 'subtotal'; subtotalIndex: number }
      > = []
      let dataIndex = 0
      expandedRowsToRender.forEach(item => {
        if (item.kind === 'data') {
          result.push({ kind: 'data', dataIndex })
          dataIndex += 1
        } else {
          result.push({ kind: 'subtotal', subtotalIndex: item.subtotalIndex })
        }
      })
      return result
    },
    [useAnalytical, expandedRowsToRender]
  )

  // 본문 행 수 = max(데이터+서브토탈 개수, visibleRows)
  // → visibleRows는 "최소 행 수"만 보장하고, 실제 데이터/서브토탈은 모두 렌더
  const bodyRowsToRender = useAnalytical
    ? Math.max(expandedRowsToRender.length, visibleRows ?? 0)
    : Math.max(visibleRows ?? 0, rows ?? 0)

  const totalEnabled = useAnalytical && showTotalRow

  // 헤더 고정 모드 여부(본문 스크롤)
  const splitHeaderBody = useAnalytical && headerRow && hasVerticalOverflow

  // 전체 그리드 행수(단일 그리드 모드에서만 합계 포함)
  const effectiveRows = useAnalytical
    ? headerRow
      ? bodyRowsToRender + (splitHeaderBody ? 0 : totalEnabled ? 1 : 0) + 1
      : bodyRowsToRender + (splitHeaderBody ? 0 : totalEnabled ? 1 : 0)
    : bodyRowsToRender

  if (!useAnalytical && typeof cellContent !== 'function') {
    // eslint-disable-next-line no-console
    console.error('CustomTable: cellContent가 없거나 columns/data가 없습니다.')
  }

  // ===== 합계 계산(보이는 “데이터 행” 기준, 서브토탈 숫자는 합계에 포함 X) =====
  const totalsByCol = React.useMemo<(number | null)[]>(() => {
    if (!totalEnabled) return Array<number | null>(effectiveCols).fill(null)

    // 포함 컬럼 인덱스 집합 생성(지정된 경우에만 제한)
    let includeSet: Set<number> | null = null
    if (useAnalytical && Array.isArray(totalColsInclude) && totalColsInclude.length > 0) {
      includeSet = new Set<number>()
      for (let c = 0; c < effectiveCols; c++) {
        for (const key of totalColsInclude) {
          if (typeof key === 'number') {
            if (key === c) { includeSet.add(c); break }
          } else {
            const col = columns[c]
            const idMatch = col?.id === key
            const accMatch = typeof col?.accessor === 'string' && col.accessor === key
            if (idMatch || accMatch) { includeSet.add(c); break }
          }
        }
      }
    }

    const sums = Array<number | null>(effectiveCols).fill(null)

    for (let c = 0; c < effectiveCols; c++) {
      // 포함 리스트가 있으면 그 안에 있는 컬럼만 합산
      if (includeSet && !includeSet.has(c)) {
        sums[c] = null
        continue
      }
      let sum = 0
      let has = false
      for (let r = 0; r < dataForRender.length; r++) {
        const raw = getRawValue(dataForRender[r], r, c)
        const n = toNumber(raw)
        if (n != null) { has = true; sum += n }
      }
      sums[c] = has ? sum : null
    }
    return sums
  }, [totalEnabled, effectiveCols, dataForRender, columns, totalColsInclude, useAnalytical, getRawValue])

  /** onSubtotalsComputed 콜백 호출 */
  React.useEffect(() => {
    if (typeof onSubtotalsComputed === 'function') {
      onSubtotalsComputed(subtotalRows)
    }
  }, [onSubtotalsComputed, subtotalRows])

  // ===== 헤더 클릭용: 고유값(필터 적용 후 전체 기준) =====
  const distinctValuesByCol = React.useMemo(() => {
    if (!useAnalytical) return [] as string[][]
    const baseAll = filteredIndexedAll.map(x => x.r)
    return (columns || []).map(col => {
      const set = new Set<string>()
      baseAll.forEach((row, i) => {
        const acc = col.accessor
        const v = typeof acc === 'function'
          ? acc(row, i)
          : (typeof acc === 'string' ? deepGet(row, acc) : undefined)
        set.add(toText(v))
      })
      return Array.from(set).sort((a, b) => {
        // Y/N 특별 처리: Y가 N보다 앞에 오도록
        if (a === 'Y' && b === 'N') return -1
        if (a === 'N' && b === 'Y') return 1
        return a.localeCompare(b)
      })
    })
  }, [useAnalytical, filteredIndexedAll, columns, toText])

  // columns/data 모드용 content/스타일 래퍼
  const getCellContent = (r: number, c: number): React.ReactNode | null => {
    if (useAnalytical) {
      if (r < 0 || c < 0 || c >= effectiveCols) return null

      // 헤더 행
      if (headerRow && r === 0) {
        const baseHeader = columns?.[c]?.Header ?? ''
        const active = effectiveColumnFilters[c]
        const hasActive = !!(active && String(active).trim() !== '')
        return (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: hasActive ? 18 : 0 }}>
              <span>{baseHeader}</span>
              {showHeaderFilterValue && (
                <span style={{ fontSize: 12, color: '#6b7280' }}>{hasActive ? `(${active})` : ''}</span>
              )}
            </div>
            {hasActive && (
              <Icon
                name="filter"
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '14px',
                  color: '#2563eb',
                  pointerEvents: 'none'
                }}
              />
            )}
          </>
        )
      }

      // 본문 행 (데이터/서브토탈)
      const bodyIndex = headerRow ? r - 1 : r
      if (bodyIndex < 0 || bodyIndex >= expandedMeta.length) return null
      const meta = expandedMeta[bodyIndex]

      // 서브토탈 행
      if (meta.kind === 'subtotal') {
        const st = subtotalRows[meta.subtotalIndex]
        if (!st) return null
        if (c === 0) return st.label
        const v = st.totals[c]
        return v != null ? v : null
      }

      // 데이터 행
      const dataRowIndex = meta.dataIndex
      if (dataRowIndex == null || dataRowIndex < 0 || dataRowIndex >= dataForRender.length) return null
      const row = dataForRender[dataRowIndex]
      const acc = columns?.[c]?.accessor
      if (typeof acc === 'function') return acc(row, dataRowIndex)
      if (typeof acc === 'string') return toText(deepGet(row, acc))
      return null
    }

    // 모드 A
    return cellContent ? cellContent(r, c) : null
  }

  const getCellStyle = (r: number, c: number): React.CSSProperties => {
    const base = cellStyle(r, c) || {}
    if (useAnalytical && headerRow && r === 0) {
      return {
        fontWeight: 'bold',
        backgroundColor: '#ffff',
        cursor: enableHeaderFilter ? 'pointer' : 'default',
        position: 'relative',
        ...base
      }
    }
    return base
  }

  // ===== 병합 스펙(original) → 화면 병합(dynamic) 변환 =====
  const headerOffset = headerRow ? 1 : 0
  const visibleOriginalIndices = React.useMemo(
    () => (useAnalytical ? filteredIndexed.map(x => x.i) : []),
    [useAnalytical, filteredIndexed]
  )

  const finalMergedList: MergedCell[] = React.useMemo(() => {
    if (!useAnalytical || mergedCells.length === 0) return mergedCells

    if (mergedCellsSpecMode === 'display') {
      return mergedCells
    }

    // k번째 "보이는 데이터 행"이 그리드 몇 번째 행인지 계산
    const dataRowGridIndex: number[] = []
    if (useAnalytical) {
      let dataSeq = 0
      for (let bodyIdx = 0; bodyIdx < expandedMeta.length; bodyIdx++) {
        const meta = expandedMeta[bodyIdx]
        if (meta.kind === 'data') {
          const gridRow = headerOffset + bodyIdx
          dataRowGridIndex[dataSeq] = gridRow
          dataSeq += 1
        }
      }
    }

    const out: MergedCell[] = []
    for (const s of mergedCells) {
      const footerRowForDisplay =
        totalEnabled ? (headerRow ? bodyRowsToRender + 1 : bodyRowsToRender) : null

      if (mergedCellsSpecMode === 'original' && footerRowForDisplay != null && s.row === footerRowForDisplay) {
        out.push({
          row: footerRowForDisplay,
          col: s.col,
          rowSpan: Math.max(1, s.rowSpan ?? 1),
          colSpan: Math.max(1, s.colSpan ?? 1),
        })
        continue
      }

      const col = s.col
      const start = (s.row ?? 0) - headerOffset
      const span = s.rowSpan ?? 1
      const end = start + Math.max(1, span) - 1
      if (start > end) continue

      let i = 0
      while (i < visibleOriginalIndices.length) {
        const oi = visibleOriginalIndices[i]
        if (oi < start || oi > end) {
          i++
          continue
        }
        const visStart = i
        while (
          i + 1 < visibleOriginalIndices.length &&
          visibleOriginalIndices[i + 1] === visibleOriginalIndices[i] + 1 &&
          visibleOriginalIndices[i + 1] >= start &&
          visibleOriginalIndices[i + 1] <= end
        ) {
          i++
        }
        const segLen = i - visStart + 1

        const reqRS = Math.max(1, s.rowSpan ?? 1)
        const reqCS = Math.max(1, s.colSpan ?? 1)
        const canEmit = reqRS === 1 ? segLen >= 1 : segLen > 1

        if (canEmit) {
          const baseGridRow = dataRowGridIndex[visStart]
          if (typeof baseGridRow === 'number') {
            out.push({
              row: reqRS === 1 ? baseGridRow : baseGridRow,
              col,
              rowSpan: reqRS === 1 ? 1 : segLen,
              colSpan: reqCS
            })
          }
        }
        i++
      }
    }
    return out
  }, [
    useAnalytical,
    mergedCells,
    mergedCellsSpecMode,
    headerOffset,
    visibleOriginalIndices,
    bodyRowsToRender,
    headerRow,
    totalEnabled,
    expandedMeta
  ])

  // 병합 맵 구성
  const mergedMap = new Map<string, { rowSpan: number; colSpan: number }>()
  const covered = new Set<string>()
  finalMergedList.forEach(({ row, col, rowSpan = 1, colSpan = 1 }) => {
    mergedMap.set(`${row}-${col}`, { rowSpan, colSpan })
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        if (r === row && c === col) continue
        covered.add(`${r}-${c}`)
      }
    }
  })

  const colWidths = Array.from({ length: effectiveCols }, (_, i) => colSizes[i] || defaultColSize)
  const rowHeights = Array.from({ length: effectiveRows }, (_, i) => rowSizes[i] || defaultRowSize)

  // 내부 px 열폭 상태(리사이즈용)
  const [colPx, setColPx] = React.useState<number[] | null>(null)

  // 신규: 각 컬럼 최소폭(px)
  const [measuredMinPx, setMeasuredMinPx] = React.useState<number[]>([])

  const justify: Record<Align, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }
  const alignIt: Record<VAlign, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

  // 단위→px 변환 유틸
  const resolveMinTablePx = React.useCallback((v?: number | string): number | undefined => {
    if (v == null) return undefined
    if (typeof v === 'number' && Number.isFinite(v)) return v
    const s = String(v).trim()
    const m = /^(\d+(?:\.\d+)?)(px|vw|vh)$/i.exec(s)
    if (!m) return undefined
    const n = parseFloat(m[1])
    const u = m[2].toLowerCase()
    if (u === 'px') return n
    if (typeof window !== 'undefined') {
      if (u === 'vw') return Math.round((window.innerWidth * n) / 100)
      if (u === 'vh') return Math.round((window.innerHeight * n) / 100)
    }
    return undefined
  }, [])

  // 병합 영역의 대표 콘텐츠/스타일 소스 셀 탐색
  const findSource = (
    sr: number,
    sc: number,
    rs: number,
    cs: number
  ): { r: number; c: number } | null => {
    const base = getCellContent(sr, sc)
    if (base != null && base !== '') return { r: sr, c: sc }
    for (let r = sr; r < sr + rs; r++) {
      for (let c = sc; c < sc + cs; c++) {
        const v = getCellContent(r, c)
        if (v != null && v !== '') return { r, c }
      }
    }
    return null
  }

  // 헤더 셀렉트 열림 상태 + 드롭다운 포지션(포털)
  const [openCol, setOpenCol] = React.useState<number | null>(null)
  const [dropdownPos, setDropdownPos] = React.useState<{ left: number; top: number; width: number; font: number; height: number } | null>(null)
  const tableRef = React.useRef<HTMLDivElement | null>(null)
  const dropdownRef = React.useRef<HTMLDivElement | null>(null)

  // 리사이즈 상태 및 클릭 차단 플래그
  const isResizingRef = React.useRef(false)
  const blockHeaderClickThisFrameRef = React.useRef(false)

  // ===== 헤더 DOM 측정: 박스/폰트/아이콘 크기 연동 =====
  type HeaderDim = { w: number; h: number; font: number }
  const headerRefs = React.useRef<Array<HTMLDivElement | null>>([])
  const [headerDims, setHeaderDims] = React.useState<Record<number, HeaderDim>>({})
  const headerDimsRef = React.useRef<Record<number, HeaderDim>>({})

  const shallowEqualDims = React.useCallback((a: Record<number, HeaderDim>, b: Record<number, HeaderDim>) => {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    for (const k of ak) {
      const ka = Number(k)
      const va = a[ka]
      const vb = b[ka]
      if (!vb) return false
      if (va.w !== vb.w || va.h !== vb.h || va.font !== vb.font) return false
    }
    return true
  }, [])

  const measureHeaders = React.useCallback(() => {
    const next: Record<number, HeaderDim> = {}
    headerRefs.current.forEach((el, idx) => {
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const fontPx = Math.round(parseFloat(cs.fontSize) || 14)
      next[idx] = { w: Math.round(rect.width), h: Math.round(rect.height), font: fontPx }
    })
    if (!shallowEqualDims(headerDimsRef.current, next)) {
      headerDimsRef.current = next
      setHeaderDims(next)
    }
  }, [shallowEqualDims])

  React.useLayoutEffect(() => {
    measureHeaders()
  }, [measureHeaders, useAnalytical, headerRow, effectiveCols])

  // ResizeObserver로 열 너비 변화 추적
  const roRef = React.useRef<ResizeObserver | null>(null)
  React.useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    roRef.current = new ResizeObserver(() => measureHeaders())
    const ro = roRef.current
    headerRefs.current.forEach(el => el && ro.observe(el))
    return () => {
      ro.disconnect()
      roRef.current = null
    }
  }, [measureHeaders, effectiveCols])

  // 초기 colPx 세팅 또는 컬럼 수 변동 시 보정
  React.useEffect(() => {
    // 리사이즈 끄면 px 고정 생성 금지 + 남아있던 값 제거
    if (!enableColumnResize) {
      if (colPx !== null) setColPx(null)
      return
    }
    if (colPx == null || colPx.length !== effectiveCols) {
      const measured = Array.from({ length: effectiveCols }, (_, i) => {
        const preset = colSizes[i]
        if (preset && preset.endsWith('px')) return parseInt(preset, 10)
        const dim = headerDims[i]?.w
        return Number.isFinite(dim) ? dim : 120
      })
      setColPx(measured)
    }
  }, [enableColumnResize, effectiveCols, headerDims, colSizes, colPx])

  // 리사이즈 드래그 상태
  const [drag, setDrag] = React.useState<{ col: number; startX: number; startW: number } | null>(null)

  // 4) 리사이즈 onMove 보정
  React.useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.startX
      setColPx(prev => {
        if (!prev) return prev
        const next = [...prev]

        // 제안 폭
        const proposed = Math.max(50, Math.round(drag.startW + dx))

        // 테이블 최소 폭(px) 계산
        const tableMinPx = enableColumnResize ? resolveMinTablePx(minTableWidth) : undefined

        let minForCol = 50
        if (typeof tableMinPx === 'number') {
          const sumOthers = prev.reduce((acc, w, i) => (i === drag.col ? acc : acc + Math.round(w || 0)), 0)
          const requiredForTotal = tableMinPx - sumOthers
          if (requiredForTotal > minForCol) minForCol = requiredForTotal
        }

        // 최소폭(프롭스/자동측정) 강제
        const hardMin = Math.max(minForCol, minPxForCol[drag.col] ?? 0)

        next[drag.col] = Math.max(hardMin, proposed)
        return next
      })
    }
    const onUp = () => {
      setDrag(null)
      isResizingRef.current = false
      blockHeaderClickThisFrameRef.current = true
      requestAnimationFrame(() => { blockHeaderClickThisFrameRef.current = false })
    }

    isResizingRef.current = true
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp, { once: true })

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [drag, enableColumnResize, minTableWidth, resolveMinTablePx])

  // ====== 최소폭 계산(프롭스 + 자동측정) ======
  const minFromPropsPx = React.useMemo(() => {
    const arr: number[] = Array.from({ length: effectiveCols }, (_, i) => {
      const raw = colSizes[i]
      const px = toPxOrNull(raw)
      return px == null ? 0 : px
    })
    return arr
  }, [effectiveCols, colSizes])

  const paddingPx = Number.isFinite(autoFitContent?.paddingPx as number)
    ? (autoFitContent?.paddingPx as number)
    : 16
  const includeHeaderForAuto = autoFitContent?.includeHeader !== false

  // === 자동측정: 텍스트 기반 최소폭 계산 (헤더+데이터 텍스트 기준) ===
  const measureAndApply = React.useCallback(() => {
    if (!autoFitContent?.enabled) return

    const next: number[] = Array.from({ length: effectiveCols }, () => 0)

    // 1) 헤더 텍스트 폭
    if (useAnalytical && columns && includeHeaderForAuto) {
      columns.forEach((col, c) => {
        if (c >= effectiveCols) return
        const headerNode = col.Header
        const headerText = typeof headerNode === 'string' ? headerNode : ''
        if (!headerText) return

        const fontSize = headerDims[c]?.font ?? 14
        const font = `${fontSize}px Arial`

        const w = measureTextWidth(headerText, font) + paddingPx
        if (w > next[c]) next[c] = w
      })
    }

    // 2) 데이터 텍스트 폭
    if (useAnalytical && columns) {
      dataForRender.forEach((rowObj, rowIndex) => {
        columns.forEach((col, c) => {
          if (c >= effectiveCols) return
          const acc = col.accessor
          let raw: unknown
          if (typeof acc === 'function') {
            raw = acc(rowObj, rowIndex)
          } else {
            raw = deepGet(rowObj, acc)
          }
          const text = toText(raw)
          if (!text) return

          const fontSize = headerDims[c]?.font ?? 14
          const font = `${fontSize}px Arial`

          const w = measureTextWidth(text, font) + paddingPx
          if (w > next[c]) next[c] = w
        })
      })
    } else if (!useAnalytical && typeof cellContent === 'function' && rows && cols) {
      const defaultFont = '14px Arial'
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = cellContent(r, c)
          const text =
            typeof v === 'string' || typeof v === 'number'
              ? String(v)
              : ''
          if (!text) continue

          const w = measureTextWidth(text, defaultFont) + paddingPx
          if (w > next[c]) next[c] = w
        }
      }
    }

    setMeasuredMinPx(next)
  }, [
    autoFitContent?.enabled,
    effectiveCols,
    includeHeaderForAuto,
    paddingPx,
    useAnalytical,
    columns,
    dataForRender,
    toText,
    cellContent,
    rows,
    cols,
    headerDims
  ])

  // ====== 데이터/레이아웃 변경 시 측정 ======
  React.useLayoutEffect(() => {
    if (!autoFitContent?.enabled) return
    let id1 = 0
    let id2 = 0
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => measureAndApply())
    })
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
    }
  }, [measureAndApply, dataForRender, rows, cols, headerRow, splitHeaderBody, autoFitContent?.enabled])

  // ====== 윈도 리사이즈 시 재측정 ======
  React.useEffect(() => {
    if (!autoFitContent?.enabled) return
    const onResize = () => measureAndApply()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [autoFitContent?.enabled, measureAndApply])

  // ====== MutationObserver + RAF 스로틀 ======
  const rafIdRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    if (!autoFitContent?.enabled) return
    if (!tableRef.current) return
    const target = tableRef.current
    const mo = new MutationObserver(() => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(() => {
        measureAndApply()
        rafIdRef.current = null
      })
    })
    mo.observe(target, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [autoFitContent?.enabled, measureAndApply])

  // 최종 최소폭(px)
  const minPxForCol = React.useMemo(() => {
    const len = effectiveCols
    const out = Array.from({ length: len }, (_, i) => {
      const a = minFromPropsPx[i] ?? 0
      const b = measuredMinPx[i] ?? 0
      return Math.max(50, a, b)
    })
    return out
  }, [effectiveCols, minFromPropsPx, measuredMinPx])

  // grid 열 템플릿: 리사이즈 값 우선
  const gridColsTemplate = React.useMemo(() => {
    if (enableColumnResize && colPx && colPx.length === effectiveCols) {
      return colPx.map((w, i) => `${Math.max(minPxForCol[i] ?? 50, Math.round(w))}px`).join(' ')
    }

    if (useColSizesAsMin) {
      return Array.from({ length: effectiveCols }, (_, i) => `minmax(${minPxForCol[i]}px, 1fr)`).join(' ')
    }

    return colWidths.join(' ')
  }, [enableColumnResize, colPx, effectiveCols, colWidths, useColSizesAsMin, minPxForCol])

  // ✅ 단일 그리드에서도 합계 행 높이에 totalRowSize 적용
  if (!splitHeaderBody && totalEnabled && totalRowSize) {
    const footerIdx = effectiveRows - 1
    rowHeights[footerIdx] = totalRowSize
  }

  const gridRowsTemplate = rowHeights.join(' ')

  // 드롭다운 포지션 계산
  const updateDropdownPos = React.useCallback(
    (colIndex: number) => {
      const el = headerRefs.current[colIndex]
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fontSize = headerDims[colIndex]?.font ?? 14
      const font = `${fontSize}px Arial`

      const options = distinctValuesByCol[colIndex] || []
      let maxTextW = 0
      options.forEach(opt => {
        const w = measureTextWidth(opt, font)
        if (w > maxTextW) maxTextW = w
      })

      const width = Math.max(Math.ceil(maxTextW) + 60)

      setDropdownPos({
        left: Math.round(rect.left),
        top: Math.round(rect.bottom),
        width,
        font: fontSize,
        height: headerDims[colIndex]?.h ?? Math.round(rect.height)
      })
    },
    [headerDims, distinctValuesByCol]
  )

  // 외부 클릭 닫기
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      const insideDropdown = !!(dropdownRef.current && dropdownRef.current.contains(t))
      const insideTable = !!(tableRef.current && tableRef.current.contains(t))
      if (insideDropdown || insideTable) return
      setOpenCol(null)
      setDropdownPos(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // 스크롤/리사이즈 시 포지션 갱신
  React.useEffect(() => {
    if (openCol == null) return
    const onScrollOrResize = () => updateDropdownPos(openCol)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [openCol, updateDropdownPos])

  // ESC로 닫기
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenCol(null)
        setDropdownPos(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ===== 스크롤바 폭 계산 =====
  const [scrollbarWidth, setScrollbarWidth] = React.useState(0)
  React.useEffect(() => {
    const scrollDiv = document.createElement('div')
    scrollDiv.style.width = '100px'
    scrollDiv.style.height = '100px'
    scrollDiv.style.overflow = 'scroll'
    scrollDiv.style.position = 'absolute'
    scrollDiv.style.top = '-9999px'
    document.body.appendChild(scrollDiv)
    const width = scrollDiv.offsetWidth - scrollDiv.clientWidth
    document.body.removeChild(scrollDiv)
    setScrollbarWidth(width)
  }, [])

  // 헤더/본문 행 높이 분리
  const headerRowHeight = headerRow ? rowSizes[0] || defaultRowSize : undefined
  const bodyRowHeights = headerRow ? rowHeights.slice(1) : rowHeights

  // 헤더/푸터 그리드 템플릿(더미 열 추가)
  const headerColsTemplate = React.useMemo(() => {
    if (!splitHeaderBody) return gridColsTemplate
    const extra = Math.max(0, scrollbarWidth)
    return `${gridColsTemplate} ${extra}px`
  }, [splitHeaderBody, gridColsTemplate, scrollbarWidth])
  const footerColsTemplate = headerColsTemplate

  // 공통 셀 정렬 계산(열별 우선)
  const effAlignFor = (c: number): Align =>
    (columnAlign?.[c] ?? columns?.[c]?.align ?? horizontalAlign)
  const effVAlignFor = (c: number): VAlign =>
    (columnVAlign?.[c] ?? columns?.[c]?.vAlign ?? verticalAlign)

  // 공통 보더 스타일
  const makeBorder = (r: number): React.CSSProperties => ({
    borderTop:
      (!splitHeaderBody && totalEnabled && r === effectiveRows - 1)
        ? '1px solid #888'
        : 'none',
    borderLeft: 'none',
    borderRight: '1px solid #ccc',
    borderBottom:
      r === 0
        ? '1px solid #888'
        : r === effectiveRows - 1
          ? hasVerticalOverflow
            ? 'none'
            : '1px solid #888'
          : '1px solid #ccc'
  })

  // ===== 호버 상태 =====
  const [hovered, setHovered] = React.useState<{ row: number; col: number } | null>(null)

  if (splitHeaderBody) {
    const headerColsCount = effectiveCols + 1 /* 더미열 */
    const bodyRowsCount = bodyRowsToRender
    const footerGlobalRow = headerRow ? bodyRowsToRender + 1 : bodyRowsToRender
    const footerRowHeight = totalRowSize ?? rowSizes[footerGlobalRow] ?? defaultRowSize

    return (
      <div
        className={rootClassName}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowX: 'hidden', overflowY: 'hidden' }}
      >
        <div
          ref={tableRef}
          style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}
        >
          {/* 헤더 그리드 */}
          <div
            style={{
              display: 'grid',
              width: '100%',
              gridTemplateColumns: headerColsTemplate,
              gridTemplateRows: headerRowHeight ?? 'auto',
              gap: 0
            }}
          >
            {Array.from({ length: headerColsCount }).map((_, c) => {
              const isDummy = c === effectiveCols
              const key = `header-0-${c}`
              if (!isDummy) {
                const covKey = `0-${c}`
                if (covered.has(covKey)) return null
              }
              const mi = !isDummy ? mergedMap.get(`0-${c}`) : undefined
              const src = mi ? findSource(0, c, mi.rowSpan, mi.colSpan) : null
              const rawContent = isDummy ? null : src ? getCellContent(src.r, src.c) : getCellContent(0, c)
              const content = rawContent == null ? null : (
                <div
                  data-ct-content
                  style={{ display: 'inline-block', whiteSpace: 'nowrap', maxWidth: 'max-content' }}
                >
                  {rawContent}
                </div>
              )
              const styleSrc = isDummy
                ? getCellStyle(0, effectiveCols)
                : src
                  ? getCellStyle(src.r, src.c)
                  : getCellStyle(0, c)

              const effHAlign = effAlignFor(c)
              const effVAlign = effVAlignFor(c)
              const alignment: React.CSSProperties = {
                justifyContent: justify[effHAlign],
                alignItems: alignIt[effVAlign]
              }
              if (mi && !isDummy) {
                alignment.gridColumn = `span ${mi.colSpan}`
                alignment.gridRow = `span ${mi.rowSpan}`
              }

              const headerFilterEnabled = enableHeaderFilter && !isDummy
              const showSelect = headerFilterEnabled && openCol === c
              const currentVal = effectiveColumnFilters[c] ?? ''

              return (
                <div
                  key={key}
                  ref={el => {
                    if (!isDummy) headerRefs.current[c] = el
                  }}
                  data-ct-cell
                  data-col={isDummy ? undefined : c}
                  data-section="header"
                  style={{
                    display: 'flex',
                    padding: '4px',
                    ...(effHAlign === 'left' ? { paddingLeft: '12px' } : {}),
                    ...(effHAlign === 'right' ? { paddingRight: '12px' } : {}),
                    textAlign: 'center',
                    backgroundColor: '#ffff',
                    boxSizing: 'border-box',
                    position: 'relative',
                    ...makeBorder(0),
                    ...alignment,
                    ...styleSrc,
                  }}
                  onClick={() => {
                    if (headerFilterEnabled) {
                      if (blockHeaderClickThisFrameRef.current) return
                      setOpenCol(prev => {
                        const next = prev === c ? null : c
                        if (next != null) updateDropdownPos(next)
                        else setDropdownPos(null)
                        return next
                      })
                      return
                    }
                  }}
                >
                  {content}

                  {/* 리사이저: 더미열 제외 */}
                  {!isDummy && enableColumnResize && (
                    <div
                      onMouseDown={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        isResizingRef.current = true
                        const startW =
                          (colPx && colPx[c]) ??
                          headerDims[c]?.w ??
                          (typeof colWidths[c] === 'string' && colWidths[c].endsWith('px')
                            ? parseInt(colWidths[c], 10)
                            : 120)
                        setDrag({ col: c, startX: e.clientX, startW })
                      }}
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: 6,
                        height: '100%',
                        cursor: 'col-resize',
                        zIndex: 1001
                      }}
                    />
                  )}

                  {/* 드롭다운 */}
                  {!isDummy &&
                    showSelect &&
                    dropdownPos &&
                    openCol === c &&
                    createPortal(
                      <div
                        ref={dropdownRef}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'fixed',
                          left: `${dropdownPos.left}px`,
                          top: `${dropdownPos.top}px`,
                          width: `${dropdownPos.width + 20}px`,
                          zIndex: 2000,
                          padding: '4px 15px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          backgroundColor: '#fff',
                          border: '1px solid #ccc',
                          borderRadius: '4px'
                        }}
                      >
                        <Icon
                          name="filter"
                          style={{ fontSize: '14px', color: '#2563eb', flex: '0 0 auto' }}
                        />
                        <CustomSelect
                          options={['', ...((distinctValuesByCol[c] || []).filter(v => v !== ''))]}
                          value={currentVal}
                          onChange={v => {
                            setUiColumnFilters(prev => ({
                              ...prev,
                              [c]: v || undefined
                            }))
                            setOpenCol(null)
                            setDropdownPos(null)
                          }}
                          placeholder="(전체)"
                          boxWidth={`${dropdownPos.width}px`}
                          boxHeight={`${Math.max(24, Math.round(dropdownPos.height * 0.8))}px`}
                          innerFont={`${Math.max(10, dropdownPos.font)}px`}
                          selectFontSize={`${Math.max(10, dropdownPos.font)}px`}
                          iconSize={`${Math.max(8, Math.round(dropdownPos.font * 0.9))}px`}
                        />
                      </div>,
                      document.body
                    )}
                </div>
              )
            })}
          </div>

          {/* 본문 스크롤 영역 */}
          <div
            className={scrollClassName}
            style={{
              overflowY: 'auto',
              overflowX: 'hidden',
              flex: '1 1 0%',
              width: '100%',
              borderBottom: '1px solid #888'
            }}
          >
            <div
              style={{
                display: 'grid',
                width: '100%',
                gridTemplateColumns: gridColsTemplate,
                gridTemplateRows: bodyRowHeights.join(' '),
                gap: 0
              }}
            >
              {Array.from({ length: bodyRowsCount }).map((_, br) =>
                Array.from({ length: effectiveCols }).map((_, c) => {
                  const globalRow = headerRow ? br + 1 : br
                  const key = `body-${globalRow}-${c}`
                  const covKey = `${globalRow}-${c}`
                  if (covered.has(covKey)) return null

                  const mi = mergedMap.get(covKey)
                  const src = mi ? findSource(globalRow, c, mi.rowSpan, mi.colSpan) : null
                  const rawContent = src ? getCellContent(src.r, src.c) : getCellContent(globalRow, c)
                  const content = rawContent == null ? null : (
                    <div
                      data-ct-content
                      style={{ display: 'inline-block', whiteSpace: 'nowrap', maxWidth: 'max-content' }}
                    >
                      {rawContent}
                    </div>
                  )
                  const styleSrc = src ? getCellStyle(src.r, src.c) : getCellStyle(globalRow, c)

                  const effHAlign = effAlignFor(c)
                  const effVAlign = effVAlignFor(c)
                  const alignment: React.CSSProperties = {
                    justifyContent: justify[effHAlign],
                    alignItems: alignIt[effVAlign]
                  }
                  if (mi) {
                    alignment.gridColumn = `span ${mi.colSpan}`
                    alignment.gridRow = `span ${mi.rowSpan}`
                  }
                  // ★ 추가: 이 셀이 속한 row 가 subtotal 인지 여부
                  let isSubtotalRow = false
                  if (useAnalytical) {
                    const bodyIndex = headerRow ? globalRow - 1 : globalRow
                    const meta = expandedMeta[bodyIndex]
                    if (meta && meta.kind === 'subtotal') {
                      isSubtotalRow = true
                    }
                  }

                  // ★ subtotal 라벨 병합(span) 적용
                  if (isSubtotalRow && subtotalLabelSpan > 1 && !mi) {
                    const span = Math.min(subtotalLabelSpan, effectiveCols)
                    if (c === 0) {
                      alignment.gridColumn = `span ${span}`
                    } else if (c < span) {
                      return null
                    }
                  }

                  const isHovered =
                    enableHover &&
                    ((hoverMode === 'cell' && hovered?.row === globalRow && hovered?.col === c) ||
                      (hoverMode === 'row' && hovered?.row === globalRow))

                  return (
                    <div
                      key={key}
                      data-ct-cell
                      data-col={c}
                      data-section="body"
                      data-row-kind={isSubtotalRow ? 'subtotal' : undefined}   // ★ 추가
                      style={{
                        display: 'flex',
                        padding: '4px',
                        ...(effHAlign === 'left' ? { paddingLeft: '12px' } : {}),
                        ...(effHAlign === 'right' ? { paddingRight: '12px' } : {}),
                        textAlign: 'center',
                        backgroundColor: '#ffff',
                        boxSizing: 'border-box',
                        position: 'relative',
                        cursor: enableHover ? 'pointer' : 'default',
                        ...makeBorder(globalRow),
                        ...alignment,
                        ...(isHovered ? hoverCellStyle : {}),
                        ...styleSrc,
                      }}
                      onMouseEnter={() => {
                        if (enableHover) setHovered({ row: globalRow, col: c })
                      }}
                      onMouseLeave={() => {
                        if (enableHover) setHovered(null)
                      }}
                      onClick={() => {
                        onCellClick?.(globalRow, c)
                        if (useAnalytical) {
                          const bodyIndex = headerRow ? globalRow - 1 : globalRow
                          const meta = expandedMeta[bodyIndex]

                          // 서브토탈 행: 데이터 인덱스 없음
                          if (!meta || meta.kind === 'subtotal') {
                            onCellClickDetailed?.({
                              gridRow: globalRow,
                              col: c,
                              dataIndexFiltered: undefined,
                              dataIndexOriginal: undefined,
                              row: undefined
                            })
                            return
                          }

                          // 데이터 행
                          const filteredIdx = meta.dataIndex
                          const origIdx = filteredIdx >= 0 ? filteredIndexed[filteredIdx]?.i : undefined
                          const rowObj = filteredIdx >= 0 ? dataForRender[filteredIdx] : undefined
                          onCellClickDetailed?.({
                            gridRow: globalRow,
                            col: c,
                            dataIndexFiltered: filteredIdx,
                            dataIndexOriginal: origIdx,
                            row: rowObj
                          })
                        } else {
                          onCellClickDetailed?.({ gridRow: globalRow, col: c })
                        }
                      }}
                    >
                      {content}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 합계 푸터 (스크롤 밖, 항상 보임) */}
          {totalEnabled && (
            <div
              style={{
                display: 'grid',
                width: '100%',
                gridTemplateColumns: footerColsTemplate,
                gridTemplateRows: footerRowHeight,
                gap: 0
              }}
            >
              {Array.from({ length: headerColsCount }).map((_, c) => {
                const isDummy = c === effectiveCols
                const globalRow = footerGlobalRow
                const key = `footer-${globalRow}-${c}`
                if (isDummy) {
                  const dummyStyle = getCellStyle(globalRow, effectiveCols)
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        padding: '4px',
                        backgroundColor: '#fff',
                        boxSizing: 'border-box',
                        borderTop: '1px solid #888',
                        borderLeft: 'none',
                        borderRight: '1px solid #ccc',
                        borderBottom: '1px solid #888',
                        ...dummyStyle
                      }}
                    />
                  )
                }

                // 병합 적용
                const covKey = `${globalRow}-${c}`
                if (covered.has(covKey)) return null
                const mi = mergedMap.get(covKey)

                const effHAlign = effAlignFor(c)
                const effVAlign = effVAlignFor(c)
                const alignment: React.CSSProperties = {
                  justifyContent: justify[effHAlign],
                  alignItems: alignIt[effVAlign]
                }
                if (mi) {
                  const maxSpan = Math.min(mi.colSpan, Math.max(1, effectiveCols - c))
                  alignment.gridColumn = `span ${maxSpan}`
                  alignment.gridRow = `span ${mi.rowSpan}`
                }

                const rawContent =
                  c === 0 ? totalLabel : (totalsByCol[c] != null ? totalsByCol[c] : '')
                const content = rawContent == null ? null : (
                  <div
                    data-ct-content
                    style={{ display: 'inline-block', whiteSpace: 'nowrap', maxWidth: 'max-content' }}
                  >
                    {rawContent}
                  </div>
                )
                const styleSrc = getCellStyle(globalRow, c)

                return (
                  <div
                    key={key}
                    data-section="footer"
                    style={{
                      display: 'flex',
                      padding: '4px',
                      ...(effHAlign === 'left' ? { paddingLeft: '12px' } : {}),
                      ...(effHAlign === 'right' ? { paddingRight: '12px' } : {}),
                      textAlign: 'center',
                      backgroundColor: '#ffff',
                      boxSizing: 'border-box',
                      position: 'relative',
                      borderTop: '1px solid #888',
                      borderLeft: 'none',
                      borderRight: '1px solid #ccc',
                      borderBottom: '1px solid #888',
                      ...alignment,
                      ...styleSrc
                    }}
                    onClick={() => {
                      onCellClick?.(globalRow, c)
                      onCellClickDetailed?.({
                        gridRow: globalRow,
                        col: c,
                        dataIndexFiltered: undefined,
                        dataIndexOriginal: undefined,
                        row: undefined
                      })
                    }}
                  >
                    {content}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== 기존 단일 그리드 렌더 (오버플로우 비활성) =====
  return (
    <div
      className={rootClassName}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflowX: 'hidden', overflowY: 'hidden' }}
    >
      <div
        ref={tableRef}
        style={{
          display: 'grid',
          width: '100%',
          height: '100%',
          gridTemplateColumns: gridColsTemplate,
          gridTemplateRows: gridRowsTemplate,
          gap: 0
        }}
      >
        {Array.from({ length: effectiveRows }).flatMap((_, r) =>
          Array.from({ length: effectiveCols }).map((_, c) => {
            const key = `${r}-${c}`
            if (covered.has(key)) return null

            const isHeaderCell = useAnalytical && headerRow && r === 0
            const isTotalRow = useAnalytical && totalEnabled && r === effectiveRows - 1

            const mi = mergedMap.get(key)
            const src = mi ? findSource(r, c, mi.rowSpan, mi.colSpan) : null

            const rawContent = isTotalRow
              ? (c === 0 ? totalLabel : (totalsByCol[c] != null ? totalsByCol[c] : ''))
              : (src ? getCellContent(src.r, src.c) : getCellContent(r, c))
            const content = rawContent == null ? null : (
              <div
                data-ct-content
                style={{ display: 'inline-block', whiteSpace: 'nowrap', maxWidth: 'max-content' }}
              >
                {rawContent}
              </div>
            )

            const styleSrc = isTotalRow
              ? getCellStyle(r, c)
              : (src ? getCellStyle(src.r, src.c) : getCellStyle(r, c))

            const effHAlign = effAlignFor(c)
            const effVAlign = effVAlignFor(c)
            const alignment: React.CSSProperties = {
              justifyContent: justify[effHAlign],
              alignItems: alignIt[effVAlign]
            }
            if (mi) {
              alignment.gridColumn = `span ${mi.colSpan}`
              alignment.gridRow = `span ${mi.rowSpan}`
            }

            const border: React.CSSProperties = {
              borderTop:
                (!splitHeaderBody && totalEnabled && r === effectiveRows - 1)
                  ? '1px solid #888'
                  : (r === 0 ? '1px solid #888' : '1px solid #ccc'),
              borderLeft: 'none',
              borderRight: '1px solid #ccc',
              borderBottom:
                r === effectiveRows - 1
                  ? '1px solid #888'
                  : '1px solid #ccc'
            }

            const headerFilterEnabled = enableHeaderResizeGuard(enableHeaderFilter, isHeaderCell)
            const showSelect = headerFilterEnabled && openCol === c
            const currentVal = effectiveColumnFilters[c] ?? ''

            const isBodyCell = !isHeaderCell && !isTotalRow
            // ★ 추가: 단일 그리드 모드에서도 subtotal 행 여부 판단
            let isSubtotalRow = false
            if (useAnalytical && isBodyCell) {
              const bodyIndex = headerRow ? r - 1 : r
              const meta = expandedMeta[bodyIndex]
              if (meta && meta.kind === 'subtotal') {
                isSubtotalRow = true
              }
            }

            // ★ subtotal 라벨 병합(span) 적용
            if (isSubtotalRow && subtotalLabelSpan > 1 && !mi) {
              const span = Math.min(subtotalLabelSpan, effectiveCols)
              if (c === 0) {
                alignment.gridColumn = `span ${span}`
              } else if (c < span) {
                return null
              }
            }
            const isHovered =
              enableHover &&
              isBodyCell &&
              ((hoverMode === 'cell' && hovered?.row === r && hovered?.col === c) ||
                (hoverMode === 'row' && hovered?.row === r))

            return (
              <div
                key={key}
                ref={el => {
                  if (isHeaderCell) headerRefs.current[c] = el
                }}
                data-ct-cell={isHeaderCell || isBodyCell ? true : undefined}
                data-col={isHeaderCell || isBodyCell ? c : undefined}
                data-section={isHeaderCell ? 'header' : (isTotalRow ? 'footer' : 'body')}
                data-row-kind={isSubtotalRow ? 'subtotal' : undefined}   // ★ 추가
                style={{
                  display: 'flex',
                  padding: '4px',
                  ...(effHAlign === 'left' ? { paddingLeft: '12px' } : {}),
                  ...(effHAlign === 'right' ? { paddingRight: '12px' } : {}),
                  textAlign: 'center',
                  backgroundColor: '#ffff',
                  boxSizing: 'border-box',
                  position: 'relative',
                  cursor: enableHover && isBodyCell ? 'pointer' : undefined,
                  ...border,
                  ...alignment,
                  ...(isHovered ? hoverCellStyle : {}),
                  ...styleSrc,
                }}
                onMouseEnter={() => {
                  if (enableHover && isBodyCell) setHovered({ row: r, col: c })
                }}
                onMouseLeave={() => {
                  if (enableHover && isBodyCell) setHovered(null)
                }}
                onClick={() => {
                  if (headerFilterEnabled) {
                    if (blockHeaderClickThisFrameRef.current) return
                    setOpenCol(prev => {
                      const next = prev === c ? null : c
                      if (next != null) updateDropdownPos(next)
                      else setDropdownPos(null)
                      return next
                    })
                    return
                  }

                  onCellClick?.(r, c)

                  if (useAnalytical && !(headerRow && r === 0)) {
                    // 토탈 행은 데이터 인덱스 없음
                    if (isTotalRow) {
                      onCellClickDetailed?.({
                        gridRow: r,
                        col: c,
                        dataIndexFiltered: undefined,
                        dataIndexOriginal: undefined,
                        row: undefined
                      })
                      return
                    }

                    const bodyIndex = headerRow ? r - 1 : r
                    const meta = expandedMeta[bodyIndex]

                    // 서브토탈 행
                    if (!meta || meta.kind === 'subtotal') {
                      onCellClickDetailed?.({
                        gridRow: r,
                        col: c,
                        dataIndexFiltered: undefined,
                        dataIndexOriginal: undefined,
                        row: undefined
                      })
                      return
                    }

                    // 데이터 행
                    const filteredIdx = meta.dataIndex
                    const origIdx = filteredIdx >= 0 ? filteredIndexed[filteredIdx]?.i : undefined
                    const rowObj = filteredIdx >= 0 ? dataForRender[filteredIdx] : undefined
                    onCellClickDetailed?.({
                      gridRow: r,
                      col: c,
                      dataIndexFiltered: filteredIdx,
                      dataIndexOriginal: origIdx,
                      row: rowObj
                    })
                  } else {
                    onCellClickDetailed?.({ gridRow: r, col: c })
                  }
                }}
              >
                {content}

                {/* 리사이저 핸들 */}
                {isHeaderCell && c < effectiveCols && enableColumnResize && (
                  <div
                    onMouseDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      isResizingRef.current = true
                      const startW =
                        (colPx && colPx[c]) ??
                        headerDims[c]?.w ??
                        (typeof colWidths[c] === 'string' && colWidths[c].endsWith('px')
                          ? parseInt(colWidths[c], 10)
                          : 120)
                      setDrag({ col: c, startX: e.clientX, startW })
                    }}
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: 6,
                      height: '100%',
                      cursor: 'col-resize',
                      zIndex: 1001
                    }}
                  />
                )}

                {/* 드롭다운 */}
                {showSelect &&
                  dropdownPos &&
                  openCol === c &&
                  createPortal(
                    <div
                      ref={dropdownRef}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'fixed',
                        left: `${dropdownPos.left}px`,
                        top: `${dropdownPos.top}px`,
                        width: `${dropdownPos.width + 20}px`,
                        zIndex: 2000,
                        padding: '4px 15px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        backgroundColor: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                      }}
                    >
                      <Icon
                        name="filter"
                        style={{ fontSize: '14px', color: '#2563eb', flex: '0 0 auto' }}
                      />
                      <CustomSelect
                        options={['', ...((distinctValuesByCol[c] || []).filter(v => v !== ''))]}
                        value={currentVal}
                        onChange={v => {
                          setUiColumnFilters(prev => ({
                            ...prev,
                            [c]: v || undefined
                          }))
                          setOpenCol(null)
                          setDropdownPos(null)
                        }}
                        placeholder="(전체)"
                        boxWidth={`${dropdownPos.width}px`}
                        boxHeight={`${Math.max(24, Math.round(dropdownPos.height * 0.8))}px`}
                        innerFont={`${Math.max(10, dropdownPos.font)}px`}
                        selectFontSize={`${Math.max(10, dropdownPos.font)}px`}
                        iconSize={`${Math.max(8, Math.round(dropdownPos.font * 0.9))}px`}
                      />
                    </div>,
                    document.body
                  )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function enableHeaderResizeGuard(enableHeaderFilter: boolean | undefined, isHeaderCell: boolean): boolean {
  return Boolean(enableHeaderFilter && isHeaderCell)
}

export default CustomTable
