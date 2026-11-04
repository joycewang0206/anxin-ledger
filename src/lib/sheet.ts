import type { PaymentLike } from "./debt";

/** Excel 風格表格用的純計算函式：小計、總計、累計剩餘。不碰資料庫。 */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface SheetRecord {
  kind: "income" | "expense";
  amount: number;
  category: string;
}

export interface CategorySubtotal {
  category: string;
  total: number;
  count: number;
}

export interface LedgerTotals {
  income: number;
  expense: number;
  balance: number;
  incomeByCategory: CategorySubtotal[];
  expenseByCategory: CategorySubtotal[];
}

function subtotals(rows: SheetRecord[], order: readonly string[]): CategorySubtotal[] {
  const map = new Map<string, CategorySubtotal>();
  for (const r of rows) {
    const cur = map.get(r.category) ?? { category: r.category, total: 0, count: 0 };
    cur.total += r.amount;
    cur.count += 1;
    map.set(r.category, cur);
  }
  const rank = (c: string) => {
    const i = order.indexOf(c);
    return i === -1 ? order.length : i;
  };
  return [...map.values()].sort((a, b) => rank(a.category) - rank(b.category) || b.total - a.total || a.category.localeCompare(b.category));
}

/** 本月收入總計、支出總計、結餘，以及依分類的小計（常用分類在前，自訂分類在後）。 */
export function computeLedgerTotals(
  rows: SheetRecord[],
  order: { income: readonly string[]; expense: readonly string[] },
): LedgerTotals {
  const incomes = rows.filter((r) => r.kind === "income");
  const expenses = rows.filter((r) => r.kind === "expense");
  const income = sum(incomes.map((r) => r.amount));
  const expense = sum(expenses.map((r) => r.amount));
  return {
    income,
    expense,
    balance: income - expense,
    incomeByCategory: subtotals(incomes, order.income),
    expenseByCategory: subtotals(expenses, order.expense),
  };
}

/**
 * 每筆收支後的累計剩餘（本月累計：收入加、支出減；不含上個月結餘）。
 * 輸入必須已是由舊到新的順序。
 */
export function withRunningBalance<T extends { kind: "income" | "expense"; amount: number }>(rows: T[]): (T & { balance: number })[] {
  let acc = 0;
  return rows.map((r) => {
    acc += r.kind === "income" ? r.amount : -r.amount;
    return { ...r, balance: acc };
  });
}

export interface PaymentSubtotal {
  count: number;
  principal: number;
  interest: number;
  fee: number;
  total: number;
}

/** 一筆債務（或一組還款）的本金、利息、其他費用、還款總額小計。 */
export function paymentSubtotal(payments: Pick<PaymentLike, "principal" | "interest" | "fee" | "amount">[]): PaymentSubtotal {
  return {
    count: payments.length,
    principal: sum(payments.map((p) => p.principal)),
    interest: sum(payments.map((p) => p.interest)),
    fee: sum(payments.map((p) => p.fee)),
    total: sum(payments.map((p) => p.amount)),
  };
}

/** 本月（YYYY-MM）所有債務的還款總額、本金、利息、費用。 */
export function monthPaymentTotals(debts: { payments: PaymentLike[] }[], ym: string): PaymentSubtotal {
  return paymentSubtotal(debts.flatMap((d) => d.payments.filter((p) => p.date.startsWith(ym))));
}

/**
 * 還款紀錄逐筆顯示「還完後剩餘本金」：開始時剩餘本金 − 到這筆為止的本金合計（不低於 0）。
 * 輸入必須已是由舊到新的順序。每筆債務各自計算，互不影響。
 */
export function withRemainingAfter<P extends { principal: number }>(openingPrincipal: number, payments: P[]): (P & { remainingAfter: number })[] {
  let left = openingPrincipal;
  return payments.map((p) => {
    left = Math.max(0, left - p.principal);
    return { ...p, remainingAfter: left };
  });
}
