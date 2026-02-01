// src/pages/DBdataTest.tsx (전체 파일)

import { useEffect, useMemo, useRef, useState } from 'react'
// import { fetchReworkData } from '../api/api';
import CustomTable from '../components/CustomTable'
import {
  fetchTableCheck,
  fetchWorkCenters,
  fetchLines,
  fetchMaterials,
  fetchComponents,
  fetchDefectResultReport,
  fetchPlants,
  type DefectResultReportParams,
  type DefectResultReportResponse,
  type MaterialOption,
  type ComponentOption,
  type PlantOption,
} from '../data/api'

type WorkCenterItem = {
  code: string
  name: string
}

type LineItem = {
  line_cd: string
  line_name: string
}

export default function DBdataTest() {
  // 기존 상태: 테이블 체크
  const [TableCheckData, setTableCheckData] = useState<{ status: string; tables: string[] }>({
    status: '',
    tables: [],
  })

  useEffect(() => {
    fetchTableCheck().then(setTableCheckData).catch(console.error)
  }, [])

  // ===== 옵션 API 연동 상태 =====
  const [defectResultReport, setDefectResultReport] = useState<DefectResultReportResponse | null>(null)

  const [plant, setPlant] = useState<string>('') // 선택된 PLANT
  const [workCenter, setWorkCenter] = useState<string>('')
  const [line, setLine] = useState<string>('')
  const [material, setMaterial] = useState<string>('')
  const [componentVal, setComponentVal] = useState<string>('')

  const [plantsData, setPlantsData] = useState<PlantOption[]>([])
  const [workCenters, setWorkCenters] = useState<string[]>([])
  const [linesOptions, setLinesOptions] = useState<string[]>([])
  const [materialsData, setMaterialsData] = useState<MaterialOption[]>([])
  const [componentsData, setComponentsData] = useState<ComponentOption[]>([])

  // raw 데이터 (엔드포인트별 JSON 출력용)
  const [workCentersData, setWorkCentersData] = useState<WorkCenterItem[]>([])
  const [linesData, setLinesData] = useState<LineItem[]>([])

  const [loading2, setLoading2] = useState<boolean>(false)
  const [errorMsg2, setErrorMsg2] = useState<string>('')

  // 중복 호출 방지용 AbortController
  const abortRef = useRef<AbortController | null>(null)

  // PLANT 옵션 로드
  useEffect(() => {
    const loadPlants = async () => {
      try {
        const resp = await fetchPlants()
        setPlantsData(resp.data)
      } catch (e) {
        console.error('Error fetching plants:', e)
      }
    }

    void loadPlants()
  }, [])

  // 서버 호출 (옵션용)
  const loadAgg = async () => {
    // plant 미선택이면 모든 옵션/결과 초기화 후 종료
    if (!plant) {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }

      setWorkCentersData([])
      setWorkCenters([])
      setLinesData([])
      setLinesOptions([])
      setMaterialsData([])
      setComponentsData([])
      setDefectResultReport(null)
      setErrorMsg2('')
      setLoading2(false)

      return
    }

    // 이전 요청 취소
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading2(true)
    setErrorMsg2('')

    try {
      // 1) Work Center 옵션
      const workCenterResp = await fetchWorkCenters({
        // TODO:: Plant API 생성 후 선택 값으로 Plant 넣기 (현재 plant 상태 사용)
        plant,
        code_class_cd: 'BTM_INT',
        // line, material_code 기반 연쇄 필터는 현재 사용하지 않음
      })
      setWorkCentersData(workCenterResp.data)
      const wcCodes = workCenterResp.data.map((wc: WorkCenterItem) => wc.code)
      setWorkCenters(wcCodes)
      if (workCenter && !wcCodes.includes(workCenter)) {
        setWorkCenter('')
      }

      // 2) Line 옵션 (Work Center 선택 시에만)
      let lineCodes: string[] = []
      let linesRespData: LineItem[] = []
      if (workCenter) {
        const linesResp = await fetchLines({
          // TODO:: Plant API 생성 후 선택 값으로 Plant 넣기 (현재 plant 상태 사용)
          plant,
          work_center: workCenter,
          // material_code 연쇄 필터는 현재 사용하지 않음
        })
        linesRespData = linesResp.data as LineItem[]
        lineCodes = linesRespData.map((l) => l.line_cd)
      }
      setLinesData(linesRespData)
      setLinesOptions(lineCodes)
      if (line && !lineCodes.includes(line)) {
        setLine('')
      }

      // 3) Material 옵션 (remain > 0, Work Center + Line 선택 시에만)
      let materialList: MaterialOption[] = []
      if (workCenter && line) {
        const materialsResp = await fetchMaterials({
          // TODO:: Plant API 생성 후 선택 값으로 Plant 넣기 (현재 plant 상태 사용)
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

      // 4) Component 옵션 (workCenter + line + material 선택 시에만)
      let compList: ComponentOption[] = []
      if (workCenter && line && material) {
        const compResp = await fetchComponents({
          // TODO:: Plant API 생성 후 선택 값으로 Plant 넣기 (현재 plant 상태 사용)
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

      // 5) Defect Result Report (선택: plant 기준)
      const defectParams: DefectResultReportParams = {
        plantCd: plant, // 실제 사용할 PLANT 코드
        defectForm: 'BTM_INT',
      }
      const defectResp = await fetchDefectResultReport(defectParams)
      setDefectResultReport(defectResp)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request failed'
      setErrorMsg2(msg)
    } finally {
      setLoading2(false)
    }
  }

  // 초기 로드(옵션 시드) - plant 미선택이면 내부에서 바로 리턴
  useEffect(() => {
    void loadAgg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 선택 변경 시 로드(순서 강제 없음: 아무 필드부터 선택 가능)
  useEffect(() => {
    void loadAgg()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plant, workCenter, line, material])

  // 현재 응답에서 허용되는 옵션 목록(서버가 필터 반영해 줌)
  const lines = linesOptions
  const materials = useMemo(
    () => materialsData.map((m) => m.material_code),
    [materialsData],
  )
  const componentOptions = useMemo(
    () => componentsData.map((c) => c.material_code),
    [componentsData],
  )

  // 선택된 material 정보
  const selectedMaterial = useMemo(() => {
    if (!materialsData.length || !material) return undefined
    return materialsData.find((m) => m.material_code === material)
  }, [materialsData, material])

  // 선택된 component 정보
  const selectedComponent = useMemo(() => {
    if (!componentsData.length || !componentVal) return undefined
    return componentsData.find((c) => c.material_code === componentVal)
  }, [componentsData, componentVal])

  // ===== 기존 테이블 레이아웃 =====

  // 행 개수 (여기만 바꾸면 됨)
  const totalRows = 10
  // 행 높이
  const rowHeight = '50vh'

  const rowSizes: Record<number, string> = {}
  for (let i = 0; i < totalRows; i++) {
    rowSizes[i] = rowHeight
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'blue' }}>
      <div style={{ display: 'flex', width: '100%', backgroundColor: 'purple' }}>
        <CustomTable
          rows={totalRows}
          cols={3}
          cellContent={(row, col) => {
            // (0,0): table-check 결과
            if (row === 0 && col === 0)
              return (
                <div>
                  <div>TableCheckData (/table-check)</div>
                  <pre style={{ textAlign: 'left', margin: 0 }}>
                    {JSON.stringify(TableCheckData, null, 2)}
                  </pre>
                </div>
              )

            // (0,1): Plant / Work Center / Line / Material / Component 셀렉트 + 미리보기
            if (row === 0 && col === 1)
              return (
                <div style={{ display: 'grid', gap: 8, textAlign: 'left' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                    <label htmlFor="plant">Plant</label>
                    <select
                      id="plant"
                      value={plant}
                      onChange={(e) => {
                        const nextPlant = e.currentTarget.value
                        setPlant(nextPlant)
                        // Plant 변경 시 연쇄 선택 초기화
                        setWorkCenter('')
                        setLine('')
                        setMaterial('')
                        setComponentVal('')
                      }}
                    >
                      <option value="">-- Select --</option>
                      {plantsData.map((p) => (
                        <option key={p.plant_cd} value={p.plant_cd}>
                          {p.plant_cd} - {p.plant_nm}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                    <label htmlFor="wc">Work Center</label>
                    <select
                      id="wc"
                      value={workCenter}
                      onChange={(e) => setWorkCenter(e.currentTarget.value)}
                    >
                      <option value="">-- Select --</option>
                      {workCenters.map((wc) => (
                        <option key={wc} value={wc}>{wc}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                    <label htmlFor="line">Line</label>
                    <select
                      id="line"
                      value={line}
                      onChange={(e) => setLine(e.currentTarget.value)}
                    >
                      <option value="">-- Select --</option>
                      {lines.map((ln) => (
                        <option key={ln} value={ln}>{ln}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                    <label htmlFor="mat">Material</label>
                    <select
                      id="mat"
                      value={material}
                      onChange={(e) => setMaterial(e.currentTarget.value)}
                    >
                      <option value="">-- Select --</option>
                      {materials.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                    <label htmlFor="comp">Component</label>
                    <select
                      id="comp"
                      value={componentVal}
                      onChange={(e) => setComponentVal(e.currentTarget.value)}
                    >
                      <option value="">-- Select --</option>
                      {componentOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* 선택값 요약: 미선택 항목은 숨김 */}
                  {(plant || workCenter || line || material || componentVal) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {plant && (
                        <span style={{ border: '1px solid #ddd', padding: '2px 6px', borderRadius: 12, background: '#fff' }}>
                          Plant: {plant}
                        </span>
                      )}
                      {workCenter && (
                        <span style={{ border: '1px solid #ddd', padding: '2px 6px', borderRadius: 12, background: '#fff' }}>
                          Work Center: {workCenter}
                        </span>
                      )}
                      {line && (
                        <span style={{ border: '1px solid #ddd', padding: '2px 6px', borderRadius: 12, background: '#fff' }}>
                          Line: {line}
                        </span>
                      )}
                      {material && (
                        <span style={{ border: '1px solid #ddd', padding: '2px 6px', borderRadius: 12, background: '#fff' }}>
                          Material: {material}
                        </span>
                      )}
                      {componentVal && (
                        <span style={{ border: '1px solid #ddd', padding: '2px 6px', borderRadius: 12, background: '#fff' }}>
                          Component: {componentVal}
                        </span>
                      )}
                    </div>
                  )}

                  {loading2 && <div>Loading...</div>}
                  {errorMsg2 && <div style={{ color: 'red' }}>{errorMsg2}</div>}

                  {/* 선택된 material 정보 */}
                  {material && selectedMaterial && (
                    <div style={{ border: '1px solid #ddd', padding: 8, borderRadius: 6, background: '#fafafa', marginTop: 8 }}>
                      <div><strong>Material:</strong> {selectedMaterial.material_code}</div>
                      {'material_name' in selectedMaterial && (
                        <div><strong>Description:</strong> {selectedMaterial.material_name as string}</div>
                      )}
                      {'zcf_mcs_cd' in selectedMaterial && (
                        <div><strong>MCS Name:</strong> {selectedMaterial.zcf_mcs_cd as string}</div>
                      )}
                      {'zcf_mcs_color_nm' in selectedMaterial && (
                        <div><strong>Color Name:</strong> {selectedMaterial.zcf_mcs_color_nm as string}</div>
                      )}
                    </div>
                  )}

                  {/* 선택된 component 정보 */}
                  {componentVal && selectedComponent && (
                    <div style={{ border: '1px solid #ddd', padding: 8, borderRadius: 6, background: '#f0faff', marginTop: 8 }}>
                      <div><strong>Component Material:</strong> {selectedComponent.material_code}</div>
                      <div><strong>Parent Order:</strong> {selectedComponent.parent_order_number}</div>
                      <div><strong>Remain:</strong> {selectedComponent.remain}</div>
                      <div><strong>Order Numbers:</strong> {selectedComponent.order_numbers.join(', ')}</div>
                    </div>
                  )}
                </div>
              )

            // (0,2): /work-centers 응답 JSON
            if (row === 0 && col === 2)
              return (
                <div>
                  <div>/work-centers 결과</div>
                  <pre style={{ textAlign: 'left', margin: 0 }}>
                    {JSON.stringify(workCentersData, null, 2)}
                  </pre>
                </div>
              )

            // (1,0): /lines 응답 JSON
            if (row === 1 && col === 0)
              return (
                <div>
                  <div>/lines 결과</div>
                  <pre style={{ textAlign: 'left', margin: 0 }}>
                    {JSON.stringify(linesData, null, 2)}
                  </pre>
                </div>
              )

            // (1,1): /materials 응답 JSON
            if (row === 1 && col === 1)
              return (
                <div>
                  <div>/materials 결과</div>
                  <pre style={{ textAlign: 'left', margin: 0 }}>
                    {JSON.stringify(materialsData, null, 2)}
                  </pre>
                </div>
              )

            // (1,2): /components 응답 JSON
            if (row === 1 && col === 2)
              return (
                <div>
                  <div>/components 결과</div>
                  <pre style={{ textAlign: 'left', margin: 0 }}>
                    {JSON.stringify(componentsData, null, 2)}
                  </pre>
                </div>
              )

            // (2,0): /defects/result-report 결과
            if (row === 2 && col === 0)
              return (
                <div>
                  <div>/defects/result-report 결과</div>
                  <pre style={{ textAlign: 'left', margin: 0 }}>
                    {JSON.stringify(defectResultReport, null, 2)}
                  </pre>
                </div>
              )

            // (2,1): /plants 응답 JSON
            if (row === 2 && col === 1)
              return (
                <div>
                  <div>/plants 결과</div>
                  <pre style={{ textAlign: 'left', margin: 0 }}>
                    {JSON.stringify(plantsData, null, 2)}
                  </pre>
                </div>
              )

            // 나머지 셀은 아직 사용 안 함 (필요 시 추가)
            return null
          }}
          mergedCells={[]}
          enableColumnResize={false}
          colSizes={{ 0: '1fr', 1: '1fr', 2: '1fr' }}
          rowSizes={rowSizes}
          horizontalAlign="center"
          verticalAlign="middle"
          cellStyle={() => ({
            overflow: 'auto',
            overflowX: 'hidden',
            alignItems: 'start',
          })}
        />
      </div>
    </div>
  )
}
