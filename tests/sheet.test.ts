import { describe, expect, it } from "vitest";
import { computeLedgerTotals, monthPaymentTotals, paymentSubtotal, withRemainingAfter, withRunningBalance } from "../src/lib/sheet";

const ORDER = { income: ["薪水", "外送", "年終獎金"], expense: ["生活費", "機場停車費", "出差費"] };

describe("收支表小計與總計", () => {
  const rows = [
    { kind: "income" as const, amount: 30000, category: "薪水" },
    { kind: "income" as const, amount: 500, category: "路邊撿到" },
    { kind: "income" as const, amount: 2000, category: "薪水" },
    { kind: "expense" as const, amount: 1200, category: "出差費" },
    { kind: "expense" as const, amount: 800, category: "生活費" },
    { kind: "expense" as const, amount: 300, category: "生活費" },
    { kind: "expense" as const, amount: 5000, category: "債務還款" },
  ];
  const t = computeLedgerTotals(rows, ORDER);

  it("總計與結餘", () => {
    expect(t.income).toBe(32500);
    expect(t.expense).toBe(7300);
    expect(t.balance).toBe(25200);
  });
  it("分類小計 = 各分類金額加總，常用分類在前、自訂與債務還款在後", () => {
    expect(t.incomeByCategory.map((c) => [c.category, c.total, c.count])).toEqual([["薪水", 32000, 2], ["路邊撿到", 500, 1]]);
    expect(t.expenseByCategory.map((c) => [c.category, c.total])).toEqual([["生活費", 1100], ["出差費", 1200], ["債務還款", 5000]]);
  });
  it("小計加總等於總計", () => {
    expect(t.incomeByCategory.reduce((a, c) => a + c.total, 0)).toBe(t.income);
    expect(t.expenseByCategory.reduce((a, c) => a + c.total, 0)).toBe(t.expense);
  });
  it("沒有資料時全部為 0", () => {
    const z = computeLedgerTotals([], ORDER);
    expect([z.income, z.expense, z.balance, z.incomeByCategory.length]).toEqual([0, 0, 0, 0]);
  });
});

describe("累計剩餘", () => {
  it("收入加、支出減，可為負數，最後一筆等於結餘", () => {
    const r = withRunningBalance([
      { kind: "income" as const, amount: 1000 },
      { kind: "expense" as const, amount: 1500 },
      { kind: "income" as const, amount: 700 },
    ]);
    expect(r.map((x) => x.balance)).toEqual([1000, -500, 200]);
  });
});

describe("還債表小計", () => {
  const p = (date: string, principal: number, interest = 0, fee = 0) => ({ date, principal, interest, fee, amount: principal + interest + fee });
  it("本金、利息、費用、還款總額小計（總額 = 三者相加）", () => {
    const s = paymentSubtotal([p("2026-10-05", 5000, 300, 50), p("2026-11-05", 5000, 280)]);
    expect(s).toEqual({ count: 2, principal: 10000, interest: 580, fee: 50, total: 10630 });
    expect(s.total).toBe(s.principal + s.interest + s.fee);
  });
  it("本月總計只算該月，跨債務加總", () => {
    const debts = [
      { payments: [p("2026-10-05", 1000, 10), p("2026-11-02", 2000, 20, 5)] },
      { payments: [p("2026-11-09", 3000)] },
    ];
    expect(monthPaymentTotals(debts, "2026-11")).toEqual({ count: 2, principal: 5000, interest: 20, fee: 5, total: 5025 });
    expect(monthPaymentTotals(debts, "2026-12").total).toBe(0);
  });
  it("每筆債務各自計算還完後剩餘本金，利息費用不減本金，不會低於 0", () => {
    const r = withRemainingAfter(10000, [p("a", 4000, 500, 100), p("b", 4000), p("c", 4000)]);
    expect(r.map((x) => x.remainingAfter)).toEqual([6000, 2000, 0]);
    expect(withRemainingAfter(500, [p("a", 100)])[0].remainingAfter).toBe(400);
  });
});
