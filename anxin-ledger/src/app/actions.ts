"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBackup } from "@/lib/backup";
import { todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { ServiceError } from "@/lib/db";
import { validateDebt } from "@/lib/debtInput";
import { isValidMonthKey } from "@/lib/dates";
import { validateBudget, validateEntry } from "@/lib/validation";
import { importBackup, previewImport, type ImportPlan } from "@/lib/services/backup";
import {
  createDebt,
  deleteDebt,
  deletePayment,
  markPaidOff,
  PaymentValidationError,
  recordPayment,
  updateDebt,
  updatePayment,
} from "@/lib/services/debts";
import {
  clearBudget,
  createExpense,
  createIncome,
  deleteExpense,
  deleteIncome,
  setBudget,
  updateExpense,
  updateIncome,
} from "@/lib/services/ledger";

export type FormState = { errors: Record<string, string>; values: Record<string, string> } | null;

const GENERIC = "儲存失敗，請稍後再試一次。你原本的資料沒有被改動。";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const message = (e: unknown) => (e instanceof ServiceError ? e.message : GENERIC);
const refresh = () => revalidatePath("/", "layout");

// ---------- 收入 / 支出 ----------

export async function saveEntryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const db = await getDb();
  const kind = str(fd, "kind") === "income" ? "income" : "expense";
  const id = str(fd, "id");
  const values = {
    kind,
    id,
    date: str(fd, "date"),
    category: str(fd, "category"),
    customCategory: str(fd, "customCategory"),
    amount: str(fd, "amount"),
    note: str(fd, "note"),
  };
  const v = validateEntry(kind, values);
  if (!v.ok) return { errors: v.errors as Record<string, string>, values };

  try {
    if (id) await (kind === "income" ? updateIncome(db, id, v.data) : updateExpense(db, id, v.data));
    else await (kind === "income" ? createIncome(db, v.data) : createExpense(db, v.data));
  } catch (e) {
    console.error("saveEntry failed", e);
    return { errors: { form: message(e) }, values };
  }
  refresh();
  const ym = v.data.date.slice(0, 7);
  redirect(id ? `/records?month=${ym}&saved=updated` : `/?month=${ym}&saved=${kind}`);
}

export async function removeEntryAction(fd: FormData): Promise<void> {
  const db = await getDb();
  const kind = str(fd, "kind") === "income" ? "income" : "expense";
  const id = str(fd, "id");
  const month = isValidMonthKey(str(fd, "month")) ? str(fd, "month") : todayStr().slice(0, 7);
  try {
    await (kind === "income" ? deleteIncome(db, id) : deleteExpense(db, id));
  } catch (e) {
    console.error("removeEntry failed", e);
    redirect(`/records?month=${month}&error=${encodeURIComponent(message(e))}`);
  }
  refresh();
  redirect(`/records?month=${month}&saved=deleted`);
}

// ---------- 預算 ----------

export async function saveBudgetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const db = await getDb();
  const month = str(fd, "month");
  const values = { month, amount: str(fd, "amount") };
  const v = validateBudget(values.amount);
  if (!v.ok) return { errors: { amount: v.error }, values };
  if (!isValidMonthKey(month)) return { errors: { form: "月份不正確" }, values };
  try {
    await setBudget(db, month, v.value);
  } catch (e) {
    console.error("saveBudget failed", e);
    return { errors: { form: GENERIC }, values };
  }
  refresh();
  redirect(`/settings?month=${month}&saved=budget`);
}

export async function clearBudgetAction(fd: FormData): Promise<void> {
  const db = await getDb();
  const month = str(fd, "month");
  if (isValidMonthKey(month)) await clearBudget(db, month);
  refresh();
  redirect(`/settings?month=${month}&saved=budget-cleared`);
}

// ---------- 債務 ----------

export async function saveDebtAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const db = await getDb();
  const id = str(fd, "id");
  const values = {
    id,
    name: str(fd, "name"),
    creditor: str(fd, "creditor"),
    originalPrincipal: str(fd, "originalPrincipal"),
    remainingPrincipal: str(fd, "remainingPrincipal"),
    monthlyPayment: str(fd, "monthlyPayment"),
    paymentDay: str(fd, "paymentDay"),
    startDate: str(fd, "startDate"),
    annualRate: str(fd, "annualRate"),
    note: str(fd, "note"),
  };
  const v = validateDebt(values);
  if (!v.ok) return { errors: v.errors as Record<string, string>, values };
  let target = "/debts";
  try {
    if (id) {
      await updateDebt(db, id, v.data, todayStr());
      target = `/debts/${id}`;
    } else {
      const created = await createDebt(db, v.data, todayStr());
      target = `/debts/${created.id}`;
    }
  } catch (e) {
    console.error("saveDebt failed", e);
    return { errors: { form: message(e) }, values };
  }
  refresh();
  redirect(`${target}?saved=debt`);
}

export async function removeDebtAction(fd: FormData): Promise<void> {
  const db = await getDb();
  const id = str(fd, "id");
  try {
    await deleteDebt(db, id);
  } catch (e) {
    console.error("removeDebt failed", e);
    redirect(`/debts/${id}?error=${encodeURIComponent(message(e))}`);
  }
  refresh();
  redirect("/debts?saved=deleted");
}

export async function settleDebtAction(fd: FormData): Promise<void> {
  const db = await getDb();
  const id = str(fd, "id");
  try {
    await markPaidOff(db, id, todayStr());
  } catch (e) {
    console.error("settleDebt failed", e);
    redirect(`/debts/${id}?error=${encodeURIComponent(message(e))}`);
  }
  refresh();
  redirect(`/debts/${id}?saved=settled`);
}

export async function savePaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const db = await getDb();
  const debtId = str(fd, "debtId");
  const paymentId = str(fd, "paymentId");
  const values = { debtId, paymentId, date: str(fd, "date"), amount: str(fd, "amount"), interest: str(fd, "interest"), fee: str(fd, "fee"), note: str(fd, "note") };
  try {
    if (paymentId) await updatePayment(db, paymentId, values, todayStr());
    else await recordPayment(db, debtId, values, todayStr());
  } catch (e) {
    if (e instanceof PaymentValidationError) return { errors: e.errors as Record<string, string>, values };
    console.error("savePayment failed", e);
    return { errors: { form: message(e) }, values };
  }
  refresh();
  redirect(`/debts/${debtId}?saved=payment&month=${values.date.slice(0, 7)}`);
}

export async function removePaymentAction(fd: FormData): Promise<void> {
  const db = await getDb();
  const debtId = str(fd, "debtId");
  const paymentId = str(fd, "paymentId");
  try {
    await deletePayment(db, paymentId, todayStr());
  } catch (e) {
    console.error("removePayment failed", e);
    redirect(`/debts/${debtId}?error=${encodeURIComponent(message(e))}`);
  }
  refresh();
  redirect(`/debts/${debtId}?saved=deleted`);
}

// ---------- 備份 ----------

export type BackupPreview = { ok: true; plan: ImportPlan } | { ok: false; errors: string[] };

export async function previewBackupAction(text: string): Promise<BackupPreview> {
  const db = await getDb();
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, plan: await previewImport(db, parsed.backup) };
  } catch (e) {
    console.error("previewBackup failed", e);
    return { ok: false, errors: ["讀取備份檔時發生問題，你的資料沒有被改動"] };
  }
}

export async function restoreBackupAction(text: string): Promise<BackupPreview> {
  const db = await getDb();
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  try {
    const plan = await importBackup(db, parsed.backup, todayStr());
    refresh();
    return { ok: true, plan };
  } catch (e) {
    console.error("restoreBackup failed", e);
    return { ok: false, errors: [e instanceof ServiceError ? e.message : "還原失敗，你原本的資料沒有被改動"] };
  }
}
