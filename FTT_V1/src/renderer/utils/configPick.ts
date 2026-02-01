// src/renderer/utils/configPick.ts
type AnyObj = Record<string, any>;

export function pickStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();
  if (Array.isArray(v)) return pickStr(v[0]);
  if (typeof v === "object") {
    if ("_" in v) return pickStr(v._);
    if ("#text" in v) return pickStr(v["#text"]);
  }
  return "";
}

export function pickPath(cfg: AnyObj, path: string): string {
  const seg = path.split(".");
  let cur: any = cfg;
  for (const k of seg) {
    if (!cur) return "";
    cur = cur?.[k] ?? cur?.[k.toLowerCase()] ?? cur?.[k.toUpperCase()];
  }
  return pickStr(cur);
}

export function hasValue(cfg: AnyObj, path: string): boolean {
  return pickPath(cfg, path) !== "";
}
