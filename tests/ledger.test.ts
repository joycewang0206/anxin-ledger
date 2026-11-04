import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAlertModal } from "@/lib/alerts";
import { parseBackup } from "@/lib/backup";
import { computeLedgerAlert, computeMonthSummary } from "@/lib/ledger";
import { parseAmount } from "@/lib/money";
import {
  createExpense,
  createIncome,
  deleteExpense,
  getMonthSummary,
  setBudget,
  updateExpense,
  listRecords,
} from "@/lib/services/ledger";
import { exportBackup, importBackup, previewImport } from "@/lib/services/backup";
import { validateEntry } from "@/lib/validation";
import { createTestDb, entry, type TestDb } from "./helpers";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.cleanup();
});

const alertFor = async (ym = "2026-11") => computeLedgerAlert(ym, await getMonthSummary(t.db, ym));

describe("月統計", () => {
  it("1. 新增收入後總收入正確", async () => {
    await createIncome(t.db, entry({ category: "薪水", amount: 40000 }));
    await createIncome(t.db, entry({ category: "外送", amount: 5000 }));
    expect((await getMonthSummary(t.db, "2026-11")).income).toBe(45000);
  });

  it("2. 新增支出後總支出正確", async () => {
    await createExpense(t.db, entry({ amount: 500 }));
    await createExpense(t.db, entry({ category: "水電瓦斯", amount: 1200 }));
    expect((await getMonthSummary(t.db, "2026-11")).expense).toBe(1700);
  });

  it("3. 收入減支出後結餘正確", async () => {
    await createIncome(t.db, entry({ category: "薪水", amount: 40000 }));
    await createExpense(t.db, entry({ amount: 15000 }));
    const s = await getMonthSummary(t.db, "2026-11");
    expect(s.balance).toBe(25000);
  });

  it("9. 修改紀錄後金額正確更新", async () => {
    const e = await createExpense(t.db, entry({ amount: 500 }));
    await updateExpense(t.db, e.id, entry({ amount: 800, category: "交通費" }));
    const s = await getMonthSummary(t.db, "2026-11");
    expect(s.expense).toBe(800);
    expect((await listRecords(t.db, { month: "2026-11" }))[0].category).toBe("交通費");
  });

  it("10. 刪除紀錄後金額正確更新", async () => {
    const a = await createExpense(t.db, entry({ amount: 500 }));
    await createExpense(t.db, entry({ amount: 300 }));
    await deleteExpense(t.db, a.id);
    expect((await getMonthSummary(t.db, "2026-11")).expense).toBe(300);
  });

  it("11. 不同月份的資料不互相影響", async () => {
    await createIncome(t.db, entry({ category: "薪水", amount: 40000, date: "2026-10-31" }));
    await createExpense(t.db, entry({ amount: 900, date: "2026-10-31" }));
    await createExpense(t.db, entry({ amount: 100, date: "2026-11-01" }));
    await setBudget(t.db, "2026-10", 5000);
    const oct = await getMonthSummary(t.db, "2026-10");
    const nov = await getMonthSummary(t.db, "2026-11");
    expect(oct).toMatchObject({ income: 40000, expense: 900, budget: 5000 });
    expect(nov).toMatchObject({ income: 0, expense: 100, budget: null });
  });

  it("12. 未設定預算時仍可正常記帳，且不顯示預算提醒", async () => {
    await createIncome(t.db, entry({ category: "薪水", amount: 40000 }));
    await createExpense(t.db, entry({ amount: 30000 }));
    const s = await getMonthSummary(t.db, "2026-11");
    expect(s.budget).toBeNull();
    expect(s.expense).toBe(30000);
    expect(await alertFor()).toBeNull();
  });

  it("預算可以每個月各自設定並更新", async () => {
    await setBudget(t.db, "2026-11", 30000);
    await setBudget(t.db, "2026-11", 32000);
    expect((await getMonthSummary(t.db, "2026-11")).budget).toBe(32000);
  });
});

describe("提醒邏輯", () => {
  beforeEach(async () => {
    await createIncome(t.db, entry({ category: "薪水", amount: 40000 }));
    await setBudget(t.db, "2026-11", 30000);
  });

  it("4. 預算達到 80% 時提醒", async () => {
    await createExpense(t.db, entry({ amount: 23999 }));
    expect(await alertFor()).toBeNull();
    await createExpense(t.db, entry({ amount: 1 }));
    const a = await alertFor();
    expect(a?.budget).toMatchObject({ level: "near", percent: 80, remaining: 6000 });
    expect(a?.income).toBeNull();
  });

  it("5. 預算達到 100% 時提醒", async () => {
    await createExpense(t.db, entry({ amount: 30000 }));
    expect((await alertFor())?.budget).toMatchObject({ level: "used", overAmount: 0 });
  });

  it("6. 預算超支時提醒", async () => {
    await createExpense(t.db, entry({ amount: 30500 }));
    expect((await alertFor())?.budget).toMatchObject({ level: "over", overAmount: 500 });
  });

  it("7. 支出超過收入時提醒", async () => {
    await createExpense(t.db, entry({ amount: 40500 }));
    expect((await alertFor())?.income).toEqual({ income: 40000, expense: 40500, overAmount: 500 });
  });

  it("支出剛好等於收入時，不顯示收入超支", async () => {
    await createExpense(t.db, entry({ amount: 40000 }));
    expect((await alertFor())?.income).toBeNull();
  });

  it("8. 雙重超支時只顯示一個視窗，並同時列出兩種超支", async () => {
    await createExpense(t.db, entry({ amount: 40500 }));
    const ledger = await alertFor();
    const modal = buildAlertModal(ledger, []);
    expect(modal).not.toBeNull();
    expect(modal!.items.map((i) => i.title)).toEqual(["注意！本月已經超支", "注意！本月支出已經超過收入"]);
    const text = modal!.items.flatMap((i) => i.lines).join("\n");
    expect(text).toContain("超過預算 10,500 元");
    expect(text).toContain("超支 500 元");
  });

  it("新增、修改、刪除後重新檢查提醒（由資料庫即時計算）", async () => {
    const e = await createExpense(t.db, entry({ amount: 30500 }));
    expect((await alertFor())?.budget?.level).toBe("over");
    await updateExpense(t.db, e.id, entry({ amount: 10000 }));
    expect(await alertFor()).toBeNull();
    await updateExpense(t.db, e.id, entry({ amount: 30000 }));
    expect((await alertFor())?.budget?.level).toBe("used");
    await deleteExpense(t.db, e.id);
    expect(await alertFor()).toBeNull();
  });

  it("提醒內容沒變時 signature 相同（避免重複彈窗），金額變了才會不同", () => {
    const s = computeMonthSummary([{ amount: 40000, category: "薪水" }], [{ amount: 30500, category: "x" }], 30000);
    const a = buildAlertModal(computeLedgerAlert("2026-11", s), []);
    const b = buildAlertModal(computeLedgerAlert("2026-11", s), []);
    expect(a!.signature).toBe(b!.signature);
    const s2 = computeMonthSummary([{ amount: 40000, category: "薪水" }], [{ amount: 31000, category: "x" }], 30000);
    expect(buildAlertModal(computeLedgerAlert("2026-11", s2), [])!.signature).not.toBe(a!.signature);
  });

  it("驗收清單：24,000 → 80%；再 6,000 → 用完；再 500 → 超支 500；到 40,500 → 超過薪水 500", async () => {
    await createExpense(t.db, entry({ amount: 24000 }));
    expect((await alertFor())?.budget).toMatchObject({ level: "near", percent: 80 });
    await createExpense(t.db, entry({ amount: 6000 }));
    expect((await alertFor())?.budget?.level).toBe("used");
    await createExpense(t.db, entry({ amount: 500 }));
    expect((await alertFor())?.budget).toMatchObject({ level: "over", overAmount: 500 });
    await createExpense(t.db, entry({ amount: 10000 }));
    const a = await alertFor();
    expect(a?.income).toMatchObject({ expense: 40500, overAmount: 500 });
    expect(a?.budget?.overAmount).toBe(10500);
  });
});

describe("輸入驗證", () => {
  it("13. 金額驗證正確", () => {
    expect(parseAmount("")).toEqual({ ok: false, error: "請輸入金額" });
    expect(parseAmount("0")).toEqual({ ok: false, error: "金額必須大於 0" });
    expect(parseAmount("-5")).toEqual({ ok: false, error: "金額不能是負數" });
    expect(parseAmount("abc")).toEqual({ ok: false, error: "金額只能輸入數字" });
    expect(parseAmount("12.5").ok).toBe(false);
    expect(parseAmount("1,200")).toEqual({ ok: true, value: 1200 });
    expect(parseAmount("４０００")).toEqual({ ok: true, value: 4000 });
  });

  it("13. 分類、日期驗證", () => {
    const ok = { date: "2026-11-02", category: "生活費", amount: "100" };
    expect(validateEntry("expense", ok).ok).toBe(true);
    expect(validateEntry("expense", { ...ok, category: "" })).toMatchObject({ ok: false, errors: { category: "請選擇支出分類" } });
    expect(validateEntry("expense", { ...ok, date: "2026-02-30" })).toMatchObject({ ok: false, errors: { date: expect.any(String) } });
    expect(validateEntry("expense", { ...ok, category: "債務還款" }).ok).toBe(false);
    expect(validateEntry("expense", { ...ok, category: "機場停車費" }).ok).toBe(true);
    expect(validateEntry("expense", { ...ok, category: "出差費" }).ok).toBe(true);
    expect(validateEntry("expense", { ...ok, category: "吃飯買菜" }).ok).toBe(false); // 舊分類已移除
    expect(validateEntry("expense", { ...ok, category: "__custom__", customCategory: "寵物" })).toMatchObject({ ok: true, data: { category: "寵物" } });
    expect(validateEntry("expense", { ...ok, category: "__custom__", customCategory: " " }).ok).toBe(false);
    expect(validateEntry("expense", { ...ok, category: "__custom__", customCategory: "債務還款" }).ok).toBe(false);
    expect(validateEntry("income", { date: "2026-11-02", category: "__custom__", customCategory: "股利", amount: "100" })).toMatchObject({
      ok: true,
      data: { category: "股利" },
    });
    expect(validateEntry("income", { date: "2026-11-02", category: "__custom__", customCategory: " ", amount: "100" }).ok).toBe(false);
  });
});

describe("備份與還原", () => {
  it("14. JSON 匯出與匯入正確；重複匯入不會產生重複資料", async () => {
    await createIncome(t.db, entry({ category: "薪水", amount: 40000 }));
    await createExpense(t.db, entry({ amount: 500, note: "買菜" }));
    await setBudget(t.db, "2026-11", 30000);
    const exported = await exportBackup(t.db);

    const other = await createTestDb();
    try {
      const parsed = parseBackup(JSON.stringify(exported));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const plan = await previewImport(other.db, parsed.backup);
      expect(plan.incomes).toEqual({ total: 1, add: 1, skip: 0 });
      await importBackup(other.db, parsed.backup, "2026-11-02");
      expect(await getMonthSummary(other.db, "2026-11")).toMatchObject({ income: 40000, expense: 500, budget: 30000 });

      const again = await importBackup(other.db, parsed.backup, "2026-11-02");
      expect(again.incomes).toEqual({ total: 1, add: 0, skip: 1 });
      expect((await getMonthSummary(other.db, "2026-11")).income).toBe(40000);
    } finally {
      await other.cleanup();
    }
  });

  it("14. 格式錯誤與資料不正確的備份會被拒絕", () => {
    expect(parseBackup("not json")).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ hello: 1 }))).toMatchObject({ ok: false });
    const bad = { app: "anxin-ledger", schemaVersion: 2, data: { expenses: [{ id: "x", date: "2026-11-01", category: "a", amount: -5 }] } };
    expect(parseBackup(JSON.stringify(bad))).toMatchObject({ ok: false });
  });
});
