import { isValidDate } from "./dates";

export const BACKUP_APP = "anxin-ledger";
export const BACKUP_SCHEMA_VERSION = 2;

export interface BackupIncome { id: string; date: string; category: string; amount: number; note: string | null }
export interface BackupExpense extends BackupIncome { debtPaymentId: string | null }
export interface BackupBudget { year: number; month: number; amount: number }
export interface BackupDebt {
  id: string;
  name: string;
  creditor: string | null;
  originalPrincipal: number;
  openingPrincipal: number;
  adjustment: number;
  monthlyPayment: number | null;
  paymentDay: number;
  startDate: string;
  annualRate: number;
  note: string | null;
  paidOffDate: string | null;
}
export interface BackupDebtPayment {
  id: string;
  debtId: string;
  date: string;
  amount: number;
  principal: number;
  interest: number;
  fee: number;
  note: string | null;
}

export interface BackupData {
  incomes: BackupIncome[];
  expenses: BackupExpense[];
  budgets: BackupBudget[];
  debts: BackupDebt[];
  debtPayments: BackupDebtPayment[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isPosInt = (v: unknown): v is number => isNonNegInt(v) && v > 0;
const optStr = (v: unknown): v is string | null | undefined => v === null || v === undefined || typeof v === "string";

export type ParseBackup = { ok: true; backup: BackupFile } | { ok: false; errors: string[] };

const MAX_ERRORS = 8;

/** 解析並驗證備份檔內容。任何一筆資料有問題就整份拒絕，避免匯入一半。 */
export function parseBackup(text: string): ParseBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["檔案內容不是正確的備份檔（JSON 格式錯誤）"] };
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP || !isObj(raw.data)) {
    return { ok: false, errors: ["這不是「安心記帳本」的備份檔"] };
  }
  const version = raw.schemaVersion;
  if (typeof version !== "number" || version < 1 || version > BACKUP_SCHEMA_VERSION) {
    return { ok: false, errors: ["備份檔版本不支援，請使用較新版本的安心記帳本開啟"] };
  }

  const errors: string[] = [];
  const fail = (msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(msg);
  };
  const arr = (key: string): unknown[] => {
    const v = (raw.data as Obj)[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      fail(`備份檔的「${key}」格式不正確`);
      return [];
    }
    return v;
  };

  const seen = new Set<string>();
  const unique = (kind: string, id: string, i: number) => {
    const k = `${kind}:${id}`;
    if (seen.has(k)) fail(`${kind}第 ${i + 1} 筆的編號重複`);
    seen.add(k);
  };

  const incomes: BackupIncome[] = [];
  arr("incomes").forEach((r, i) => {
    if (!isObj(r) || !isStr(r.id) || !isValidDate(r.date) || !isStr(r.category) || !isPosInt(r.amount) || !optStr(r.note)) {
      return fail(`收入第 ${i + 1} 筆資料不完整或金額不正確`);
    }
    unique("收入", r.id, i);
    incomes.push({ id: r.id, date: r.date, category: r.category, amount: r.amount, note: (r.note as string | null | undefined) ?? null });
  });

  const expenses: BackupExpense[] = [];
  arr("expenses").forEach((r, i) => {
    if (!isObj(r) || !isStr(r.id) || !isValidDate(r.date) || !isStr(r.category) || !isPosInt(r.amount) || !optStr(r.note) || !optStr(r.debtPaymentId)) {
      return fail(`支出第 ${i + 1} 筆資料不完整或金額不正確`);
    }
    unique("支出", r.id, i);
    expenses.push({
      id: r.id,
      date: r.date,
      category: r.category,
      amount: r.amount,
      note: (r.note as string | null | undefined) ?? null,
      debtPaymentId: (r.debtPaymentId as string | null | undefined) || null,
    });
  });

  const budgets: BackupBudget[] = [];
  arr("budgets").forEach((r, i) => {
    if (!isObj(r) || !isPosInt(r.year) || !isPosInt(r.month) || r.month > 12 || !isPosInt(r.amount)) {
      return fail(`預算第 ${i + 1} 筆資料不正確`);
    }
    unique("預算", `${r.year}-${r.month}`, i);
    budgets.push({ year: r.year, month: r.month, amount: r.amount });
  });

  const debts: BackupDebt[] = [];
  arr("debts").forEach((r, i) => {
    if (
      !isObj(r) || !isStr(r.id) || !isStr(r.name) || !isPosInt(r.originalPrincipal) || !isNonNegInt(r.openingPrincipal) ||
      r.openingPrincipal > r.originalPrincipal || !isNonNegInt(r.adjustment ?? 0) || !isValidDate(r.startDate) ||
      !isPosInt(r.paymentDay) || r.paymentDay > 31 || typeof (r.annualRate ?? 0) !== "number" ||
      (r.monthlyPayment !== null && r.monthlyPayment !== undefined && !isPosInt(r.monthlyPayment)) ||
      !optStr(r.creditor) || !optStr(r.note) || !optStr(r.paidOffDate)
    ) {
      return fail(`債務第 ${i + 1} 筆資料不完整或金額不正確`);
    }
    unique("債務", r.id, i);
    debts.push({
      id: r.id,
      name: r.name,
      creditor: (r.creditor as string | null | undefined) ?? null,
      originalPrincipal: r.originalPrincipal,
      openingPrincipal: r.openingPrincipal,
      adjustment: (r.adjustment as number | undefined) ?? 0,
      monthlyPayment: (r.monthlyPayment as number | null | undefined) ?? null,
      paymentDay: r.paymentDay,
      startDate: r.startDate,
      annualRate: (r.annualRate as number | undefined) ?? 0,
      note: (r.note as string | null | undefined) ?? null,
      paidOffDate: (r.paidOffDate as string | null | undefined) ?? null,
    });
  });

  const debtPayments: BackupDebtPayment[] = [];
  arr("debtPayments").forEach((r, i) => {
    if (
      !isObj(r) || !isStr(r.id) || !isStr(r.debtId) || !isValidDate(r.date) || !isPosInt(r.amount) || !isNonNegInt(r.principal) ||
      !isNonNegInt(r.interest ?? 0) || !isNonNegInt(r.fee ?? 0) || !optStr(r.note)
    ) {
      return fail(`還款紀錄第 ${i + 1} 筆資料不完整或金額不正確`);
    }
    const interest = (r.interest as number | undefined) ?? 0;
    const fee = (r.fee as number | undefined) ?? 0;
    if (r.principal + interest + fee !== r.amount) return fail(`還款紀錄第 ${i + 1} 筆的本金、利息、費用加起來不等於還款金額`);
    unique("還款紀錄", r.id, i);
    debtPayments.push({
      id: r.id,
      debtId: r.debtId,
      date: r.date,
      amount: r.amount,
      principal: r.principal,
      interest,
      fee,
      note: (r.note as string | null | undefined) ?? null,
    });
  });

  if (errors.length === 0) {
    const debtIds = new Set(debts.map((d) => d.id));
    debtPayments.forEach((p, i) => {
      if (!debtIds.has(p.debtId)) fail(`還款紀錄第 ${i + 1} 筆找不到對應的債務`);
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      schemaVersion: version,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
      data: { incomes, expenses, budgets, debts, debtPayments },
    },
  };
}

// ---------- CSV ----------

function csvCell(v: string | number): string {
  let s = String(v);
  // 避免在 Excel 中被當成公式執行
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(
  incomes: { date: string; category: string; amount: number; note: string | null }[],
  expenses: { date: string; category: string; amount: number; note: string | null }[],
): string {
  const rows = [
    ...incomes.map((r) => ({ kind: "收入", ...r })),
    ...expenses.map((r) => ({ kind: "支出", ...r })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  const lines = ["類型,日期,項目,金額,備註", ...rows.map((r) => [r.kind, r.date, r.category, r.amount, r.note ?? ""].map(csvCell).join(","))];
  // 加上 BOM，讓 Excel 正確顯示中文
  return `﻿${lines.join("\r\n")}\r\n`;
}
