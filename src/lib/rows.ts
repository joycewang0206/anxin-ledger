import type { DebtLike, PaymentLike } from "./debt";

/** 資料庫欄位（snake_case）轉成程式內使用的格式（camelCase）。 */

export interface IncomeRow {
  id: string;
  date: string;
  category: string;
  amount: number;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
}
export interface ExpenseRow extends IncomeRow {
  debtPaymentId: string | null;
}
export interface DebtRow extends DebtLike {
  creditor: string | null;
  note: string | null;
  createdAt: Date;
}
export interface PaymentRow extends PaymentLike {
  id: string;
  debtId: string;
  note: string | null;
  createdAt: Date;
}

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const toIncome = (r: R): IncomeRow => ({
  id: r.id, date: r.date, category: r.category, amount: r.amount, note: r.note ?? null, createdBy: r.created_by ?? null, createdAt: new Date(r.created_at),
});
export const toExpense = (r: R): ExpenseRow => ({ ...toIncome(r), debtPaymentId: r.debt_payment_id ?? null });
export const toDebt = (r: R): DebtRow => ({
  id: r.id,
  name: r.name,
  creditor: r.creditor ?? null,
  originalPrincipal: r.original_principal,
  openingPrincipal: r.opening_principal,
  remainingPrincipal: r.remaining_principal,
  adjustment: r.adjustment,
  monthlyPayment: r.monthly_payment ?? null,
  paymentDay: r.payment_day,
  startDate: r.start_date,
  annualRate: Number(r.annual_rate),
  note: r.note ?? null,
  status: r.status,
  paidOffDate: r.paid_off_date ?? null,
  createdAt: new Date(r.created_at),
});
export const toPayment = (r: R): PaymentRow => ({
  id: r.id, debtId: r.debt_id, date: r.date, amount: r.amount, principal: r.principal, interest: r.interest, fee: r.fee,
  note: r.note ?? null, createdAt: new Date(r.created_at),
});
