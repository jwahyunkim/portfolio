// src/pages/Defect_Management_BTM_ENT_POPUP.tsx 

import '../MyApp.css'
import './Defect_Management_BTM_ENT_POPUP.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@ui5/webcomponents-react'
import CustomSelect from '../../components/CustomSelect'
import type { SelectOption } from '../../components/CustomSelect'

import CustomInput from '../../components/CustomInput'
import CustomDatePicker from '../../components/CustomDatePicker'
import FormRow from '../../components/FormRow'

import {
  fetchDistributeDefects,
  type DefectDistributeRequest,
  type DefectDistributeResult,

  fetchDefectsReason,

  fetchWorkCenters,
  fetchLines,
  fetchMaterials,
  fetchComponents,
  fetchPlants,
  type MaterialOption,
  type ComponentOption,
} from '../../data/api/index'



export type Side = 'L' | 'R' | ''

export interface BTM_ENT_PopupProps {
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

export default function Defect_Management_BTM_ENT_POPUP({
  isOpen,
  onClose,
  onCloseWithSelection,
}: BTM_ENT_PopupProps) {
  // 라디오
  const [side, setSide] = useState<Side>('')

  // 인풋
  const [qty, setQty] = useState<string>('')

  // 날짜/셀렉트 상태
  const [defectDate, setDefectDate] = useState(() => getTodayYYYYMMDD())
  const [defectiveType, setDefectiveType] = useState<string>('')
  const [componentVal, setComponentVal] = useState<string>('')
  const [reason, setReason] = useState<string>('')

  // ===== 집계 API 연동 상태 =====
  const [plant, setPlant] = useState<string>('')
  const [workCenter, setWorkCenter] = useState<string>('')
  const [line, setLine] = useState<string>('')
  const [material, setMaterial] = useState<string>('')

  // 옵션 상태 (새 API 사용)
  const [plants, setPlants] = useState<Record<string, string>>({}) // code → name
  const [workCenters, setWorkCenters] = useState<Record<string, string>>({}) // code → name
  const [linesOptions, setLinesOptions] = useState<string[]>([])
  const [materialsData, setMaterialsData] = useState<MaterialOption[]>([])
  const [componentsData, setComponentsData] = useState<ComponentOption[]>([])

  const [loading2, setLoading2] = useState<boolean>(false)
  const [errorMsg2, setErrorMsg2] = useState<string>('')

  // 체크박스 (Self Inspection / QC 중 하나만)

  // 더미 옵션
  const [reasonOptions, setReasonOptions] = useState<SelectOption[]>([])
  const [typeOptions, setTypeOptions] = useState<SelectOption[]>([])

  // 중복 호출 방지용 AbortController
  const abortRef = useRef<AbortController | null>(null)

  // 서버 호출
  const loadAgg = async () => {
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
      setPlants(plantMap)

      const plantCodes = Object.keys(plantMap)
      if (plant && !plantCodes.includes(plant)) {
        setPlant('')
      }

      // 1) Work Center 옵션
      let wcMap: Record<string, string> = {}
      if (plant) {
        const workCenterResp = await fetchWorkCenters({
          plant: plant,
          code_class_cd: 'BTM_EXT',
        })
        wcMap = Object.fromEntries(
          workCenterResp.data.map((wc: { code: string; name: string }) => [wc.code, wc.name])
        )
      }
      setWorkCenters(wcMap)

      const wcCodes = Object.keys(wcMap)
      if (workCenter && !wcCodes.includes(workCenter)) {
        setWorkCenter('')
      }

      // 2) Line 옵션 (Work Center 선택 시에만)
      let lineCodes: string[] = []
      if (workCenter) {
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

      // 3) Material 옵션 (remain > 0, Work Center + Line 선택 시에만)
      let materialList: MaterialOption[] = []
      if (workCenter && line) {
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

      // 4) Component 옵션 (Return + workCenter + line + material 선택 시에만)
      let compList: ComponentOption[] = []
      if (workCenter && line && material) {
        const compResp = await fetchComponents({
          // plant 생략 → 서버 env.PLANT
          plant,
          work_center: workCenter,
          line,
          material_code: material,
        })
        compList = compResp.data
      }
      setComponentsData(compList)
      const compCodes = compList.map((c) => c.material_code)
      if (componentVal && !compCodes.includes(componentVal)) {
        setComponentVal('')
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
    setSide('')
    setQty('')
    setDefectDate(getTodayYYYYMMDD())
    setDefectiveType('')
    setComponentVal('')
    setReason('')
    setPlant('')
    setWorkCenter('')
    setLine('')
    setMaterial('')
    setErrorMsg2('')
    setLoading2(false)
    setPlants({})
    setWorkCenters({})
    setLinesOptions([])
    setMaterialsData([])
    setComponentsData([])
  }

  // 팝업 open/close 변화 감지
  useEffect(() => {
    resetForm()
  }, [isOpen])

  // 팝업이 열릴 때 최초 1회 로드
  useEffect(() => {
    if (!isOpen) return
    void loadAgg()
  }, [isOpen])

  // 선택 변경 시 로드 (팝업이 열려 있을 때만)
  useEffect(() => {
    if (!isOpen) return
    void loadAgg()
    // console.log('[DEBUG] workCenter:', workCenter)
    // console.log('[DEBUG]  line:', line)
    // console.log('[DEBUG] materialsData:', materialsData)
    // console.log('[DEBUG] componentOptions:', componentOptions)
  }, [plant, workCenter, line, material, isOpen])

  // 현재 응답에서 허용되는 옵션 목록(서버가 필터 반영해 줌)
  const lines = linesOptions
  const materials = useMemo(
    () => materialsData.map((m) => m.material_code),
    [materialsData],
  )
  // 선택된 material의 대표·remain 표시용
  // const selectedRow = useMemo(() => {
  //   if (!materialsData.length || !material) return undefined
  //   return materialsData.find((m) => m.material_code === material)
  // }, [materialsData, material])
  //컴포넌트 셀렉트용 옵션
  const componentOptions = useMemo(() => {
    if (!componentsData.length) return []
    // material_code 1개당 1개 row만 온다고 가정(서버에서 그룹핑 완료)
    // 셀렉트 옵션은 간단히 품번만 사용
    return componentsData.map((c) => c.material_code)
  }, [componentsData])



  //선택된 컴포넌트의 remain 쓰기
  // const selectedComponent = useMemo(() => {
  //   if (!componentsData.length || !componentVal) return undefined
  //   return componentsData.find((c) => c.material_code === componentVal)
  // }, [componentsData, componentVal])


  // 더미 옵션 로드
  // customSelect에서
  // 배열이 SelectOption[] 형태면 그대로 사용
  // 일반 배열이면 value=label 동일하게 변환
  // 객체면 key → value, value → label 로 변환
  useEffect(() => {
    if (!isOpen) return

    if (!plant || !material) {
      setReasonOptions([])
      setReason('')
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const resp = await fetchDefectsReason({
          plant_cd: plant,
          material_code: material,
        })

        if (cancelled) return

        const options = Array.isArray(resp?.data) ? resp.data : []
        setReasonOptions(options)

        setReason((prev) => (options.some((x) => x.value === prev) ? prev : ''))
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'request failed'
        setErrorMsg2(msg)
        setReasonOptions([])
        setReason('')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [plant, material, isOpen])

  useEffect(() => {
    void fetch('/dummyData/defective-type.json')
      .then((r) => r.json() as Promise<SelectOption[]>)
      .then(setTypeOptions)
      .catch(() => setTypeOptions([]))
  }, [])

  useEffect(() => {
    // 디버그 로그
    // console.log('reasonOptions state:', reasonOptions.length)
  }, [reasonOptions])

  useEffect(() => {
    // console.log('typeOptions state:', typeOptions.length)
  }, [typeOptions])

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
      material,
      defectiveType,
      division: side, // 'Left' | 'Right'
      component: componentVal,
      reason,
      qty,
    }
    console.log('[Defect_BTM_EXT_POPUP] Saved payload:', payload)

    // 최소 검증
    const defectQty = Number(qty)
    if (!plant || !workCenter || !line || !material) {
      console.error('[Defect_BTM_INT_POPUP] plant/workCenter/line/material is required')
      return
    }
    // qty 필수
    if (!qty || Number.isNaN(defectQty)) {
      console.error('[Defect_BTM_EXT_POPUP] qty must be a valid number')
      return
    }
    // defectiveType 필수
    if (!defectiveType) {
      console.error('[Defect_BTM_EXT_POPUP] defectiveType is required')
      return
    }
    // reason 필수
    if (!reason) {
      console.error('[Defect_BTM_EXT_POPUP] reason is required')
      return
    }
    // division 필수
    if (!side) {
      console.error('[Defect_BTM_EXT_POPUP] division(side) is required')
      return
    }
    //inspectionType 필수

    const request: DefectDistributeRequest = {
      plant: plant,
      defect_date: defectDate,
      work_center: workCenter,
      line_cd: line,
      material_code: material,
      defect_qty: defectQty,
      defect_form: 'BTM_EXT',
      log: {
        division: side || undefined,
        defect_decision: 'R',
        defect_source: defectiveType || undefined,
        component_code: componentVal || undefined,
        defect_type: reason || undefined,
        // mold_id: 필요 시 state 추가 후 연결
      },
    }

    try {
      const result: DefectDistributeResult = await fetchDistributeDefects(request)

      if ('code' in result && result.code === 'DEFECT_QTY_EXCEEDED') {
        // 409 초과 케이스: 실제 반영 없음, 시뮬레이션 정보만 제공
        console.warn('[Defect_BTM_EXT_POPUP] Defect qty exceeded')
        console.warn('  totalRequested:', result.totalRequested)
        console.warn('  totalCapacity:', result.totalCapacity)
        console.warn('  notAppliedQty:', result.notAppliedQty)
        console.warn('  allocations:', result.allocations)
        // TODO: 여기서 팝업/토스트로 사용자에게 안내 + allocations 보여주기
      } else {
        // 200 정상 성공 케이스
        console.log('[Defect_BTM_EXT_POPUP] Distribute defects result:', result)
        // TODO: 성공 메시지/리셋 처리
      }

      setMaterial('')
      setDefectiveType('')
      setSide('')
      setComponentVal('')
      setReason('')
      setQty('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Defect_BTM_EXT_POPUP] Distribute defects error:', msg)
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
        style={{ width: '70vw', height: '30vh', padding: '2vw', borderRadius: '1vw', backgroundColor: '#ffff', overflow: 'visible' }}
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
            <span>Bottom External Defect</span>
            <div style={{ minHeight: 20, display: 'flex', gap: '2vw' }}>
              {loading2 && <span>Loading...</span>}
              {errorMsg2 && <span style={{ color: 'red' }}>{errorMsg2}</span>}
            </div>
          </div>

          <div style={{ height: '2px', backgroundColor: 'black', margin: '0.3vh 0' }} />

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>

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

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>

            <FormRow label="Work Center" >
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

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            <FormRow label="Material">
              <CustomSelect
                options={materials}
                value={material}
                onChange={setMaterial}
                boxWidth="20vw"
                boxHeight="3vh"
              />
            </FormRow>
            <FormRow label="Type" labelWidth="5vw" ml="0vw">
              <CustomSelect
                options={typeOptions}
                value={defectiveType}
                onChange={setDefectiveType}
                boxWidth="10vw"
                boxHeight="3vh"
              />
            </FormRow>
            <FormRow label="Division" labelWidth="5vw" ml="4vw">
              <div style={{ display: 'flex', gap: '2vw', alignItems: 'center' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3vw',
                    fontSize: '0.9rem',
                  }}
                >
                  <input
                    type="radio"
                    name="division"
                    value="L"
                    checked={side === 'L'}
                    onChange={(e) => setSide(e.target.value as Side)}
                    style={{ transform: 'scale(0.9)', verticalAlign: 'middle' }}
                  />

                  Left
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3vw',
                    fontSize: '0.9rem',
                  }}
                >
                  <input
                    type="radio"
                    name="division"
                    value="R"
                    checked={side === 'R'}
                    onChange={(e) => setSide(e.target.value as Side)}
                    style={{ transform: 'scale(0.9)', verticalAlign: 'middle' }}
                  />

                  Right
                </label>
              </div>
            </FormRow>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            {/* <FormRow label="Scrap/Return">
            <CustomSelect
              options={{ S: 'Scrap', R: 'Return' }}
              value={scrapReturn}
              onChange={setScrapReturn}
              boxWidth="10vw"
              boxHeight="3vh"
            />
          </FormRow> */}
            <FormRow label="Component" >
              <CustomSelect
                options={componentOptions}
                value={componentVal}
                onChange={setComponentVal}
                boxWidth="20vw"
                boxHeight="3vh"
              />
            </FormRow>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            <FormRow label="Reason">
              <CustomSelect
                options={reasonOptions}
                value={reason}
                onChange={setReason}
                boxWidth="20vw"
                boxHeight="3vh"
              />
            </FormRow>


            <FormRow label="Qty" labelWidth="5vw" ml="0vw">
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
            <Button design="Emphasized" onClick={() => { void onSubmit(); }}>
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
