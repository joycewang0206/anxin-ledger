import { DEBT_CATEGORY } from "./categories";

export interface AmountRecord {
  amount: number;
  category: string;
}

export interface MonthSummary {
  income: number;
  expense: number;
  /** 收入 − 支出（含債務還款） */
  balance: number;
  /** 生活支出（不含債務還款） */
  livingExpense: number;
  debtPayment: number;
  budget: number | null;
  budgetRemaining: number | null;
  /** 支出 ÷ 預算 × 100，未設定預算為 null */
  usagePercent: number | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeMonthSummary(
  incomes: AmountRecord[],
  expenses: AmountRecord[],
  budget: number | null,
): MonthSummary {
  const income = sum(incomes.map((i) => i.amount));
  const expense = sum(expenses.map((e) => e.amount));
  const debtPayment = sum(expenses.filter((e) => e.category === DEBT_CATEGORY).map((e) => e.amount));
  const hasBudget = budget !== null && budget > 0;
  return {
    income,
    expense,
    balance: income - expense,
    livingExpense: expense - debtPayment,
    debtPayment,
    budget: hasBudget ? budget : null,
    budgetRemaining: hasBudget ? budget - expense : null,
    usagePercent: hasBudget ? (expense / budget) * 100 : null,
  };
}

export type BudgetLevel = "near" | "used" | "over";

export interface LedgerAlert {
  month: string;
  budget: null | {
    level: BudgetLevel;
    percent: number;
    budget: number;
    expense: number;
    remaining: number;
    overAmount: number;
  };
  income: null | { income: number; expense: number; overAmount: number };
}

/**
 * 提醒 A（預算）與提醒 B（支出超過收入）。
 * 完全由實際資料計算；兩者同時成立時合併成同一個結果，畫面只會顯示一個視窗。
 */
export function computeLedgerAlert(month: string, s: MonthSummary): LedgerAlert | null {
  let budgetAlert: LedgerAlert["budget"] = null;
  if (s.budget !== null) {
    const e = s.expense;
    const b = s.budget;
    let level: BudgetLevel | null = null;
    if (e > b) level = "over";
    else if (e === b) level = "used";
    else if (e * 100 >= b * 80) level = "near";
    if (level) {
      budgetAlert = {
        level,
        percent: Math.floor((e / b) * 100),
        budget: b,
        expense: e,
        remaining: Math.max(b - e, 0),
        overAmount: Math.max(e - b, 0),
      };
    }
  }
  const incomeAlert: LedgerAlert["income"] =
    s.expense > s.income ? { income: s.income, expense: s.expense, overAmount: s.expense - s.income } : null;

  if (!budgetAlert && !incomeAlert) return null;
  return { month, budget: budgetAlert, income: incomeAlert };
}

export function compareMonths(current: MonthSummary, previous: MonthSummary) {
  return {
    incomeDiff: current.income - previous.income,
    expenseDiff: current.expense - previous.expense,
    balanceDiff: current.balance - previous.balance,
  };
}

export function categoryTotals(expenses: AmountRecord[]): { category: string; total: number; percent: number }[] {
  const map = new Map<string, number>();
  for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  const total = sum([...map.values()]);
  return [...map.entries()]
    .map(([category, t]) => ({ category, total: t, percent: total > 0 ? Math.round((t / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}
