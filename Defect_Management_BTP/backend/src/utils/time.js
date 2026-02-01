// Asia/Seoul 기준 날짜/시간 유틸
export function nowSeoul() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  // Intl을 이용해 YYYY-MM-DD, HH:mm:ss 구성
  const parts = fmt.formatToParts(new Date()).reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const { year, month, day } = parts;
  return new Date(`${year}-${month}-${day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`);
}

export function todayYYYYMMDD(d = new Date()) {
  const z = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${z.year}${z.month}${z.day}`;
}


export function toYYYYMMDDDash(value) {
  if (!value) return value;
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s; // 형식이 다르면 그대로
}
