// src/utils/normalizeIntColumn.js

/**
 * 주어진 rows에서 특정 컬럼 값을 정수로 변환한 새 배열을 반환
 *
 * @param {Array<object>} rows  원본 데이터 배열
 * @param {string} columnName   정수로 바꾸고 싶은 컬럼 이름 (예: "defect_qty")
 * @returns {Array<object>}     컬럼이 정수로 변환된 새 배열
 */
export function normalizeIntColumn(rows, columnName) {
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    // 방어 코드: 객체가 아니면 그대로 반환
    if (row === null || typeof row !== "object") {
      return row;
    }

    const value = row[columnName];

    // 값이 없으면 그대로 반환
    if (value === null || value === undefined) {
      return row;
    }

    let intValue;

    if (typeof value === "number") {
      intValue = Math.trunc(value);
    } else if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        // 숫자로 못 바꾸면 원본 유지
        return row;
      }
      intValue = Math.trunc(parsed);
    } else {
      // 숫자/문자가 아니면 건드리지 않음
      return row;
    }

    // 새 객체 반환 (원본 row는 건드리지 않음)
    return {
      ...row,
      [columnName]: intValue,
    };
  });
}
