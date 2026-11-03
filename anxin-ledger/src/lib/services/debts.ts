import { type Client, fetchAll, ServiceError, unwrap } from "../db";
import type { DebtWithPayments } from "../debt";
import { computeRemaining, validatePayment } from "../debt";
import type { DebtData } from "../debtInput";
import { type PaymentRow, toDebt, toPayment } from "../rows";

type DebtFull = DebtWithPayments & { payments: PaymentRow[] };

const group = (payments: PaymentRow[]) => {
  const m = new Map<string, PaymentRow[]>();
  for (const p of payments) m.set(p.debtId, [...(m.get(p.debtId) ?? []), p]);
  return m;
};
const byDateThenCreated = (a: PaymentRow, b: PaymentRow) =>
  a.date.localeCompare(b.date) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

export async function listDebts(db: Client): Promise<DebtFull[]> {
  const [debts, payments] = await Promise.all([
    fetchAll((a, b) => db.from("debts").select("*").order("created_at").order("id").range(a, b)),
    fetchAll((a, b) => db.from("debt_payments").select("*").order("created_at").order("id").range(a, b)),
  ]);
  const byDebt = group(payments.map(toPayment));
  return debts.map((d) => ({ ...toDebt(d), payments: (byDebt.get(d.id) ?? []).sort(byDateThenCreated) }));
}

export async function getDebt(db: Client, id: string): Promise<DebtFull | null> {
  const d = unwrap(await db.from("debts").select("*").eq("id", id).maybeSingle());
  if (!d) return null;
  const payments = await fetchAll((a, b) => db.from("debt_payments").select("*").eq("debt_id", id).order("id").range(a, b));
  return { ...toDebt(d), payments: payments.map(toPayment).sort(byDateThenCreated) };
}

/** 新增債務：在資料庫函式內一次完成（含剩餘本金與狀態計算）。 */
export async function createDebt(db: Client, data: DebtData, today: string): Promise<{ id: string }> {
  const id = unwrap(await db.rpc("create_debt", { p: data, p_today: today })) as string;
  return { id };
}

export async function updateDebt(db: Client, id: string, data: DebtData, today: string): Promise<void> {
  unwrap(await db.rpc("update_debt", { p_id: id, p: data, p_today: today }));
}

export async function deleteDebt(db: Client, id: string): Promise<void> {
  unwrap(await db.rpc("delete_debt", { p_id: id }));
}

/** 標記已還清：把目前剩餘本金記為「已結清」，不會新增支出（若有實際還款，請用「我已經還款」）。 */
export async function markPaidOff(db: Client, id: string, today: string): Promise<void> {
  unwrap(await db.rpc("settle_debt", { p_id: id, p_today: today }));
}

export interface PaymentInput {
  date?: unknown;
  amount?: unknown;
  interest?: unknown;
  fee?: unknown;
  note?: unknown;
}

export type PaymentErrors = Partial<Record<"date" | "amount" | "interest" | "fee" | "form", string>>;

export class PaymentValidationError extends ServiceError {
  constructor(public errors: PaymentErrors) {
    super(Object.values(errors)[0] ?? "還款資料有誤");
  }
}

/** 記錄還款：欄位先在程式內檢查（才能對欄位顯示錯誤），再由資料庫函式在同一個交易內建立還款、對應的支出（一對一）並更新剩餘本金。 */
export async function recordPayment(db: Client, debtId: string, input: PaymentInput, today: string): Promise<{ id: string }> {
  const debt = await getDebt(db, debtId);
  if (!debt) throw new ServiceError("找不到這筆債務");
  if (debt.status === "PAID_OFF") throw new ServiceError("這筆債務已經還清了，不需要再記錄還款");
  const v = validatePayment(input, computeRemaining(debt, debt.payments));
  if (!v.ok) throw new PaymentValidationError(v.errors);
  const id = unwrap(await db.rpc("record_debt_payment", { p_debt: debtId, p: v.value, p_today: today })) as string;
  return { id };
}

export async function updatePayment(db: Client, paymentId: string, input: PaymentInput, today: string): Promise<void> {
  const existing = await getPayment(db, paymentId);
  if (!existing) throw new ServiceError("找不到這筆還款紀錄，可能已經被刪除");
  const debt = await getDebt(db, existing.debtId);
  if (!debt) throw new ServiceError("找不到這筆債務");
  const maxPrincipal = computeRemaining(debt, debt.payments.filter((p) => p.id !== paymentId));
  const v = validatePayment(input, maxPrincipal);
  if (!v.ok) throw new PaymentValidationError(v.errors);
  unwrap(await db.rpc("update_debt_payment", { p_id: paymentId, p: v.value, p_today: today }));
}

export async function deletePayment(db: Client, paymentId: string, today: string): Promise<void> {
  unwrap(await db.rpc("delete_debt_payment", { p_id: paymentId, p_today: today }));
}

export async function getPayment(db: Client, paymentId: string): Promise<(PaymentRow & { debt: DebtFull }) | null> {
  const r = unwrap(await db.from("debt_payments").select("*").eq("id", paymentId).maybeSingle());
  if (!r) return null;
  const debt = await getDebt(db, r.debt_id);
  if (!debt) return null;
  return { ...toPayment(r), debt };
}
