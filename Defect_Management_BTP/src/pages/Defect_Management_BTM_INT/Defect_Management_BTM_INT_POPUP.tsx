// src/pages/Defect_Management_BTM_INT_POPUP.tsx

import '../MyApp.css'
import './Defect_Management_BTM_INT_POPUP.css'

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
  // putScrapSto,

  fetchWorkCenters,
  fetchLines,
  fetchMaterials,
  // fetchComponents,
  fetchPlants,

  // Mold 연쇄 옵션
  fetchMoldCodes,
  fetchMoldSizes,
  fetchMoldSerial,

  // Defect Reason 옵션
  fetchDefectsReason,

  type MaterialOption,
  // type ComponentOption,
} from '../../data/api/index'

export type Side = 'L' | 'R' | ''

export interface BTM_INT_PopupProps {
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

export default function Defect_Management_BTM_INT_POPUP({
  isOpen,
  onClose,
  onCloseWithSelection,
}: BTM_INT_PopupProps) {
  // 라디오
  const [side, setSide] = useState<Side>('')

  // 인풋
  const [qty, setQty] = useState<string>('')

  // 날짜/셀렉트 상태
  const [defectDate, setDefectDate] = useState(() => getTodayYYYYMMDD())

  const [gradeType, setGradeType] = useState<string>('')

  // Scrap/Return: 이제 Return 제거, 항상 Scrap('S') 고정
  const scrapReturn = 'S' as const

  // Component: Return일 때만 유효 → 제거
  // const [componentVal, setComponentVal] = useState<string>('')

  const [reason, setReason] = useState<string>('')
  const [moldCode, setMoldCode] = useState<string>('')
  const [moldSize, setMoldSize] = useState<string>('')
  const [moldSet, setMoldSet] = useState<string>('')

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
  // const [componentsData, setComponentsData] = useState<ComponentOption[]>([])

  // Mold 옵션 상태 (연쇄 API)
  const [moldCodeOptions, setMoldCodeOptions] = useState<string[]>([])
  const [moldSizeOptions, setMoldSizeOptions] = useState<Record<string, string>>({}) // size_cd -> size_nm

  // Mold Set 옵션 상태 (ZZ_MO_SERIAL)
  const [moldSetOptions, setMoldSetOptions] = useState<string[]>([])

  const [loading2, setLoading2] = useState<boolean>(false)
  const [errorMsg2, setErrorMsg2] = useState<string>('')

  // 체크박스 (Self Inspection / QC 중 하나만)
  const [inspectionType, setInspectionType] = useState<string>('') // 'S' | 'Q'

  // 더미 옵션
  const [reasonOptions, setReasonOptions] = useState<SelectOption[]>([])
  const [gradeTypeOptions, setGradeTypeOptions] = useState<SelectOption[]>([])

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
          code_class_cd: 'BTM_INT',
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
          // TODO:: Plant API 생성 후 선택 값으로 Plant 넣기
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
          // TODO:: Plant API 생성 후 선택 값으로 Plant 넣기
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

      // 4) Component 옵션: Return 제거로 불필요
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
    setGradeType('')
    // setScrapReturn('')
    // setComponentVal('')
    setReason('')
    setMoldCode('')
    setMoldSize('')
    setMoldSet('')
    setPlant('')
    setWorkCenter('')
    setLine('')
    setMaterial('')
    setInspectionType('')
    setErrorMsg2('')
    setLoading2(false)
    setPlants({})
    setWorkCenters({})
    setLinesOptions([])
    setMaterialsData([])
    // setComponentsData([])

    // Mold 옵션 초기화
    setMoldCodeOptions([])
    setMoldSizeOptions({})

    // Mold Set 옵션 초기화
    setMoldSetOptions([])
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
  }, [plant, workCenter, line, material, isOpen])

  // Mold Code 옵션 로드 (plant/workCenter/line/material 선택 완료 시)
  useEffect(() => {
    if (!isOpen) return

    // 상위 조건 바뀌면 연쇄 선택 초기화( Mold Set 은 건드리지 않음 )
    setMoldCode('')
    setMoldSize('')
    setMoldCodeOptions([])
    setMoldSizeOptions({})

    // mold set (serial) 초기화
    setMoldSet('')
    setMoldSetOptions([])

    if (!plant || !workCenter || !line || !material) return

    void (async () => {
      try {
        const resp = await fetchMoldCodes({
          plant,
          work_center: workCenter,
          line,
          material_code: material,
        })
        const codes = resp.data.map((x) => x.mold_code)
        setMoldCodeOptions(codes)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'request failed'
        setErrorMsg2(msg)
      }
    })()
  }, [plant, workCenter, line, material, isOpen])

  // Mold Size 옵션 로드 (moldCode 선택 시)
  useEffect(() => {
    if (!isOpen) return

    // moldCode 바뀌면 size 초기화 ( Mold Set 은 건드리지 않음 )
    setMoldSize('')
    setMoldSizeOptions({})

    // mold size 바뀌면 mold set (serial) 초기화
    setMoldSet('')
    setMoldSetOptions([])

    if (!plant || !workCenter || !line || !material || !moldCode) return

    void (async () => {
      try {
        const resp = await fetchMoldSizes({
          plant,
          work_center: workCenter,
          line,
          material_code: material,
          mold_code: moldCode,
        })

        // value = mold_size_cd, label = mold_size_nm
        const sizeMap: Record<string, string> = Object.fromEntries(
          resp.data.map((x) => [x.mold_size_cd, x.mold_size_nm])
        )
        setMoldSizeOptions(sizeMap)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'request failed'
        setErrorMsg2(msg)
      }
    })()
  }, [moldCode, plant, workCenter, line, material, isOpen])

  // Mold Set(= ZZ_MO_SERIAL) 옵션 로드 (moldSize 선택 시)
  useEffect(() => {
    if (!isOpen) return

    // moldSize 바뀌면 mold set 초기화
    setMoldSet('')
    setMoldSetOptions([])

    if (!plant || !moldCode || !moldSize) return

    void (async () => {
      try {
        const resp = await fetchMoldSerial({
          plant,
          mold_code: moldCode,
          mold_size: moldSize,
        })

        const serial = resp?.data?.zz_mo_serial ?? ''
        const count = resp?.meta?.count ?? 0

        if (count === 0 || !serial) {
          setMoldSetOptions([])
          return
        }

        setMoldSetOptions([serial])
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'request failed'
        setErrorMsg2(msg)
      }
    })()
  }, [moldSize, moldCode, plant, isOpen])

  // 현재 응답에서 허용되는 옵션 목록(서버가 필터 반영해 줌)
  const lines = linesOptions
  const materials = useMemo(() => materialsData.map((m) => m.material_code), [materialsData])

  // 선택된 material의 대표·remain 표시용
  const selectedRow = useMemo(() => {
    if (!materialsData.length || !material) return undefined
    return materialsData.find((m) => m.material_code === material)
  }, [materialsData, material])

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
    void fetch('/dummyData/grade-type-options.json')
      .then((r) => r.json() as Promise<SelectOption[]>)
      .then(setGradeTypeOptions)
      .catch(() => setGradeTypeOptions([]))
  }, [])

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
      gradeType,
      division: side, // 'Left' | 'Right'
      scrapReturn, // 항상 'S'
      reason,
      qty,
      moldCode,
      moldSize,
      moldSet,
      inspectionType,
    }
    console.log('[Defect_BTM_INT_POPUP] Saved payload:', payload)

    // 최소 검증
    const defectQty = Number(qty)
    if (!plant || !workCenter || !line || !material) {
      console.error('[Defect_BTM_INT_POPUP] plant/workCenter/line/material is required')
      return
    }
    // qty 필수
    if (!qty || Number.isNaN(defectQty)) {
      console.error('[Defect_BTM_INT_POPUP] qty must be a valid number')
      return
    }
    // gradeType 필수
    if (!gradeType) {
      console.error('[Defect_BTM_INT_POPUP] gradeType is required')
      return
    }
    // reason 필수
    if (!reason) {
      console.error('[Defect_BTM_INT_POPUP] reason is required')
      return
    }
    // division 필수
    if (!side) {
      console.error('[Defect_BTM_INT_POPUP] division(side) is required')
      return
    }
    //inspectionType 필수
    if (!inspectionType) {
      console.error('[Defect_BTM_INT_POPUP] inspectionType is required')
      return
    }

    const request: DefectDistributeRequest = {
      plant: plant,
      defect_date: defectDate,
      work_center: workCenter,
      line_cd: line,
      material_code: material,
      defect_qty: defectQty,
      defect_form: 'BTM_INT',
      log: {
        division: side || undefined,
        defect_source: gradeType || undefined,
        defect_decision: 'S',
        defect_type: reason || undefined,
        defect_check: inspectionType || undefined,
        mold_code: moldCode || undefined,
        mold_size: moldSize || undefined,
        mold_set: moldSet || undefined,
        // mold_id: 필요 시 state 추가 후 연결
      },
    }

    try {
      const result: DefectDistributeResult = await fetchDistributeDefects(request)

      if ('code' in result && result.code === 'DEFECT_QTY_EXCEEDED') {
        // 409 초과 케이스: 실제 반영 없음, 시뮬레이션 정보만 제공
        console.log('[Defect_BTM_INT_POPUP] Defect qty exceeded')
        console.log('  totalRequested:', result.totalRequested)
        console.log('  totalCapacity:', result.totalCapacity)
        console.log('  notAppliedQty:', result.notAppliedQty)
        console.log('  allocations:', result.allocations)
        // TODO: 여기서 팝업/토스트로 사용자에게 안내 + allocations 보여주기
      } else {
        // 200 정상 성공 케이스
        console.log('[Defect_BTM_INT_POPUP] Distribute defects result:', result)
        // if (scrapReturn === 'S' && 'logs' in result && result.logs.length > 0) {
        //   try {
        //     const stoPayload = {
        //       IT_INPUT: result.logs.map((log) => ({
        //         defectno: log.defect_no,
        //         proctype: 'S',
        //         menge: log.defect_qty,
        //       })),
        //     }
        //     console.log('[Defect_BTM_INT_POPUP] Calling scrap-sto/put:', stoPayload)
        //     const stoResult = await putScrapSto(stoPayload)
        //     console.log('[Defect_BTM_INT_POPUP] Scrap STO result:', stoResult)
        //   } catch (e) {
        //     const msg = e instanceof Error ? e.message : String(e)
        //     console.error('[Defect_BTM_INT_POPUP] Scrap STO error:', msg)
        //   }
        // }
        // TODO: 성공 메시지/리셋 처리
      }

      // 성공 / DEFECT_QTY_EXCEEDED 모두 팝업 유지
      // 일부 필드만 초기화 (plant, workCenter, line 유지)
      setQty('')
      setGradeType('')
      setReason('')
      setSide('')
      setMoldCode('')
      setMoldSize('')
      setMoldSet('')
      setMoldCodeOptions([])
      setMoldSizeOptions({})
      setMoldSetOptions([])
      setInspectionType('')
      setMaterial('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Defect_BTM_INT_POPUP] Distribute defects error:', msg)
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
        marginTop: '-20vh',
      }}
      onClick={onClose}
    >
      <div
        className="no-focus"
        style={{
          width: '70vw',
          height: '40vh',
          padding: '2vw',
          borderRadius: '1vw',
          backgroundColor: '#ffff',
          overflow: 'visible',
        }}
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
            <span>Bottom Internal Defect</span>
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
            <FormRow label="Plant" ml="10vw">
              <CustomSelect options={plants} value={plant} onChange={setPlant} boxWidth="10vw" boxHeight="3vh" />
            </FormRow>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            <FormRow label="Work Center">
              <CustomSelect
                options={workCenters}
                value={workCenter}
                onChange={setWorkCenter}
                boxWidth="20vw"
                boxHeight="3vh"
              />
            </FormRow>
            <FormRow label="Line" ml="0vw">
              <CustomSelect options={lines} value={line} onChange={setLine} boxWidth="10vw" boxHeight="3vh" />
            </FormRow>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            <FormRow label="Material">
              <CustomSelect options={materials} value={material} onChange={setMaterial} boxWidth="20vw" boxHeight="3vh" />
            </FormRow>
            <FormRow label="Grade Type" ml="0vw">
              <CustomSelect
                options={gradeTypeOptions}
                value={gradeType}
                onChange={setGradeType}
                boxWidth="10vw"
                boxHeight="3vh"
              />
            </FormRow>
            <FormRow label="Division" ml="0vw">
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

          {/* Scrap/Return + Component UI 제거 */}

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            <FormRow label="Reason">
              <CustomSelect options={reasonOptions} value={reason} onChange={setReason} boxWidth="20vw" boxHeight="3vh" />
            </FormRow>
            <FormRow label="Qty" ml="0vw">
              <CustomInput value={qty} onChange={setQty} boxWidth="10vw" boxHeight="3vh" innerFont="1rem" />
            </FormRow>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            <FormRow label="Mold Code">
              <CustomSelect
                options={moldCodeOptions}
                value={moldCode}
                onChange={setMoldCode}
                boxWidth="10vw"
                boxHeight="3vh"
                disabled={!plant || !workCenter || !line || !material}
              />
            </FormRow>
            <FormRow label="Mold Size" ml="10vw">
              <CustomSelect
                options={moldSizeOptions}
                value={moldSize}
                onChange={setMoldSize}
                boxWidth="10vw"
                boxHeight="3vh"
                disabled={!moldCode}
              />
            </FormRow>
            <FormRow label="Mold Set" ml="0vw">
              <CustomSelect
                options={moldSetOptions}
                value={moldSet}
                onChange={setMoldSet}
                boxWidth="10vw"
                boxHeight="3vh"
                disabled={!moldSize}
              />
            </FormRow>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '2vw' }}>
            <FormRow label="MCS Name">
              <CustomInput
                value={(selectedRow?.zcf_mcs_cd as string) ?? ''}
                readOnly
                boxWidth="10vw"
                boxHeight="3vh"
                innerFont="1rem"
              />
            </FormRow>
            <FormRow label="Color" ml="10vw">
              <CustomInput
                value={(selectedRow?.zcf_mcs_color_nm as string) ?? ''}
                readOnly
                boxWidth="10vw"
                boxHeight="3vh"
                innerFont="1rem"
              />
            </FormRow>
            <FormRow label="" labelWidth="" ml="0vw">
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
                    type="checkbox"
                    checked={inspectionType === 'S'}
                    onChange={() => setInspectionType('S')}
                    style={{ transform: 'scale(0.9)', verticalAlign: 'middle' }}
                  />
                  Self Inspection
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
                    type="checkbox"
                    checked={inspectionType === 'Q'}
                    onChange={() => setInspectionType('Q')}
                    style={{ transform: 'scale(0.9)', verticalAlign: 'middle' }}
                  />
                  QC
                </label>
              </div>
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
            <Button design="Emphasized" onClick={() => void onSubmit()}>
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
