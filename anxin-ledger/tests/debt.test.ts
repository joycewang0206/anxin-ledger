import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAlertModal } from "@/lib/alerts";
import { parseBackup } from "@/lib/backup";
import {
  buildSchedule,
  computeDebtAlerts,
  computeDebtOverview,
  dueState,
  estimateMonthlyInterest,
  progressPercent,
  projectPayoff,
  validatePayment,
  type DebtLike,
} from "@/lib/debt";
import { validateDebt } from "@/lib/debtInput";
import { exportBackup, importBackup } from "@/lib/services/backup";
import {
  createDebt,
  deleteDebt,
  deletePayment,
  getDebt,
  listDebts,
  markPaidOff,
  recordPayment,
  updatePayment,
} from "@/lib/services/debts";
import { createExpense, createIncome, deleteExpense, getMonthSummary, listRecords, updateExpense } from "@/lib/services/ledger";
import { allExpenses, count, createTestDb, entry, expenseByPayment, type TestDb } from "./helpers";

const TODAY = "2026-11-02";
let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.cleanup();
});

const debtData = (over: Record<string, unknown> = {}) => {
  const r = validateDebt({
    name: "銀行貸款",
    creditor: "某銀行",
    originalPrincipal: "200000",
    remainingPrincipal: "",
    monthlyPayment: "5000",
    paymentDay: "15",
    startDate: "2026-01-01",
    annualRate: "",
    note: "",
    ...over,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
};

const like = (over: Partial<DebtLike> = {}): DebtLike => ({
  id: "d1",
  name: "測試",
  originalPrincipal: 300000,
  openingPrincipal: 180000,
  remainingPrincipal: 180000,
  adjustment: 0,
  monthlyPayment: 5000,
  paymentDay: 15,
  startDate: "2026-01-01",
  annualRate: 0,
  status: "ACTIVE",
  paidOffDate: null,
  ...over,
});

describe("債務資料", () => {
  it("1. 新增債務成功（預設剩餘本金 = 原始本金、利率 0%）", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    const found = await getDebt(t.db, d.id);
    expect(found).toMatchObject({ name: "銀行貸款", originalPrincipal: 200000, remainingPrincipal: 200000, annualRate: 0, status: "ACTIVE" });
  });

  it("新增債務的輸入驗證", () => {
    expect(validateDebt({ name: "", originalPrincipal: "100", paymentDay: "1", startDate: "2026-01-01" })).toMatchObject({ ok: false });
    expect(validateDebt({ name: "a", originalPrincipal: "100", remainingPrincipal: "200", paymentDay: "1", startDate: "2026-01-01" })).toMatchObject({
      ok: false,
      errors: { remainingPrincipal: expect.any(String) },
    });
    expect(validateDebt({ name: "a", originalPrincipal: "100", paymentDay: "32", startDate: "2026-01-01" })).toMatchObject({
      ok: false,
      errors: { paymentDay: expect.any(String) },
    });
    expect(validateDebt({ name: "a", originalPrincipal: "100", paymentDay: "5", startDate: "2026-01-01", annualRate: "-1" })).toMatchObject({ ok: false });
  });
});

describe("計算", () => {
  it("3. 還款進度正確", () => {
    expect(progressPercent(300000, 180000)).toBe(40);
    expect(progressPercent(300000, 300000)).toBe(0);
    expect(progressPercent(300000, 0)).toBe(100);
    expect(progressPercent(300000, 1)).toBe(99); // 還沒還清不會顯示 100%
  });

  it("4. 無利率還清日期正確（剩餘 180,000、每月 5,000 → 36 期，2029 年 10 月）", () => {
    const p = projectPayoff(like(), [], TODAY);
    expect(p.kind).toBe("ok");
    if (p.kind !== "ok") return;
    expect(p.periods).toBe(Math.ceil(180000 / 5000));
    expect(p.periods).toBe(36);
    expect(p.payoffYm).toBe("2029-10");
    expect(p.payoffDate).toBe("2029-10-15");
    expect(p.totalInterest).toBe(0);
  });

  it("4. 本月已還款時，從下個月開始計算", () => {
    const paid = [{ date: "2026-11-01", amount: 5000, principal: 5000, interest: 0, fee: 0 }];
    const p = projectPayoff(like({ remainingPrincipal: 175000 }), paid, TODAY);
    expect(p.kind === "ok" && p.payoffYm).toBe("2029-10");
    expect(p.kind === "ok" && p.rows[0].ym).toBe("2026-12");
  });

  it("4. 最後一期不足每月金額時只還剩下的部分", () => {
    const p = projectPayoff(like({ remainingPrincipal: 12000 }), [], TODAY);
    expect(p.kind === "ok" && p.rows.map((r) => r.planned)).toEqual([5000, 5000, 2000]);
  });

  it("5. 有利率時能正確估算（月利息 = 剩餘本金 × 年利率 ÷ 12）", () => {
    expect(estimateMonthlyInterest(100000, 12)).toBe(1000);
    const p = projectPayoff(like({ remainingPrincipal: 100000, annualRate: 12 }), [], TODAY);
    expect(p.kind).toBe("ok");
    if (p.kind !== "ok") return;
    expect(p.rows[0]).toMatchObject({ interest: 1000, principal: 4000, remainingAfter: 96000 });
    expect(p.periods).toBeGreaterThan(20);
    expect(p.totalInterest).toBeGreaterThan(0);
    expect(p.rows[p.rows.length - 1].remainingAfter).toBe(0);
  });

  it("6. 每月還款不足以支付利息時顯示警告，不給還清日期", () => {
    const p = projectPayoff(like({ remainingPrincipal: 100000, annualRate: 12, monthlyPayment: 1000 }), [], TODAY);
    expect(p).toEqual({ kind: "insufficient", monthlyInterest: 1000 });
    const ov = computeDebtOverview([{ ...like({ remainingPrincipal: 100000, annualRate: 12, monthlyPayment: 900 }), payments: [] }], TODAY);
    expect(ov.payoffYm).toBeNull();
    expect(ov.payoffNote).toBe("insufficient");
  });

  it("沒有設定每月還款金額時，不計算還清日期", () => {
    expect(projectPayoff(like({ monthlyPayment: null }), [], TODAY)).toEqual({ kind: "no-payment" });
  });

  it("提前多還後重新計算期數", () => {
    const before = projectPayoff(like({ remainingPrincipal: 180000 }), [], TODAY);
    const after = projectPayoff(like({ remainingPrincipal: 100000 }), [], TODAY);
    expect(before.kind === "ok" && before.periods).toBe(36);
    expect(after.kind === "ok" && after.periods).toBe(20);
  });

  it("還款時間表：已完成 / 待還款 / 今日到期 / 已逾期", () => {
    const debt = like({ remainingPrincipal: 15000, openingPrincipal: 20000, paymentDay: 2 });
    const paid = [{ date: "2026-10-02", amount: 5000, principal: 5000, interest: 0, fee: 0 }];
    const sched = buildSchedule(debt, paid, "2026-11-02");
    expect(sched.map((r) => [r.ym, r.status])).toEqual([
      ["2026-10", "done"],
      ["2026-11", "due-today"],
      ["2026-12", "pending"],
      ["2027-01", "pending"],
    ]);
    expect(sched[0]).toMatchObject({ actual: 5000, remainingAfter: 15000 });
    const overdue = buildSchedule(debt, paid, "2026-11-20");
    expect(overdue[1].status).toBe("overdue");
  });

  it("還款日 31 日在沒有 31 號的月份以月底計", () => {
    const p = projectPayoff(like({ paymentDay: 31, remainingPrincipal: 10000, startDate: "2026-01-01" }), [], "2026-11-02");
    expect(p.kind === "ok" && p.rows.map((r) => r.dueDate)).toEqual(["2026-11-30", "2026-12-31"]);
  });

  it("還款金額驗證：本金 = 還款金額 − 利息 − 費用；本金不能超過剩餘本金", () => {
    expect(validatePayment({ date: TODAY, amount: "5000", interest: "500", fee: "0" }, 100000)).toMatchObject({
      ok: true,
      value: { amount: 5000, principal: 4500, interest: 500, fee: 0 },
    });
    expect(validatePayment({ date: TODAY, amount: "5000", interest: "6000" }, 100000).ok).toBe(false);
    expect(validatePayment({ date: TODAY, amount: "5000" }, 3000)).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
    expect(validatePayment({ date: TODAY, amount: "0" }, 3000).ok).toBe(false);
    expect(validatePayment({ date: "bad", amount: "100" }, 3000).ok).toBe(false);
  });
});

describe("還款與記帳本連動", () => {
  it("7. 記錄還款後債務本金正確更新（利息不會減少本金）", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    await recordPayment(t.db, d.id, { date: "2026-11-01", amount: "5000", interest: "500" }, TODAY);
    const after = await getDebt(t.db, d.id);
    expect(after?.remainingPrincipal).toBe(195500);
    expect(after?.payments[0]).toMatchObject({ amount: 5000, principal: 4500, interest: 500, fee: 0 });
  });

  it("8. 記錄還款後，每月支出同步更新（分類「債務還款」、備註為債務名稱、一對一關聯）", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    await createIncome(t.db, entry({ category: "薪水", amount: 40000 }));
    await createExpense(t.db, entry({ amount: 20000 }));
    const p = await recordPayment(t.db, d.id, { date: "2026-11-05", amount: "5000" }, TODAY);

    const s = await getMonthSummary(t.db, "2026-11");
    expect(s).toMatchObject({ income: 40000, expense: 25000, balance: 15000, livingExpense: 20000, debtPayment: 5000 });
    const exp = await expenseByPayment(t.db, p.id);
    expect(exp).toMatchObject({ category: "債務還款", note: "銀行貸款", amount: 5000, date: "2026-11-05" });
  });

  it("9. 修改還款後，支出與剩餘本金同步更新", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    const p = await recordPayment(t.db, d.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    await updatePayment(t.db, p.id, { date: "2026-12-01", amount: "8000", interest: "1000" }, TODAY);

    const exp = await expenseByPayment(t.db, p.id);
    expect(exp).toMatchObject({ amount: 8000, date: "2026-12-01" });
    expect((await getMonthSummary(t.db, "2026-11")).expense).toBe(0);
    expect((await getMonthSummary(t.db, "2026-12")).expense).toBe(8000);
    expect((await getDebt(t.db, d.id))?.remainingPrincipal).toBe(193000);
    expect(await count(t.db, "expenses")).toBe(1);
  });

  it("10. 刪除還款後，支出與剩餘本金同步更新", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    const p = await recordPayment(t.db, d.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    await deletePayment(t.db, p.id, TODAY);
    expect(await count(t.db, "expenses")).toBe(0);
    expect(await count(t.db, "debt_payments")).toBe(0);
    expect((await getDebt(t.db, d.id))?.remainingPrincipal).toBe(200000);
    expect((await getMonthSummary(t.db, "2026-11")).expense).toBe(0);
  });

  it("11. 還款不會重複建立支出；一般支出頁不能修改或刪除債務還款支出", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    const p = await recordPayment(t.db, d.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    await updatePayment(t.db, p.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    await updatePayment(t.db, p.id, { date: "2026-11-06", amount: "5000" }, TODAY);
    expect(await count(t.db, "expenses")).toBe(1);

    const exp = (await listRecords(t.db, { month: "2026-11" }))[0];
    expect(exp.debtPaymentId).toBe(p.id);
    await expect(deleteExpense(t.db, exp.id)).rejects.toThrow("債務管理");
    await expect(updateExpense(t.db, exp.id, entry({ amount: 1 }))).rejects.toThrow("債務管理");
    expect(await count(t.db, "expenses")).toBe(1);
    expect((await getDebt(t.db, d.id))?.remainingPrincipal).toBe(195000);
  });

  it("還款資料不合法時整筆不會寫入（交易回復）", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    await expect(recordPayment(t.db, d.id, { date: TODAY, amount: "999999" }, TODAY)).rejects.toThrow();
    await expect(recordPayment(t.db, d.id, { date: TODAY, amount: "" }, TODAY)).rejects.toThrow();
    expect(await count(t.db, "debt_payments")).toBe(0);
    expect(await count(t.db, "expenses")).toBe(0);
  });

  it("12. 不同債務的還款紀錄不互相影響", async () => {
    const a = await createDebt(t.db, debtData({ name: "銀行貸款" }), TODAY);
    const b = await createDebt(t.db, debtData({ name: "親友借款", originalPrincipal: "100000", monthlyPayment: "3000" }), TODAY);
    await recordPayment(t.db, a.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    await recordPayment(t.db, b.id, { date: "2026-11-06", amount: "3000" }, TODAY);
    await recordPayment(t.db, b.id, { date: "2026-12-06", amount: "3000" }, TODAY);
    const debts = await listDebts(t.db);
    expect(debts.find((d) => d.id === a.id)).toMatchObject({ remainingPrincipal: 195000 });
    expect(debts.find((d) => d.id === b.id)).toMatchObject({ remainingPrincipal: 94000 });
    const notes = (await allExpenses(t.db)).map((e) => e.note).sort();
    expect(notes).toEqual(["親友借款", "親友借款", "銀行貸款"]);
  });

  it("13. 債務歸零後狀態正確；刪除還款後恢復為還款中", async () => {
    const d = await createDebt(t.db, debtData({ originalPrincipal: "10000" }), TODAY);
    await recordPayment(t.db, d.id, { date: "2026-11-05", amount: "4000" }, TODAY);
    const last = await recordPayment(t.db, d.id, { date: "2026-11-20", amount: "6000" }, TODAY);
    let debt = await getDebt(t.db, d.id);
    expect(debt).toMatchObject({ remainingPrincipal: 0, status: "PAID_OFF", paidOffDate: "2026-11-20" });
    expect(projectPayoff(debt!, debt!.payments, TODAY)).toEqual({ kind: "paid", payoffDate: "2026-11-20" });
    await expect(recordPayment(t.db, d.id, { date: TODAY, amount: "100" }, TODAY)).rejects.toThrow("已經還清");

    await deletePayment(t.db, last.id, TODAY);
    debt = await getDebt(t.db, d.id);
    expect(debt).toMatchObject({ remainingPrincipal: 6000, status: "ACTIVE", paidOffDate: null });
  });

  it("14. 已有還款紀錄的債務不可直接刪除；沒有紀錄的可以", async () => {
    const a = await createDebt(t.db, debtData(), TODAY);
    await recordPayment(t.db, a.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    await expect(deleteDebt(t.db, a.id)).rejects.toThrow("不能直接刪除");
    expect(await getDebt(t.db, a.id)).not.toBeNull();

    const b = await createDebt(t.db, debtData({ name: "空債務" }), TODAY);
    await deleteDebt(t.db, b.id);
    expect(await getDebt(t.db, b.id)).toBeNull();
  });

  it("標記已還清：記為已結清、不新增支出", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    await markPaidOff(t.db, d.id, TODAY);
    expect(await getDebt(t.db, d.id)).toMatchObject({ remainingPrincipal: 0, status: "PAID_OFF", paidOffDate: TODAY });
    expect(await count(t.db, "expenses")).toBe(0);
  });

  it("總覽：原始、已還、剩餘、進度、每月還款、預計還清", async () => {
    const a = await createDebt(t.db, debtData({ originalPrincipal: "200000" }), TODAY);
    await createDebt(t.db, debtData({ name: "親友借款", originalPrincipal: "100000", remainingPrincipal: "60000", monthlyPayment: "3000" }), TODAY);
    await recordPayment(t.db, a.id, { date: "2026-11-01", amount: "5000" }, TODAY);
    const ov = computeDebtOverview(await listDebts(t.db), TODAY);
    expect(ov).toMatchObject({ originalTotal: 300000, remainingTotal: 255000, repaidTotal: 45000, progress: 15, monthlyTotal: 8000 });
    expect(ov.payoffYm).toBeTruthy();
  });
});

describe("還款提醒", () => {
  const debt = like({ paymentDay: 10, startDate: "2026-01-01" });
  it("還款日前 3 天內：即將到期；當天：今日到期；超過且沒有紀錄：逾期", () => {
    expect(dueState(debt, [], "2026-11-06")).toBeNull();
    expect(dueState(debt, [], "2026-11-07")).toBe("soon");
    expect(dueState(debt, [], "2026-11-10")).toBe("today");
    expect(dueState(debt, [], "2026-11-11")).toBe("overdue");
  });

  it("以實際記錄的還款為準：本月已有還款紀錄就不提醒，沒有紀錄就不會假設已還款", () => {
    const paid = [{ date: "2026-11-03", amount: 5000, principal: 5000, interest: 0, fee: 0 }];
    expect(dueState(debt, paid, "2026-11-20")).toBeNull();
    expect(dueState(debt, [], "2026-11-20")).toBe("overdue");
    // 上個月的還款不算本月
    const old = [{ date: "2026-10-03", amount: 5000, principal: 5000, interest: 0, fee: 0 }];
    expect(dueState(debt, old, "2026-11-20")).toBe("overdue");
  });

  it("已還清或還沒開始的債務不提醒", () => {
    expect(dueState(like({ status: "PAID_OFF", remainingPrincipal: 0 }), [], "2026-11-20")).toBeNull();
    expect(dueState(like({ startDate: "2027-01-01" }), [], "2026-11-20")).toBeNull();
  });

  it("債務歸零提醒、且與記帳提醒合併成同一個視窗", async () => {
    const d = await createDebt(t.db, debtData({ originalPrincipal: "5000" }), TODAY);
    await recordPayment(t.db, d.id, { date: "2026-11-02", amount: "5000" }, TODAY);
    const other = await createDebt(t.db, debtData({ name: "親友借款", paymentDay: "1" }), TODAY);
    const alerts = computeDebtAlerts(await listDebts(t.db), TODAY);
    expect(alerts.map((a) => [a.debtId, a.kind])).toEqual([
      [other.id, "overdue"],
      [d.id, "paid"],
    ]);
    const modal = buildAlertModal(null, alerts);
    expect(modal?.items.map((i) => i.title)).toEqual(["「親友借款」這筆債務已經逾期", "恭喜！「銀行貸款」已經還清"]);
    expect(modal?.items[1].tone).toBe("ok");
  });
});

describe("備份包含債務", () => {
  it("匯出再匯入：債務、還款、對應支出完整還原，且不重複", async () => {
    const d = await createDebt(t.db, debtData(), TODAY);
    await recordPayment(t.db, d.id, { date: "2026-11-05", amount: "5000", interest: "200" }, TODAY);
    const parsed = parseBackup(JSON.stringify(await exportBackup(t.db)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const other = await createTestDb();
    try {
      await importBackup(other.db, parsed.backup, TODAY);
      await importBackup(other.db, parsed.backup, TODAY);
      const debts = await listDebts(other.db);
      expect(debts).toHaveLength(1);
      expect(debts[0]).toMatchObject({ remainingPrincipal: 195200, name: "銀行貸款" });
      expect(debts[0].payments).toHaveLength(1);
      const exp = await allExpenses(other.db);
      expect(exp).toHaveLength(1);
      expect(exp[0].debtPaymentId).toBe(debts[0].payments[0].id);
    } finally {
      await other.cleanup();
    }
  });

  it("還款對不到債務的備份會被拒絕", () => {
    const bad = {
      app: "anxin-ledger",
      schemaVersion: 2,
      data: { debtPayments: [{ id: "p", debtId: "missing", date: "2026-11-01", amount: 100, principal: 100, interest: 0, fee: 0 }] },
    };
    expect(parseBackup(JSON.stringify(bad))).toMatchObject({ ok: false });
  });
});
