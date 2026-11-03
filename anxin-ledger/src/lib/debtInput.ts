import { isValidDate } from "./dates";
import { parseAmount } from "./money";

export interface DebtInput {
  name?: unknown;
  creditor?: unknown;
  originalPrincipal?: unknown;
  remainingPrincipal?: unknown;
  monthlyPayment?: unknown;
  paymentDay?: unknown;
  startDate?: unknown;
  annualRate?: unknown;
  note?: unknown;
}

export interface DebtData {
  name: string;
  creditor: string | null;
  originalPrincipal: number;
  openingPrincipal: number;
  monthlyPayment: number | null;
  paymentDay: number;
  startDate: string;
  annualRate: number;
  note: string | null;
}

export type DebtField =
  | "name"
  | "creditor"
  | "originalPrincipal"
  | "remainingPrincipal"
  | "monthlyPayment"
  | "paymentDay"
  | "startDate"
  | "annualRate"
  | "note"
  | "form";

export type DebtResult = { ok: true; data: DebtData } | { ok: false; errors: Partial<Record<DebtField, string>> };

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

export function validateDebt(input: DebtInput): DebtResult {
  const errors: Partial<Record<DebtField, string>> = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = "請輸入債務名稱";
  else if (name.length > 30) errors.name = "名稱請在 30 個字以內";

  const creditor = typeof input.creditor === "string" ? input.creditor.trim() : "";
  if (creditor.length > 30) errors.creditor = "債權人名稱請在 30 個字以內";

  const original = parseAmount(input.originalPrincipal, "原始欠款金額");
  if (!original.ok) errors.originalPrincipal = original.error;

  let opening: number | null = null;
  if (original.ok) {
    if (blank(input.remainingPrincipal)) opening = original.value;
    else {
      const r = parseAmount(input.remainingPrincipal, "目前剩餘欠款");
      if (!r.ok) errors.remainingPrincipal = r.error;
      else if (r.value > original.value) errors.remainingPrincipal = "目前剩餘欠款不能比原始欠款還多";
      else opening = r.value;
    }
  }

  let monthly: number | null = null;
  if (!blank(input.monthlyPayment)) {
    const m = parseAmount(input.monthlyPayment, "每月還款金額");
    if (!m.ok) errors.monthlyPayment = m.error;
    else monthly = m.value;
  }

  const day = Number(String(input.paymentDay ?? "").trim());
  if (blank(input.paymentDay) || !Number.isInteger(day) || day < 1 || day > 31) errors.paymentDay = "還款日請輸入 1 到 31 的數字";

  const startDate = typeof input.startDate === "string" ? input.startDate.trim() : "";
  if (!isValidDate(startDate)) errors.startDate = "日期格式不正確，請重新選擇日期";

  let annualRate = 0;
  if (!blank(input.annualRate)) {
    const rate = Number(String(input.annualRate).trim().replace(/%$/, ""));
    if (!Number.isFinite(rate)) errors.annualRate = "年利率只能輸入數字";
    else if (rate < 0) errors.annualRate = "年利率不能是負數";
    else if (rate > 100) errors.annualRate = "年利率不能超過 100%";
    else annualRate = rate;
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > 200) errors.note = "備註請在 200 個字以內";

  if (Object.keys(errors).length > 0 || !original.ok || opening === null) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      creditor: creditor || null,
      originalPrincipal: original.value,
      openingPrincipal: opening,
      monthlyPayment: monthly,
      paymentDay: day,
      startDate,
      annualRate,
      note: note || null,
    },
  };
}
