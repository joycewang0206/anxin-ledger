import { BACKUP_APP, BACKUP_SCHEMA_VERSION, type BackupData, type BackupFile, buildCsv } from "../backup";
import { type Client, fetchAll, ServiceError, unwrap } from "../db";

export async function exportBackup(db: Client, now: Date = new Date()): Promise<BackupFile> {
  // 每張表都分頁讀完（單次最多 1000 筆），並用固定排序，避免漏資料或重複
  const [incomes, expenses, budgets, debts, debtPayments] = await Promise.all([
    fetchAll((a, b) => db.from("incomes").select("*").order("date").order("created_at").order("id").range(a, b)),
    fetchAll((a, b) => db.from("expenses").select("*").order("date").order("created_at").order("id").range(a, b)),
    fetchAll((a, b) => db.from("monthly_budgets").select("year, month, amount").order("year").order("month").range(a, b)),
    fetchAll((a, b) => db.from("debts").select("*").order("created_at").order("id").range(a, b)),
    fetchAll((a, b) => db.from("debt_payments").select("*").order("date").order("created_at").order("id").range(a, b)),
  ]);
  return {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: {
      incomes: incomes.map((r) => ({ id: r.id, date: r.date, category: r.category, amount: r.amount, note: r.note ?? null })),
      expenses: expenses.map((r) => ({
        id: r.id,
        date: r.date,
        category: r.category,
        amount: r.amount,
        note: r.note ?? null,
        debtPaymentId: r.debt_payment_id ?? null,
      })),
      budgets: budgets.map((r) => ({ year: r.year, month: r.month, amount: r.amount })),
      debts: debts.map((r) => ({
        id: r.id,
        name: r.name,
        creditor: r.creditor ?? null,
        originalPrincipal: r.original_principal,
        openingPrincipal: r.opening_principal,
        adjustment: r.adjustment,
        monthlyPayment: r.monthly_payment ?? null,
        paymentDay: r.payment_day,
        startDate: r.start_date,
        annualRate: Number(r.annual_rate),
        note: r.note ?? null,
        paidOffDate: r.paid_off_date ?? null,
      })),
      debtPayments: debtPayments.map((r) => ({
        id: r.id,
        debtId: r.debt_id,
        date: r.date,
        amount: r.amount,
        principal: r.principal,
        interest: r.interest,
        fee: r.fee,
        note: r.note ?? null,
      })),
    },
  };
}

export async function exportCsv(db: Client): Promise<string> {
  const [incomes, expenses] = await Promise.all([
    fetchAll((a, b) => db.from("incomes").select("date, category, amount, note").order("id").range(a, b)),
    fetchAll((a, b) => db.from("expenses").select("date, category, amount, note").order("id").range(a, b)),
  ]);
  return buildCsv(incomes, expenses);
}

export interface ImportPlan {
  incomes: { total: number; add: number; skip: number };
  expenses: { total: number; add: number; skip: number };
  budgets: { total: number; add: number; skip: number };
  debts: { total: number; add: number; skip: number };
  debtPayments: { total: number; add: number; skip: number };
  /** 預覽時就能發現、會導致無法匯入的問題 */
  problems: string[];
}

interface Resolved {
  plan: ImportPlan;
  newData: BackupData;
}

/** 依「編號」與「年月」比對現有資料，已存在的一律略過（不覆蓋、不重複匯入）。 */
async function resolve(db: Client, backup: BackupFile): Promise<Resolved> {
  const d = backup.data;
  const [inIds, exIds, debtIds, payIds, budgets] = await Promise.all([
    fetchAll((x, y) => db.from("incomes").select("id").order("id").range(x, y)),
    fetchAll((x, y) => db.from("expenses").select("id, debt_payment_id").order("id").range(x, y)),
    fetchAll((x, y) => db.from("debts").select("id").order("id").range(x, y)),
    fetchAll((x, y) => db.from("debt_payments").select("id").order("id").range(x, y)),
    fetchAll((x, y) => db.from("monthly_budgets").select("year, month").order("year").order("month").range(x, y)),
  ]);
  const has = (rows: { id: unknown }[]) => new Set(rows.map((r) => String(r.id)));
  const incomeSet = has(inIds), expenseSet = has(exIds), debtSet = has(debtIds), paySet = has(payIds);
  const budgetSet = new Set(budgets.map((b) => `${b.year}-${b.month}`));

  const newData: BackupData = {
    incomes: d.incomes.filter((r) => !incomeSet.has(r.id)),
    expenses: d.expenses.filter((r) => !expenseSet.has(r.id)),
    budgets: d.budgets.filter((r) => !budgetSet.has(`${r.year}-${r.month}`)),
    debts: d.debts.filter((r) => !debtSet.has(r.id)),
    debtPayments: d.debtPayments.filter((r) => !paySet.has(r.id)),
  };

  const problems: string[] = [];
  const knownDebts = new Set([...debtSet, ...d.debts.map((x) => x.id)]);
  for (const p of newData.debtPayments) {
    if (!knownDebts.has(p.debtId)) problems.push("有還款紀錄找不到對應的債務");
  }
  const knownPayments = new Set([...paySet, ...d.debtPayments.map((x) => x.id)]);
  for (const e of newData.expenses) {
    if (e.debtPaymentId && !knownPayments.has(e.debtPaymentId)) problems.push("有債務還款支出找不到對應的還款紀錄");
  }
  // 一筆還款只能對應一筆支出
  const existingLinked = new Set(exIds.map((e) => e.debt_payment_id).filter((x): x is string => !!x));
  const linkSeen = new Set<string>();
  for (const e of newData.expenses) {
    if (!e.debtPaymentId) continue;
    if (existingLinked.has(e.debtPaymentId) || linkSeen.has(e.debtPaymentId)) problems.push("有還款紀錄對應到重複的支出");
    linkSeen.add(e.debtPaymentId);
  }

  const row = (all: unknown[], add: unknown[]) => ({ total: all.length, add: add.length, skip: all.length - add.length });
  return {
    newData,
    plan: {
      incomes: row(d.incomes, newData.incomes),
      expenses: row(d.expenses, newData.expenses),
      budgets: row(d.budgets, newData.budgets),
      debts: row(d.debts, newData.debts),
      debtPayments: row(d.debtPayments, newData.debtPayments),
      problems: [...new Set(problems)],
    },
  };
}

export async function previewImport(db: Client, backup: BackupFile): Promise<ImportPlan> {
  return (await resolve(db, backup)).plan;
}

/** 還原（合併）：只新增沒有的資料，絕不刪除或覆蓋現有紀錄；寫入由資料庫函式在同一個交易內完成。 */
export async function importBackup(db: Client, backup: BackupFile, today: string): Promise<ImportPlan> {
  const { plan, newData } = await resolve(db, backup);
  if (plan.problems.length > 0) throw new ServiceError(plan.problems[0]);
  unwrap(await db.rpc("import_backup_rows", { p: newData, p_today: today }));
  return plan;
}
