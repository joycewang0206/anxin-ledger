import { DEBT_CATEGORY } from "../categories";
import { monthRange, parseMonthKey, prevMonthKey } from "../dates";
import { type Client, DEBT_LOCKED_MESSAGE, fetchAll, ServiceError, unwrap } from "../db";
import { computeMonthSummary, type MonthSummary } from "../ledger";
import { type ExpenseRow, type IncomeRow, toExpense, toIncome } from "../rows";
import type { EntryData } from "../validation";

export { DEBT_LOCKED_MESSAGE };

export type RecordKind = "income" | "expense";

export interface RecordRow {
  id: string;
  kind: RecordKind;
  date: string;
  category: string;
  amount: number;
  note: string | null;
  createdBy: string | null;
  debtPaymentId: string | null;
  debtId?: string | null;
}

export async function getBudget(db: Client, ym: string): Promise<number | null> {
  const { year, month } = parseMonthKey(ym);
  const row = unwrap(await db.from("monthly_budgets").select("amount").eq("year", year).eq("month", month).maybeSingle());
  return row?.amount ?? null;
}

export async function setBudget(db: Client, ym: string, amount: number): Promise<void> {
  const { year, month } = parseMonthKey(ym);
  unwrap(await db.rpc("set_budget", { p_year: year, p_month: month, p_amount: amount }));
}

export async function clearBudget(db: Client, ym: string): Promise<void> {
  const { year, month } = parseMonthKey(ym);
  unwrap(await db.from("monthly_budgets").delete().eq("year", year).eq("month", month));
}

export async function getMonthSummary(db: Client, ym: string): Promise<MonthSummary> {
  const { start, end } = monthRange(ym);
  const [incomes, expenses, budget] = await Promise.all([
    fetchAll((a, b) => db.from("incomes").select("amount, category").gte("date", start).lte("date", end).order("id").range(a, b)),
    fetchAll((a, b) => db.from("expenses").select("amount, category").gte("date", start).lte("date", end).order("id").range(a, b)),
    getBudget(db, ym),
  ]);
  return computeMonthSummary(incomes, expenses, budget);
}

export async function getPreviousSummary(db: Client, ym: string): Promise<MonthSummary> {
  return getMonthSummary(db, prevMonthKey(ym));
}

export async function listRecords(
  db: Client,
  opts: { month: string; kind?: RecordKind | "all"; category?: string },
): Promise<RecordRow[]> {
  const { start, end } = monthRange(opts.month);
  const kind = opts.kind ?? "all";
  const [incomes, expenses] = await Promise.all([
    kind === "expense"
      ? []
      : fetchAll((a, b) => {
          let q = db.from("incomes").select("*").gte("date", start).lte("date", end);
          if (opts.category) q = q.eq("category", opts.category);
          return q.order("id").range(a, b);
        }),
    kind === "income"
      ? []
      : fetchAll((a, b) => {
          let q = db.from("expenses").select("*, debt_payments(debt_id)").gte("date", start).lte("date", end);
          if (opts.category) q = q.eq("category", opts.category);
          return q.order("id").range(a, b);
        }),
  ]);
  const rows: (RecordRow & { createdAt: Date })[] = [
    ...incomes.map((r) => {
      const i = toIncome(r);
      return { id: i.id, kind: "income" as const, date: i.date, category: i.category, amount: i.amount, note: i.note, createdBy: i.createdBy, debtPaymentId: null, createdAt: i.createdAt };
    }),
    ...expenses.map((r) => {
      const e = toExpense(r);
      const pay = r.debt_payments as { debt_id: string } | null;
      return {
        id: e.id, kind: "expense" as const, date: e.date, category: e.category, amount: e.amount, note: e.note, createdBy: e.createdBy,
        debtPaymentId: e.debtPaymentId, debtId: pay?.debt_id ?? null, createdAt: e.createdAt,
      };
    }),
  ];
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  return rows.map((r) => {
    const { createdAt: _createdAt, ...rest } = r;
    void _createdAt;
    return rest;
  });
}

export async function recentRecords(db: Client, ym: string, limit = 5): Promise<RecordRow[]> {
  return (await listRecords(db, { month: ym })).slice(0, limit);
}

export async function listCategories(db: Client, ym: string): Promise<string[]> {
  const { start, end } = monthRange(ym);
  const [i, e] = await Promise.all([
    fetchAll((a, b) => db.from("incomes").select("category").gte("date", start).lte("date", end).order("id").range(a, b)),
    fetchAll((a, b) => db.from("expenses").select("category").gte("date", start).lte("date", end).order("id").range(a, b)),
  ]);
  return [...new Set([...i.map((x) => x.category as string), ...e.map((x) => x.category as string)])];
}

export async function createIncome(db: Client, data: EntryData): Promise<IncomeRow> {
  return toIncome(unwrap(await db.from("incomes").insert(data).select().single()));
}

export async function createExpense(db: Client, data: EntryData): Promise<ExpenseRow> {
  if (data.category === DEBT_CATEGORY) throw new ServiceError("債務還款請到「債務管理」記錄");
  return toExpense(unwrap(await db.from("expenses").insert(data).select().single()));
}

export async function getIncome(db: Client, id: string): Promise<IncomeRow | null> {
  const r = unwrap(await db.from("incomes").select("*").eq("id", id).maybeSingle());
  return r ? toIncome(r) : null;
}
export async function getExpense(db: Client, id: string): Promise<ExpenseRow | null> {
  const r = unwrap(await db.from("expenses").select("*").eq("id", id).maybeSingle());
  return r ? toExpense(r) : null;
}

export async function updateIncome(db: Client, id: string, data: EntryData): Promise<IncomeRow> {
  const r = unwrap(await db.from("incomes").update(data).eq("id", id).select().maybeSingle());
  if (!r) throw new ServiceError("找不到這筆收入，可能已經被刪除");
  return toIncome(r);
}

export async function updateExpense(db: Client, id: string, data: EntryData): Promise<ExpenseRow> {
  const found = await getExpense(db, id);
  if (!found) throw new ServiceError("找不到這筆支出，可能已經被刪除");
  if (found.debtPaymentId) throw new ServiceError(DEBT_LOCKED_MESSAGE);
  if (data.category === DEBT_CATEGORY) throw new ServiceError("債務還款請到「債務管理」記錄");
  const r = unwrap(await db.from("expenses").update(data).eq("id", id).select().maybeSingle());
  if (!r) throw new ServiceError("找不到這筆支出，可能已經被刪除");
  return toExpense(r);
}

export async function deleteIncome(db: Client, id: string): Promise<IncomeRow> {
  const found = await getIncome(db, id);
  if (!found) throw new ServiceError("找不到這筆收入，可能已經被刪除");
  unwrap(await db.from("incomes").delete().eq("id", id));
  return found;
}

export async function deleteExpense(db: Client, id: string): Promise<ExpenseRow> {
  const found = await getExpense(db, id);
  if (!found) throw new ServiceError("找不到這筆支出，可能已經被刪除");
  if (found.debtPaymentId) throw new ServiceError(DEBT_LOCKED_MESSAGE);
  unwrap(await db.from("expenses").delete().eq("id", id));
  return found;
}

export type { Client as Db };
