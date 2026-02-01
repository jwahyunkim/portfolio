// src/pages/Defect_Management_BONDING_POPUP.tsx

import '../MyApp.css'
import './Defect_Management_Bonding_POPUP.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@ui5/webcomponents-react'
import CustomSelect from '../../components/CustomSelect'

import CustomInput from '../../components/CustomInput'
import CustomDatePicker from '../../components/CustomDatePicker'
import FormRow from '../../components/FormRow'

import {
  fetchDistributeDefects,
  type DefectDistributeRequest,
  type DefectDistributeResult,
  fetchFgaWorkCenters,
  fetchLines,
  fetchMaterials,
  fetchPlants,
  fetchStyles,
  fetchSizes,
  fetchMaterialResolve,

  type MaterialOption,
  type StyleItem,
  type SizeItem,
} from '../../data/api/index'

export type Side = 'L' | 'R' | ''

export interface BONDING_PopupProps {
  isOpen: boolean
  onClose: () => void
  onCloseWithSelection?: (v: { plant: string; workCenter: string; defectDate: string }) => void
  initialData?: { side?: Side }
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function getTodayYYYYMMDD() {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}


export default function Defect_Management_BONDING_POPUP({
  isOpen,
  onClose,
  onCloseWithSelection,
}: BONDING_PopupProps) {
  // 인풋
  const [qty, setQty] = useState<string>('')

  // 날짜/셀렉트 상태
  const [defectDate, setDefectDate] = useState(() => getTodayYYYYMMDD())

  // ===== 집계 API 연동 상태 =====
  const [plant, setPlant] = useState<string>('')
  const [workCenter, setWorkCenter] = useState<string>('')
  const [line, setLine] = useState<string>('')

  // material 은 style+size resolve 결과로만 세팅
  const [material, setMaterial] = useState<string>('')

  // Style / Size 선택 상태
  const [styleCd, setStyleCd] = useState<string>('')
  const [sizeCd, setSizeCd] = useState<string>('')

  // 옵션 상태 (새 API 사용)
  const [plants, setPlants] = useState<Record<string, string>>({}) // code → name
  const [workCenters, setWorkCenters] = useState<Record<string, string>>({}) // code → name
  const [linesOptions, setLinesOptions] = useState<string[]>([])
  const [materialsData, setMaterialsData] = useState<MaterialOption[]>([]) // 기존 remain>0 material 목록 (참고용)

  const [stylesData, setStylesData] = useState<StyleItem[]>([])
  const [sizesData, setSizesData] = useState<SizeItem[]>([])

  const [loading2, setLoading2] = useState<boolean>(false)
  const [errorMsg2, setErrorMsg2] = useState<string>('')

  // 중복 호출 방지용 AbortController (옵션 로딩용)
  const abortRef = useRef<AbortController | null>(null)

  // 옵션 로드
  const loadAgg = async () => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading2(true)
    setErrorMsg2('')

    try {
      // 0) Plant 옵션
      const plantResp = await fetchPlants()
      const plantMap: Record<string, string> = Object.fromEntries(
        plantResp.data.map((p: { plant_cd: string; plant_nm: string }) => [
          p.plant_cd,
          p.plant_nm,
        ]),
      )
      setPlants(plantMap)

      const plantCodes = Object.keys(plantMap)
      if (plant && !plantCodes.includes(plant)) {
        setPlant('')
      }

      // 1) Work Center 옵션
      let wcMap: Record<string, string> = {}
      if (plant) {
        const workCenterResp = await fetchFgaWorkCenters({
          plant,
        })
        wcMap = Object.fromEntries(
          workCenterResp.data.map((wc: { code: string; name: string }) => [
            wc.code,
            wc.name,
          ]),
        )
      }
      setWorkCenters(wcMap)

      const wcCodes = Object.keys(wcMap)
      if (workCenter && !wcCodes.includes(workCenter)) {
        setWorkCenter('')
      }

      // 2) Line 옵션 (Work Center 선택 시에만)
      let lineCodes: string[] = []
      if (plant && workCenter) {
        const linesResp = await fetchLines({
          plant,
          work_center: workCenter,
          // material_code 연쇄 필터는 현재 사용하지 않음
        })
        lineCodes = linesResp.data.map((l) => l.line_cd)
      }
      setLinesOptions(lineCodes)
      if (line && !lineCodes.includes(line)) {
        setLine('')
      }

      // 3) Material 옵션 (remain > 0, Work Center + Line 선택 시에만) - 기존 로직 유지용
      let materialList: MaterialOption[] = []
      if (plant && workCenter && line) {
        const materialsResp = await fetchMaterials({
          plant,
          work_center: workCenter,
          line,
        })
        materialList = materialsResp.data
      }
      setMaterialsData(materialList)

      const materialCodes = materialList.map((m) => m.material_code)
      if (material && !materialCodes.includes(material)) {
        setMaterial('')
      }

      // 4) Style 옵션 (remain > 0, 중복 제거)
      let styles: StyleItem[] = []
      if (plant && workCenter && line) {
        const stylesResp = await fetchStyles({
          plant,
          work_center: workCenter,
          line,
        })
        styles = stylesResp.data
      }
      setStylesData(styles)

      const styleCodes = styles.map((s) => s.style_cd)
      if (styleCd && !styleCodes.includes(styleCd)) {
        setStyleCd('')
        setSizeCd('')
        setMaterial('')
      }

      // 5) Size 옵션 (선택된 스타일 기준, remain > 0, 중복 제거)
      let sizes: SizeItem[] = []
      if (plant && workCenter && line && styleCd) {
        const sizesResp = await fetchSizes({
          plant,
          work_center: workCenter,
          line,
          style_cd: styleCd,
        })
        sizes = sizesResp.data
      }
      setSizesData(sizes)

      const sizeCodes = sizes.map((s) => s.size_cd)
      if (sizeCd && !sizeCodes.includes(sizeCd)) {
        setSizeCd('')
        setMaterial('')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request failed'
      setErrorMsg2(msg)
    } finally {
      setLoading2(false)
    }
  }

  // 팝업 열고 닫을 때 초기화
  const resetForm = () => {
    setQty('')
    setDefectDate(getTodayYYYYMMDD())
    setPlant('')
    setWorkCenter('')
    setLine('')
    setMaterial('')
    setStyleCd('')
    setSizeCd('')
    setErrorMsg2('')
    setLoading2(false)
    setPlants({})
    setWorkCenters({})
    setLinesOptions([])
    setMaterialsData([])
    setStylesData([])
    setSizesData([])
  }

  // 팝업 open/close 변화 감지
  useEffect(() => {
    resetForm()
  }, [isOpen])

  // 팝업이 열릴 때 최초 1회 로드
  useEffect(() => {
    if (!isOpen) return
    void loadAgg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // 선택 변경 시 로드 (팝업이 열려 있을 때만)
  useEffect(() => {
    if (!isOpen) return
    void loadAgg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant, workCenter, line, styleCd, isOpen])

  // 현재 응답에서 허용되는 옵션 목록
  const lines = linesOptions
  const styleOptions = useMemo(
    () => stylesData.map((s) => s.style_cd),
    [stylesData],
  )
  const sizeOptions = useMemo(
    () => sizesData.map((s) => s.size_cd),
    [sizesData],
  )

  // Style / Size 변경 핸들러
  const handleStyleChange = (nextStyle: string) => {
    setStyleCd(nextStyle)
    setSizeCd('')
    setMaterial('')
    setErrorMsg2('')
  }

  const handleSizeChange = (nextSize: string) => {
    setSizeCd(nextSize)
    setMaterial('')
    setErrorMsg2('')
  }

  // Style+Size 선택 완료 시 material resolve
  useEffect(() => {
    if (!isOpen) return
    if (!plant || !workCenter || !line) return
    if (!styleCd || !sizeCd) return

    const resolve = async () => {
      try {
        // fetchMaterialResolve 결과를 명시적으로 타입 캐스팅하여 any 사용 회피
        const resp = (await fetchMaterialResolve({
          plant,
          work_center: workCenter,
          line,
          style_cd: styleCd,
          size_cd: sizeCd,
        }))

        // 응답에서 material_codes / count 안전하게 분해
        const {
          material_codes = [],
          count = 0,
        } = resp.data ?? { material_codes: [], count: 0 }

        const materialCodes = material_codes
        const finalCount =
          typeof count === 'number' ? count : materialCodes.length

        if (finalCount === 1 && materialCodes.length === 1) {
          setMaterial(materialCodes[0])
          setErrorMsg2('')
          console.log(
            '[Defect_BONDING_POPUP] resolveMaterial success:',
            materialCodes[0],
          )
        } else if (finalCount === 0 || materialCodes.length === 0) {
          setMaterial('')
          setErrorMsg2('선택한 Style / Size에 남은 물량이 없습니다.')
          console.log(
            '[Defect_BONDING_POPUP] resolveMaterial: no material found',
          )
        } else {
          setMaterial('')
          setErrorMsg2(
            `선택한 Style / Size로 ${finalCount}개의 material_code가 조회되었습니다: ${materialCodes.join(
              ', ',
            )}`,
          )
          console.log(
            '[Defect_BONDING_POPUP] resolveMaterial: multiple materials =',
            materialCodes,
          )
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'request failed'
        setErrorMsg2(msg)
        console.error('[Defect_BONDING_POPUP] resolveMaterial error:', msg)
      }
    }

    void resolve()
  }, [isOpen, plant, workCenter, line, styleCd, sizeCd])

  // ESC로 닫기
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const onSubmit = async () => {
    const payload = {
      defectDate, // 'YYYYMMDD' | ''
      plant,
      workCenter,
      line,
      material, // style/size로 resolve된 material_code
      qty,
    }
    console.log('[Defect_BONDING_POPUP] Saved payload:', payload)

    // 최소 검증
    const defectQty = Number(qty)
    if (!plant || !workCenter || !line || !material) {
      console.error(
        '[Defect_BONDING_POPUP] plant/workCenter/line/material is required',
        '(materialsData length =',
        materialsData.length,
        ')', // ← materialsData 읽어서 lint 경고 제거
      )
      return
    }
    // qty 필수
    if (!qty || Number.isNaN(defectQty)) {
      console.error('[Defect_BONDING_POPUP] qty must be a valid number')
      return
    }

    const request: DefectDistributeRequest = {
      plant,
      defect_date: defectDate,
      work_center: workCenter,
      line_cd: line,
      material_code: material, // 최종적으로 저장에 사용되는 값
      defect_qty: defectQty,
      defect_form: 'BONDING',
      log: {
        defect_source: '006', //TODO:: 고정값 006으로 설정 필요
        defect_decision: 'Q', //TODO:: 고정값 Q로 넣어야함 인터페이스 수정필요
      },
    }
    console.log(
      '[Defect_BONDING_POPUP] Distribute defects request:',
      request,
    )

    try {
      const result: DefectDistributeResult =
        await fetchDistributeDefects(request)

      if ('code' in result && result.code === 'DEFECT_QTY_EXCEEDED') {
        // 409 초과 케이스: 실제 반영 없음, 시뮬레이션 정보만 제공
        console.log('[Defect_BONDING_POPUP] Defect qty exceeded')
        console.log('  totalRequested:', result.totalRequested)
        console.log('  totalCapacity:', result.totalCapacity)
        console.log('  notAppliedQty:', result.notAppliedQty)
        console.log('  allocations:', result.allocations)
        // TODO: 여기서 팝업/토스트로 사용자에게 안내 + allocations 보여주기
      } else {
        // 200 정상 성공 케이스
        console.log(
          '[Defect_BONDING_POPUP] Distribute defects result:',
          result,
        )
        // TODO: 성공 메시지/리셋 처리
      }
      setStyleCd('')
      setSizeCd('')
      setQty('')
      setMaterial('') // TODO:: 확인 필요
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        '[Defect_BONDING_POPUP] Distribute defects error:',
        msg,
      )
      // TODO: 공통 에러 메시지 화면 표시
      // 에러 시에는 팝업을 유지해서 재시도 가능하게 둔다.
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: '-30vh'
      }}
      onClick={onClose}
    >
      <div
        className="no-focus"
        style={{ width: '45vw', height: '30vh', padding: '2vw', borderRadius: '1vw', backgroundColor: '#ffff', overflow: 'visible' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start', // 왼쪽 제목, 오른쪽 상태
              alignItems: 'center',
              fontSize: '1.1rem',
              fontWeight: 600,
              margin: '1vh 0',
              gap: '2vw',
            }}
          >
            <span>Bonding Test</span>
            <div style={{ minHeight: 20, display: 'flex', gap: '2vw' }}>
              {loading2 && <span>Loading...</span>}
              {errorMsg2 && <span style={{ color: 'red' }}>{errorMsg2}</span>}
            </div>
          </div>

          <div
            style={{
              height: '2px',
              backgroundColor: 'black',
              margin: '0.3vh 0',
            }}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2vw',
            }}
          >
            <FormRow label="Defect Date">
              <CustomDatePicker
                value={defectDate}
                onChange={setDefectDate}
                valueFormat="yyyyMMdd"
                boxHeight="3vh"
                boxWidth="10vw"
                innerFont="1vw"
              />
            </FormRow>
            <FormRow label="Plant" labelWidth="5vw" ml="10vw">
              <CustomSelect
                options={plants}
                value={plant}
                onChange={setPlant}
                boxWidth="10vw"
                boxHeight="3vh"
              />
            </FormRow>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2vw',
            }}
          >
            <FormRow label="Work Center">
              <CustomSelect
                options={workCenters}
                value={workCenter}
                onChange={setWorkCenter}
                boxWidth="20vw"
                boxHeight="3vh"
              />
            </FormRow>
            <FormRow label="Line" labelWidth="5vw" ml="0vw">
              <CustomSelect
                options={lines}
                value={line}
                onChange={setLine}
                boxWidth="10vw"
                boxHeight="3vh"
              />
            </FormRow>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2vw',
            }}
          >
            <FormRow label="Style Code">
              <CustomSelect
                options={styleOptions}
                value={styleCd}
                onChange={handleStyleChange}
                boxWidth="20vw"
                boxHeight="3vh"
              />
            </FormRow>
            <FormRow label="Size" labelWidth="5vw" ml="0vw">
              <CustomSelect
                options={sizeOptions}
                value={sizeCd}
                onChange={handleSizeChange}
                boxWidth="10vw"
                boxHeight="3vh"
              />
            </FormRow>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2vw',
            }}
          >
            <FormRow label="Qty">
              <CustomInput
                value={qty}
                onChange={setQty}
                boxWidth="10vw"
                boxHeight="3vh"
                innerFont="1rem"
              />
            </FormRow>
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
              design="Emphasized"
              onClick={() => {
                void onSubmit()
              }}
            >
              Submit
            </Button>
            <Button
              design="Transparent"
              onClick={() => {
                onCloseWithSelection?.({ plant, workCenter, defectDate })
                onClose()
              }}
            >
              Close
            </Button>

          </div>
        </div>
      </div>
    </div>
  )
}
