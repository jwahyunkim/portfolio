// src/models/postgres/plantDao.js

/**
 * Plant 목록 조회
 * - master.dmbs_plant_master 기준
 * - 정렬: plant_nm 오름차순
 * - 응답 필드: plant_cd, plant_nm
 * - 옵션 필터:
 *   - workCenter, line, materialCode 기반 mes.dmpd_prod_order_detail EXISTS 연쇄 필터
 *   - 값이 하나도 없으면 전체 plant 리턴
 */
export async function findPlants(client, { workCenter, line, materialCode }) {
  const values = [];
  const where = [];

  // 필요하면 활성 플래그(eff_status 등) 조건도 여기서 추가 가능
  // 예시:
  // where.push("PL.eff_status = 'A'");

//   const hasWorkCenter =
//     typeof workCenter === 'string' && workCenter.trim() !== '';
//   const hasLine =
//     typeof line === 'string' && line.trim() !== '';
//   const hasMaterial =
//     typeof materialCode === 'string' && materialCode.trim() !== '';

//   // 연쇄 필터: workCenter / line / materialCode 기준 prod_order EXISTS
//   if (hasWorkCenter || hasLine || hasMaterial) {
//     const existsConds = [
//       'P.plant = PL.plant_id', // plant 키 매핑
//     ];

//     if (hasWorkCenter) {
//       values.push(workCenter.trim());
//       existsConds.push(`P.work_center = $${values.length}`);
//     }

//     if (hasLine) {
//       values.push(line.trim());
//       existsConds.push(`P.zcf_line_cd = $${values.length}`);
//     }

//     if (hasMaterial) {
//       values.push(materialCode.trim());
//       existsConds.push(`P.material_code = $${values.length}`);
//     }

//     where.push(
//       `EXISTS (SELECT 1 FROM mes.dmpd_prod_order_detail P WHERE ${existsConds.join(
//         ' AND '
//       )})`
//     );
//   }

  const sql = `
    SELECT
      PL.plant_id AS plant_cd,
      PL.plant_nm
    FROM master.dmbs_plant_master PL
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY PL.plant_id
  `;

  const { rows } = await client.query(sql, values);
  return rows;
}
