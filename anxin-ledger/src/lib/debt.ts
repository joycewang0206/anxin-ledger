import { addMonths, daysBetween, dueDateFor } from "./dates";
import { parseAmount, parseNonNegativeAmount } from "./money";
import { isValidDate } from "./dates";

export const DUE_SOON_DAYS = 3;
const MAX_PERIODS = 600;

export interface DebtLike {
  id: string;
  name: string;
  creditor?: string | null;
  originalPrincipal: number;
  openingPrincipal: number;
  remainingPrincipal: number;
  adjustment: number;
  monthlyPayment: number | null;
  paymentDay: number;
  startDate: string;
  annualRate: number;
  note?: string | null;
  status: string;
  paidOffDate: string | null;
}

export interface PaymentLike {
  id?: string;
  date: string;
  amount: number;
  principal: number;
  interest: number;
  fee: number;
  note?: string | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 剩餘本金 = 開始時的剩餘本金 − 已結清調整 − 所有還款的「本金」合計。利息與費用不會減少本金。 */
export function computeRemaining(debt: Pick<DebtLike, "openingPrincipal" | "adjustment">, payments: PaymentLike[]): number {
  return Math.max(0, debt.openingPrincipal - debt.adjustment - sum(payments.map((p) => p.principal)));
}

/** 已還本金 / 原始本金（無條件捨去，未還清時不會顯示 100%）。 */
export function progressPercent(original: number, remaining: number): number {
  if (original <= 0) return 0;
  if (remaining <= 0) return 100;
  return Math.min(99, Math.max(0, Math.floor(((original - remaining) / original) * 100)));
}

/** 每月利息估算（年利率 % ÷ 12，四捨五入）。僅供參考，實際以債權人為準。 */
export function estimateMonthlyInterest(remaining: number, annualRate: number): number {
  if (!(annualRate > 0) || remaining <= 0) return 0;
  return Math.round((remaining * annualRate) / 100 / 12);
}

export function paidInMonth(payments: PaymentLike[], ym: string): boolean {
  return payments.some((p) => p.date.startsWith(ym) && p.amount > 0);
}

export interface ProjectedRow {
  ym: string;
  dueDate: string;
  planned: number;
  principal: number;
  interest: number;
  remainingAfter: number;
}

export type Projection =
  | { kind: "paid"; payoffDate: string | null }
  | { kind: "no-payment" }
  | { kind: "insufficient"; monthlyInterest: number }
  | { kind: "too-long" }
  | { kind: "ok"; rows: ProjectedRow[]; periods: number; payoffYm: string; payoffDate: string; totalInterest: number };

/** 第一個尚未還款的預計月份。 */
function firstProjectedMonth(debt: DebtLike, payments: PaymentLike[], today: string): string {
  const curYm = today.slice(0, 7);
  let candidate = paidInMonth(payments, curYm) ? addMonths(curYm, 1) : curYm;
  const startYm = debt.startDate.slice(0, 7);
  if (startYm > candidate) candidate = startYm;
  if (candidate === startYm && debt.startDate > dueDateFor(candidate, debt.paymentDay)) candidate = addMonths(candidate, 1);
  return candidate;
}

/** 依剩餘本金、每月還款、年利率與還款日，動態估算還清時間。每次還款後重新計算。 */
export function projectPayoff(debt: DebtLike, payments: PaymentLike[], today: string): Projection {
  if (debt.status === "PAID_OFF" || debt.remainingPrincipal <= 0) {
    return { kind: "paid", payoffDate: debt.paidOffDate };
  }
  const pay = debt.monthlyPayment;
  if (!pay || pay <= 0) return { kind: "no-payment" };

  const firstInterest = estimateMonthlyInterest(debt.remainingPrincipal, debt.annualRate);
  if (debt.annualRate > 0 && pay <= firstInterest) return { kind: "insufficient", monthlyInterest: firstInterest };

  let remaining = debt.remainingPrincipal;
  let ym = firstProjectedMonth(debt, payments, today);
  const rows: ProjectedRow[] = [];
  let totalInterest = 0;

  while (remaining > 0) {
    if (rows.length >= MAX_PERIODS) return { kind: "too-long" };
    const interest = estimateMonthlyInterest(remaining, debt.annualRate);
    const principalRoom = pay - interest;
    if (principalRoom <= 0) return { kind: "insufficient", monthlyInterest: interest };
    const principal = Math.min(remaining, principalRoom);
    remaining -= principal;
    totalInterest += interest;
    rows.push({
      ym,
      dueDate: dueDateFor(ym, debt.paymentDay),
      planned: principal + interest,
      principal,
      interest,
      remainingAfter: remaining,
    });
    ym = addMonths(ym, 1);
  }

  const last = rows[rows.length - 1];
  return { kind: "ok", rows, periods: rows.length, payoffYm: last.ym, payoffDate: last.dueDate, totalInterest };
}

export type DueState = "soon" | "today" | "overdue";

/** 這個月的還款狀態；只看使用者實際記錄的還款，不會因為日期到了就假設已還款。 */
export function dueState(debt: DebtLike, payments: PaymentLike[], today: string): DueState | null {
  if (debt.status !== "ACTIVE" || debt.remainingPrincipal <= 0) return null;
  const curYm = today.slice(0, 7);
  if (debt.startDate.slice(0, 7) > curYm) return null;
  const due = dueDateFor(curYm, debt.paymentDay);
  if (debt.startDate.slice(0, 7) === curYm && debt.startDate > due) return null;
  if (paidInMonth(payments, curYm)) return null;
  const diff = daysBetween(today, due);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= DUE_SOON_DAYS) return "soon";
  return null;
}

export type ScheduleStatus = "done" | "pending" | "due-today" | "overdue";

export interface ScheduleRow {
  ym: string;
  dueDate: string;
  planned: number | null;
  actual: number | null;
  status: ScheduleStatus;
  remainingAfter: number;
}

/** 還款時間表：已記錄的月份（實際金額）＋ 之後的預計月份。 */
export function buildSchedule(debt: DebtLike, payments: PaymentLike[], today: string): ScheduleRow[] {
  const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  const byMonth = new Map<string, { actual: number; remainingAfter: number }>();
  let running = debt.openingPrincipal;
  for (const p of sorted) {
    running -= p.principal;
    const ym = p.date.slice(0, 7);
    const prev = byMonth.get(ym);
    byMonth.set(ym, { actual: (prev?.actual ?? 0) + p.amount, remainingAfter: Math.max(0, running) });
  }

  const rows: ScheduleRow[] = [...byMonth.entries()].map(([ym, v]) => ({
    ym,
    dueDate: dueDateFor(ym, debt.paymentDay),
    planned: debt.monthlyPayment,
    actual: v.actual,
    status: "done" as const,
    remainingAfter: v.remainingAfter,
  }));

  const projection = projectPayoff(debt, payments, today);
  if (projection.kind === "ok") {
    for (const r of projection.rows) {
      let status: ScheduleStatus = "pending";
      if (r.ym === today.slice(0, 7)) {
        const diff = daysBetween(today, r.dueDate);
        status = diff < 0 ? "overdue" : diff === 0 ? "due-today" : "pending";
      }
      rows.push({ ym: r.ym, dueDate: r.dueDate, planned: r.planned, actual: null, status, remainingAfter: r.remainingAfter });
    }
  }
  return rows.sort((a, b) => a.ym.localeCompare(b.ym));
}

export interface PaymentSplit {
  amount: number;
  principal: number;
  interest: number;
  fee: number;
}

export type PaymentValidation =
  | { ok: true; value: PaymentSplit & { date: string; note: string | null } }
  | { ok: false; errors: Partial<Record<"date" | "amount" | "interest" | "fee" | "form", string>> };

/**
 * 驗證一筆還款。principal 由「實際還款金額 − 利息 − 其他費用」自動算出，三者加總必定等於實際還款金額。
 * maxPrincipal 是這筆還款最多能還的本金（目前剩餘本金；修改既有還款時要先把該筆本金加回來）。
 */
export function validatePayment(
  input: { date?: unknown; amount?: unknown; interest?: unknown; fee?: unknown; note?: unknown },
  maxPrincipal: number,
): PaymentValidation {
  const errors: Partial<Record<"date" | "amount" | "interest" | "fee" | "form", string>> = {};
  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!isValidDate(date)) errors.date = "日期格式不正確，請重新選擇日期";

  const amount = parseAmount(input.amount, "還款金額");
  if (!amount.ok) errors.amount = amount.error;
  const interest = parseNonNegativeAmount(input.interest, "利息");
  if (!interest.ok) errors.interest = interest.error;
  const fee = parseNonNegativeAmount(input.fee, "其他費用");
  if (!fee.ok) errors.fee = fee.error;

  if (amount.ok && interest.ok && fee.ok) {
    const principal = amount.value - interest.value - fee.value;
    if (principal < 0) errors.form = "利息加其他費用，不能超過還款金額";
    else if (principal > maxPrincipal) {
      errors.amount = `這筆還款的本金（${principal.toLocaleString("en-US")} 元）超過剩餘本金（${maxPrincipal.toLocaleString("en-US")} 元），請確認金額或利息`;
    }
    if (Object.keys(errors).length === 0) {
      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (note.length > 200) {
        return { ok: false, errors: { form: "備註請在 200 個字以內" } };
      }
      return {
        ok: true,
        value: { date, amount: amount.value, principal, interest: interest.value, fee: fee.value, note: note || null },
      };
    }
  }
  return { ok: false, errors };
}

export interface DebtWithPayments extends DebtLike {
  payments: PaymentLike[];
}

export interface DebtOverview {
  count: number;
  activeCount: number;
  originalTotal: number;
  repaidTotal: number;
  remainingTotal: number;
  progress: number;
  monthlyTotal: number;
  interestPaidTotal: number;
  feePaidTotal: number;
  /** 全部還清的預計月份；無法計算時為 null，原因見 payoffNote */
  payoffYm: string | null;
  payoffNote: "all-paid" | "no-payment" | "insufficient" | "too-long" | "none" | null;
  remainingPeriods: number | null;
}

export function computeDebtOverview(debts: DebtWithPayments[], today: string): DebtOverview {
  const originalTotal = sum(debts.map((d) => d.originalPrincipal));
  const remainingTotal = sum(debts.map((d) => d.remainingPrincipal));
  const active = debts.filter((d) => d.status === "ACTIVE" && d.remainingPrincipal > 0);

  let payoffYm: string | null = null;
  let payoffNote: DebtOverview["payoffNote"] = null;
  let remainingPeriods: number | null = null;

  if (debts.length === 0) payoffNote = "none";
  else if (active.length === 0) payoffNote = "all-paid";
  else {
    const projections = active.map((d) => projectPayoff(d, d.payments, today));
    const bad = projections.find((p) => p.kind !== "ok");
    if (bad) {
      payoffNote = bad.kind === "no-payment" ? "no-payment" : bad.kind === "insufficient" ? "insufficient" : "too-long";
    } else {
      const oks = projections.filter((p): p is Extract<Projection, { kind: "ok" }> => p.kind === "ok");
      payoffYm = oks.map((p) => p.payoffYm).sort().pop() ?? null;
      remainingPeriods = Math.max(...oks.map((p) => p.periods));
    }
  }

  return {
    count: debts.length,
    activeCount: active.length,
    originalTotal,
    repaidTotal: originalTotal - remainingTotal,
    remainingTotal,
    progress: progressPercent(originalTotal, remainingTotal),
    monthlyTotal: sum(active.map((d) => d.monthlyPayment ?? 0)),
    interestPaidTotal: sum(debts.flatMap((d) => d.payments.map((p) => p.interest))),
    feePaidTotal: sum(debts.flatMap((d) => d.payments.map((p) => p.fee))),
    payoffYm,
    payoffNote,
    remainingPeriods,
  };
}

export interface DebtAlert {
  debtId: string;
  name: string;
  kind: "soon" | "today" | "overdue" | "paid";
  dueDate?: string;
  amount?: number | null;
  paidOffDate?: string | null;
}

const PAID_BANNER_DAYS = 7;

export function computeDebtAlerts(debts: DebtWithPayments[], today: string): DebtAlert[] {
  const alerts: DebtAlert[] = [];
  const curYm = today.slice(0, 7);
  for (const d of debts) {
    const state = dueState(d, d.payments, today);
    if (state) {
      alerts.push({ debtId: d.id, name: d.name, kind: state, dueDate: dueDateFor(curYm, d.paymentDay), amount: d.monthlyPayment });
    } else if (d.status === "PAID_OFF" && d.paidOffDate && daysBetween(d.paidOffDate, today) <= PAID_BANNER_DAYS && daysBetween(d.paidOffDate, today) >= 0) {
      alerts.push({ debtId: d.id, name: d.name, kind: "paid", paidOffDate: d.paidOffDate });
    }
  }
  const order = { overdue: 0, today: 1, soon: 2, paid: 3 } as const;
  return alerts.sort((a, b) => order[a.kind] - order[b.kind]);
}
