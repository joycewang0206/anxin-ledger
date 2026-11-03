import { CUSTOM_CATEGORY_MAX, DEBT_CATEGORY, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./categories";
import { isValidDate } from "./dates";
import { parseAmount } from "./money";

export type EntryKind = "income" | "expense";

export interface EntryInput {
  date?: unknown;
  category?: unknown;
  customCategory?: unknown;
  amount?: unknown;
  note?: unknown;
}

export interface EntryData {
  date: string;
  category: string;
  amount: number;
  note: string | null;
}

export type FieldErrors = Partial<Record<"date" | "category" | "amount" | "note" | "form", string>>;

export type EntryResult = { ok: true; data: EntryData } | { ok: false; errors: FieldErrors };

export function validateEntry(kind: EntryKind, input: EntryInput): EntryResult {
  const errors: FieldErrors = {};

  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!isValidDate(date)) errors.date = "日期格式不正確，請重新選擇日期";

  const amount = parseAmount(input.amount, kind === "income" ? "收入金額" : "支出金額");
  if (!amount.ok) errors.amount = amount.error;

  let category = typeof input.category === "string" ? input.category.trim() : "";
  const allowed: readonly string[] = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (kind === "income" && category === "__custom__") {
    category = typeof input.customCategory === "string" ? input.customCategory.trim() : "";
    if (!category) errors.category = "請輸入收入項目名稱";
    else if (category.length > CUSTOM_CATEGORY_MAX) errors.category = `名稱請在 ${CUSTOM_CATEGORY_MAX} 個字以內`;
  } else if (!category) {
    errors.category = kind === "income" ? "請選擇收入項目" : "請選擇支出分類";
  } else if (kind === "expense" && category === DEBT_CATEGORY) {
    errors.category = "債務還款請到「債務管理」記錄";
  } else if (kind === "expense" && !allowed.includes(category)) {
    errors.category = "請從清單中選擇支出分類";
  }

  const noteRaw = typeof input.note === "string" ? input.note.trim() : "";
  if (noteRaw.length > 200) errors.note = "備註請在 200 個字以內";

  if (Object.keys(errors).length > 0 || !amount.ok) return { ok: false, errors };
  return { ok: true, data: { date, category, amount: amount.value, note: noteRaw || null } };
}

export function validateBudget(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const r = parseAmount(raw, "每月預算");
  return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
}
