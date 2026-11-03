export const MAX_AMOUNT = 999_999_999;

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

function normalize(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s]/g, "")
    .replace(/^NT\$/i, "")
    .replace(/元$/, "");
}

function parse(raw: unknown, label: string, allowZero: boolean): ParseResult {
  if (raw === null || raw === undefined) return allowZero ? { ok: true, value: 0 } : { ok: false, error: `請輸入${label}` };
  const s = normalize(raw);
  if (s === "") return allowZero ? { ok: true, value: 0 } : { ok: false, error: `請輸入${label}` };
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, error: `${label}只能輸入數字` };
  if (s.startsWith("-")) return { ok: false, error: `${label}不能是負數` };
  if (s.includes(".")) return { ok: false, error: `${label}請輸入整數，不要有小數點` };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > MAX_AMOUNT) return { ok: false, error: `${label}太大了，請重新確認` };
  if (n === 0 && !allowZero) return { ok: false, error: `${label}必須大於 0` };
  return { ok: true, value: n };
}

/** 金額必須是大於 0 的整數（新台幣）。 */
export function parseAmount(raw: unknown, label = "金額"): ParseResult {
  return parse(raw, label, false);
}

/** 可以留白或 0 的金額（例如利息、其他費用）。 */
export function parseNonNegativeAmount(raw: unknown, label = "金額"): ParseResult {
  return parse(raw, label, true);
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatNT(n: number): string {
  return `NT$ ${formatNumber(n)}`;
}

export function formatYuan(n: number): string {
  return `${formatNumber(n)} 元`;
}

export function signedYuan(n: number, kind: "income" | "expense"): string {
  return `${kind === "income" ? "+" : "-"}${formatNumber(n)}`;
}
