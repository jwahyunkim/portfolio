const toNullOrTrim = (v, max, nullIfEmpty) => {
  if (v === undefined || v === null) return null;
  const s = String(v);
  if (nullIfEmpty && s.trim() === '') return null;
  return s.length > max ? s.slice(0, max) : s;
};

/**
 * row: OData 원본 객체
 * mapping: { columns:[], length:{}, rename:{} }
 * options: { nullIfEmpty:boolean }
 * 반환: 타깃 컬럼 순서의 값 배열
 */
export function mapRow(row, mapping, options = {}) {
  const { columns, length = {}, rename = {} } = mapping;
  const nullIfEmpty = options.nullIfEmpty !== false;

  // 소스키 → 타깃키 리네임 반영
  const merged = { ...row };
  for (const [src, dst] of Object.entries(rename)) {
    if (Object.prototype.hasOwnProperty.call(row, src)) merged[dst] = row[src];
  }

  // 타깃 컬럼 순서대로 값 구성
  return columns.map(col => {
    const max = Number.isFinite(length[col]) ? length[col] : 2000;
    return toNullOrTrim(merged[col], max, nullIfEmpty);
  });
}
