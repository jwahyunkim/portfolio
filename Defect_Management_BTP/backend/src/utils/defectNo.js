//src/utils/defectNo.js
export function buildDefectNo(yyyymmdd, seq) {
  const s = String(seq).padStart(4, "0");
  return `${yyyymmdd}${s}`;
}
