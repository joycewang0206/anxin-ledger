import { describe, expect, it } from "vitest";
import { exportBackup, exportCsv, importBackup } from "@/lib/services/backup";
import { createDebt, getDebt, listDebts, recordPayment } from "@/lib/services/debts";
import { joinHousehold, leaveHousehold, listMembers, regenerateInviteCode, removeMember } from "@/lib/services/household";
import { createExpense, createIncome, getMonthSummary, listRecords, setBudget } from "@/lib/services/ledger";
import { validateDebt } from "@/lib/debtInput";
import { clientFor, count, createTestDb, entry, getStack, newUser } from "./helpers";

const TODAY = "2026-11-02";
const debtData = () => {
  const r = validateDebt({ name: "房貸", creditor: "", originalPrincipal: "200000", remainingPrincipal: "", monthlyPayment: "5000", paymentDay: "15", startDate: "2026-01-01", annualRate: "", note: "" });
  if (!r.ok) throw new Error("bad");
  return r.data;
};
const TABLES = ["incomes", "expenses", "monthly_budgets", "debts", "debt_payments", "households", "household_members"];

describe("家庭資料隔離（RLS）", () => {
  it("同一家庭的兩位成員看到同一份帳；另一個家庭完全看不到", async () => {
    const a = await createTestDb();
    const b = await newUser("member");
    expect(await joinHousehold(b.db, a.inviteCode, "媽媽")).toEqual({ ok: true });
    const other = await createTestDb();

    await createIncome(a.db, entry({ category: "薪水", amount: 40000 }));
    await createExpense(b.db, entry({ amount: 700 }));
    await setBudget(a.db, "2026-11", 30000);
    const d = await createDebt(a.db, debtData(), TODAY);
    await recordPayment(b.db, d.id, { date: "2026-11-05", amount: "5000" }, TODAY);

    for (const u of [a.db, b.db]) {
      expect(await getMonthSummary(u, "2026-11")).toMatchObject({ income: 40000, expense: 5700, budget: 30000 });
      expect((await getDebt(u, d.id))?.remainingPrincipal).toBe(195000);
    }
    // 另一個家庭什麼都看不到
    for (const t of TABLES.filter((x) => !x.startsWith("household"))) expect(await count(other.db, t), t).toBe(0);
    expect(await getMonthSummary(other.db, "2026-11")).toMatchObject({ income: 0, expense: 0, budget: null });
    expect(await getDebt(other.db, d.id)).toBeNull();
    expect(await listRecords(other.db, { month: "2026-11" })).toEqual([]);
    expect((await exportBackup(other.db)).data.incomes).toEqual([]);
    expect(await exportCsv(other.db)).not.toContain("薪水");
    expect((await listMembers(other.db)).map((m) => m.displayName)).toEqual(["測試者"]);
    expect((await listMembers(a.db)).map((m) => m.displayName).sort()).toEqual(["媽媽", "測試者"]);
  });

  it("別的家庭不能修改、刪除、也不能把資料掛到我的家庭", async () => {
    const a = await createTestDb();
    const other = await createTestDb();
    const inc = await createIncome(a.db, entry({ category: "薪水", amount: 40000 }));
    const d = await createDebt(a.db, debtData(), TODAY);

    expect((await other.db.from("incomes").update({ amount: 1 }).eq("id", inc.id).select()).data).toEqual([]);
    expect((await other.db.from("incomes").delete().eq("id", inc.id).select()).data).toEqual([]);
    // 試圖指定別人的 household_id 寫入
    const forged = await other.db.from("incomes").insert({ household_id: a.householdId, date: "2026-11-01", category: "偽造", amount: 1 });
    expect(forged.error).toBeTruthy();
    // 對別人的債務呼叫函式
    expect((await other.db.rpc("delete_debt", { p_id: d.id })).error?.message).toContain("ANXIN:debt_not_found");
    expect((await other.db.rpc("record_debt_payment", { p_debt: d.id, p: { date: TODAY, amount: 1, principal: 1 }, p_today: TODAY })).error?.message).toContain("debt_not_found");
    expect((await getDebt(a.db, d.id))?.remainingPrincipal).toBe(200000);
    expect(await count(a.db, "incomes")).toBe(1);
  });

  it("未登入（只有 anon key）不能讀、寫、呼叫任何函式", async () => {
    const a = await createTestDb();
    await createIncome(a.db, entry({ amount: 123 }));
    const anon = await clientFor(null);
    for (const t of TABLES) {
      const r = await anon.from(t).select("*");
      expect(r.error, t).toBeTruthy();
      expect(r.data ?? []).toEqual([]);
    }
    expect((await anon.from("incomes").insert({ date: "2026-11-01", category: "x", amount: 1 })).error).toBeTruthy();
    for (const fn of ["create_household", "join_household", "regenerate_invite_code", "set_budget", "create_debt", "import_backup_rows"]) {
      expect((await anon.rpc(fn, {})).error, fn).toBeTruthy();
    }
    // 內部函式與內部資料表網路上完全碰不到
    expect((await a.db.from("join_attempts").select("*")).error).toBeTruthy();
    expect((await a.db.schema("app_private").from("join_attempts").select("*")).error).toBeTruthy();
  });

  it("已登入但還沒加入家庭的人，什麼資料都看不到、也寫不進去", async () => {
    const owner = await createTestDb();
    await createIncome(owner.db, entry({ amount: 55 }));
    const lone = await newUser("lone");
    for (const t of TABLES) expect((await lone.db.from(t).select("*")).data ?? [], t).toEqual([]);
    expect((await lone.db.from("incomes").insert({ date: "2026-11-01", category: "x", amount: 1 })).error).toBeTruthy();
    expect((await lone.db.rpc("create_debt", { p: { name: "x", originalPrincipal: 1, openingPrincipal: 1, startDate: TODAY }, p_today: TODAY })).error).toBeTruthy();
  });

  it("債務與債務還款支出只能透過函式修改，不能繞過去直接寫", async () => {
    const a = await createTestDb();
    const d = await createDebt(a.db, debtData(), TODAY);
    const p = await recordPayment(a.db, d.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    // RLS 對 update / delete 的處理是「看不到可以改的列」，所以是 0 筆受影響或直接報錯，兩者都代表沒改到
    const untouched = (r: { error: unknown; data: unknown[] | null }) => !!r.error || (r.data ?? []).length === 0;
    expect(untouched(await a.db.from("debts").update({ remaining_principal: 0 }).eq("id", d.id).select())).toBe(true);
    expect(untouched(await a.db.from("debts").delete().eq("id", d.id).select())).toBe(true);
    expect(untouched(await a.db.from("debt_payments").delete().eq("id", p.id).select())).toBe(true);
    expect(untouched(await a.db.from("debt_payments").update({ amount: 1, principal: 1 }).eq("id", p.id).select())).toBe(true);
    expect(await count(a.db, "debt_payments")).toBe(1);
    expect((await a.db.from("debt_payments").insert({ debt_id: d.id, date: TODAY, amount: 1, principal: 1 })).error).toBeTruthy();
    expect((await a.db.from("expenses").insert({ date: TODAY, category: "債務還款", amount: 5 })).error?.message).toContain("debt_expense_locked");
    const linked = await a.db.from("expenses").select("id").eq("debt_payment_id", p.id).single();
    expect((await a.db.from("expenses").update({ amount: 1 }).eq("id", linked.data!.id)).error?.message).toContain("debt_expense_locked");
    expect((await a.db.from("expenses").delete().eq("id", linked.data!.id)).error?.message).toContain("debt_expense_locked");
    expect((await getDebt(a.db, d.id))?.remainingPrincipal).toBe(195000);
    expect(await count(a.db, "expenses")).toBe(1);
  });

  it("備份還原只會寫進自己的家庭，備份檔裡的編號與別家重複也不會衝突", async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    await createIncome(a.db, entry({ category: "薪水", amount: 40000 }));
    const d = await createDebt(a.db, debtData(), TODAY);
    await recordPayment(a.db, d.id, { date: "2026-11-05", amount: "5000" }, TODAY);
    const backup = await exportBackup(a.db);
    await importBackup(b.db, backup, TODAY); // 同樣的編號匯入另一個家庭
    expect((await listDebts(b.db))[0]).toMatchObject({ id: d.id, remainingPrincipal: 195000 });
    expect(await getMonthSummary(b.db, "2026-11")).toMatchObject({ income: 40000, expense: 5000 });
    expect(await count(a.db, "incomes")).toBe(1); // 原本家庭不受影響
  });

  it("超過 1000 筆時匯出與統計不會被截斷", async () => {
    const a = await createTestDb();
    const rows = Array.from({ length: 1250 }, (_, i) => ({ date: "2026-11-01", category: "吃飯買菜", amount: 10, note: `n${i}` }));
    for (let i = 0; i < rows.length; i += 500) expect((await a.db.from("expenses").insert(rows.slice(i, i + 500))).error).toBeNull();
    expect((await getMonthSummary(a.db, "2026-11")).expense).toBe(12500);
    expect((await exportBackup(a.db)).data.expenses).toHaveLength(1250);
    expect(new Set((await exportBackup(a.db)).data.expenses.map((e) => e.id)).size).toBe(1250);
    expect((await listRecords(a.db, { month: "2026-11" }))).toHaveLength(1250);
    expect((await exportCsv(a.db)).trim().split("\r\n")).toHaveLength(1251);
  });
});

describe("家庭成員與邀請碼", () => {
  it("每個家庭最多 2 位成員，第三個人加不進去", async () => {
    const a = await createTestDb();
    const b = await newUser("second");
    const c = await newUser("third");
    expect(await joinHousehold(b.db, a.inviteCode, "媽媽")).toEqual({ ok: true });
    await expect(joinHousehold(c.db, a.inviteCode, "路人")).rejects.toThrow(/2 位成員/);
    expect(await count(c.db, "incomes")).toBe(0);
    expect(await listMembers(a.db)).toHaveLength(2);
  });


  it("錯誤的邀請碼加入失敗；連續錯 5 次會被暫時鎖住（連正確的也不行）", async () => {
    const a = await createTestDb();
    const u = await newUser("guess");
    for (let i = 0; i < 5; i++) expect(await joinHousehold(u.db, "ZZZZZZZZZZ", "猜")).toEqual({ ok: false, error: "invalid_code" });
    expect(await joinHousehold(u.db, a.inviteCode, "猜")).toEqual({ ok: false, error: "too_many_attempts" });
    expect(await count(u.db, "incomes")).toBe(0);
  });

  it("邀請碼不分大小寫與空白；已加入家庭的人不能再加入第二個", async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    const u = await newUser("m");
    const spaced = a.inviteCode.toLowerCase().replace(/(.{5})/, "$1 ");
    expect(await joinHousehold(u.db, spaced, "爺爺")).toEqual({ ok: true });
    expect(await joinHousehold(u.db, b.inviteCode, "爺爺")).toEqual({ ok: false, error: "already_member" });
    await expect(joinHousehold(u.db, "", "x")).resolves.toMatchObject({ ok: false });
  });

  it("只有管理者能更換邀請碼與移除成員；舊邀請碼立刻失效", async () => {
    const a = await createTestDb();
    const m = await newUser("m");
    await joinHousehold(m.db, a.inviteCode, "成員");
    await expect(regenerateInviteCode(m.db)).rejects.toThrow("只有家庭管理者");
    await expect(removeMember(m.db, a.id)).rejects.toThrow("只有家庭管理者");
    const fresh = await regenerateInviteCode(a.db);
    expect(fresh).not.toBe(a.inviteCode);
    const late = await newUser("late");
    expect(await joinHousehold(late.db, a.inviteCode, "晚到")).toMatchObject({ ok: false, error: "invalid_code" });
    await expect(joinHousehold(late.db, fresh, "晚到")).rejects.toThrow(/2 位成員/); // 已滿 2 人
    await removeMember(a.db, m.id);
    expect(await joinHousehold(late.db, fresh, "晚到")).toEqual({ ok: true });
  });

  it("被移除或自己離開的人，立刻看不到家庭資料；管理者不能離開", async () => {
    const a = await createTestDb();
    const m1 = await newUser("m1");
    const m2 = await newUser("m2");
    await joinHousehold(m1.db, a.inviteCode, "一");
    await createIncome(a.db, entry({ amount: 999 }));
    expect(await count(m1.db, "incomes")).toBe(1);

    await removeMember(a.db, m1.id);
    expect(await count(m1.db, "incomes")).toBe(0);
    await joinHousehold(m2.db, a.inviteCode, "二");
    expect((await m1.db.from("household_members").select("*")).data).toEqual([]);

    await leaveHousehold(m2.db);
    expect(await count(m2.db, "incomes")).toBe(0);
    await expect(leaveHousehold(a.db)).rejects.toThrow("管理者不能直接離開");
    await expect(removeMember(a.db, a.id)).rejects.toThrow("管理者不能直接離開");
    expect(await count(a.db, "incomes")).toBe(1); // 家庭資料還在
  });

  it("移除成員後可以用邀請碼重新加入", async () => {
    const a = await createTestDb();
    const m = await newUser("m");
    await joinHousehold(m.db, a.inviteCode, "m");
    await removeMember(a.db, m.id);
    expect(await joinHousehold(m.db, a.inviteCode, "m")).toEqual({ ok: true });
  });

  it("一個帳號只能建立一個家庭", async () => {
    const a = await createTestDb();
    expect((await a.db.rpc("create_household", { p_name: "第二個", p_display_name: "x" })).error?.message).toContain("already_member");
    await getStack();
  });
});
