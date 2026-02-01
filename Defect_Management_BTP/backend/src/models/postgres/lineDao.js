// src/models/postgres/lineDao.js

/**
 * Line 목록 조회
 * - MASTER.DMBS_FUNCLOC_MASTER 기준
 * - 기본: level = '4'
 * - 옵션 필터:
 *   - workCenter: arbpl = workCenter
 *   - plant: werks = plant
 *   - (기존 exists 기반 연쇄 필터는 주석 처리 상태)
 *   - materialCode는 연쇄 필터용이나 현재는 연쇄필터 주석이므로 사용하지 않음
 */
export async function findLines(client, { plant, workCenter, materialCode }) {
    const values = [];
    const where = [`F.level = '4'`];

    const hasWorkCenter = typeof workCenter === 'string' && workCenter.trim() !== '';
    const hasPlant = typeof plant === 'string' && plant.trim() !== '';
    // const hasMaterial = typeof materialCode === 'string' && materialCode.trim() !== '';

    // PLANT(werks) 필터
    if (hasPlant) {
        values.push(plant.trim());
        where.push(`F.werks = $${values.length}`);
    }

    // Work Center 필터(arbpl)
    if (hasWorkCenter) {
        values.push(workCenter.trim());
        where.push(`F.arbpl = $${values.length}`);
    }

    // 연쇄 필터: plant / workCenter / materialCode 가 하나라도 있으면 prod_order EXISTS
    // 현재는 prod_order 기준 연쇄 필터 미사용
    // (현재는 사용하지 않음: where.push 부분을 주석 처리)
    //   if (hasPlant || hasWorkCenter || hasMaterial) {
    //     const existsConds = [];

    //     if (hasPlant) {
    //       values.push(plant.trim());
    //       existsConds.push(`P.plant = $${values.length}`);
    //     }

    //     if (hasWorkCenter) {
    //       values.push(workCenter.trim());
    //       existsConds.push(`P.work_center = $${values.length}`);
    //     }

    //     // line 연쇄: prod_order의 zcf_line_cd = F.lvcd
    //     existsConds.push('P.zcf_line_cd = F.lvcd');

    //     if (hasMaterial) {
    //       values.push(materialCode.trim());
    //       existsConds.push(`P.material_code = $${values.length}`);
    //     }

    // where.push(
    //   `EXISTS (SELECT 1 FROM mes.dmpd_prod_order_detail P WHERE ${existsConds.join(
    //     ' AND '
    //   )})`
    // );
    //   }

    const sql = `
    SELECT DISTINCT
      F.lvcd  AS line_cd,
      F.pltxt AS line_name
    FROM MASTER.DMBS_FUNCLOC_MASTER F
    WHERE ${where.join(' AND ')}
    ORDER BY F.lvcd
  `;

    const { rows } = await client.query(sql, values);
    return rows;
}
