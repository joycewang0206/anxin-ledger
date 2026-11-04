import Link from "next/link";
import { AlertModal } from "@/components/AlertModal";
import { MonthNav } from "@/components/MonthNav";
import { SAVED_MESSAGES, SuccessBanner } from "@/components/SuccessBanner";
import { ErrorBanner, PageTitle } from "@/components/ui";
import { DEBT_CATEGORY, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { currentMonthKey, formatDateShort, todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { formatYuan } from "@/lib/money";
import { first, monthFrom, type SearchParams } from "@/lib/params";
import { loadAlertModal } from "@/lib/services/alerts";
import { listRecords } from "@/lib/services/ledger";
import { type CategorySubtotal, computeLedgerTotals, withRunningBalance } from "@/lib/sheet";

export const dynamic = "force-dynamic";

export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const month = monthFrom(sp.month);
  const saved = first(sp.saved);
  const db = await getDb();

  const [monthRows, modal] = await Promise.all([
    listRecords(db, { month }),
    loadAlertModal(db, { month, includeLedger: month === currentMonthKey() || !!saved, today: todayStr() }),
  ]);

  // 小計、總計、累計剩餘都以「整個月」計算
  const totals = computeLedgerTotals(monthRows, { income: INCOME_CATEGORIES, expense: [...EXPENSE_CATEGORIES, DEBT_CATEGORY] });
  const rows = withRunningBalance([...monthRows].reverse()); // listRecords 是新到舊，反過來就是舊到新

  return (
    <>
      <AlertModal data={modal} />
      <SuccessBanner message={saved ? (SAVED_MESSAGES[saved] ?? null) : null} />
      <ErrorBanner message={first(sp.error)} />
      <PageTitle>收支紀錄</PageTitle>
      <MonthNav month={month} basePath="/records" />

      <section aria-label="本月總計" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card"><p className="font-bold">本月收入總計</p><p className="num text-income">{formatYuan(totals.income)}</p></div>
        <div className="card"><p className="font-bold">本月支出總計</p><p className="num text-expense">{formatYuan(totals.expense)}</p></div>
        <div className="card"><p className="font-bold">本月結餘</p><p className={`num ${totals.balance < 0 ? "text-alert" : "text-balance"}`}>{formatYuan(totals.balance)}</p></div>
      </section>

      <section aria-label="分類小計" className="mb-5">
        <h2 className="mb-2 text-[1.3rem] font-extrabold">本月分類小計</h2>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <SubtotalTable title="收入" rows={totals.incomeByCategory} total={totals.income} tone="text-income" />
          <SubtotalTable title="支出" rows={totals.expenseByCategory} total={totals.expense} tone="text-expense" />
        </div>
      </section>

      <section aria-label="收支明細表">
        <h2 className="mb-1 text-[1.3rem] font-extrabold">收支明細表</h2>
        <p className="muted mb-2">收入和支出並排，「累計剩餘」是本月 1 號起算、每記一筆後還剩多少（不含上個月結餘）。</p>
        {rows.length === 0 ? (
          <p className="card">這個月還沒有紀錄。</p>
        ) : (
          <div className="sheet-wrap">
            {/* 手機/平板：精簡版（備註、操作疊在左邊那格，收入/支出並排）；寬螢幕（xl）顯示完整欄位。日期下面接著顯示分類（名目） */}
            <table className="sheet w-full table-fixed xl:table-auto">
              <caption className="sr-only">本月收支明細</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[44%] xl:w-auto">日期・分類</th>
                  <th scope="col" className="r">收入</th>
                  <th scope="col" className="r">支出</th>
                  <th scope="col" className="r hidden xl:table-cell">累計剩餘</th>
                  <th scope="col" className="hidden xl:table-cell">備註</th>
                  <th scope="col" className="hidden xl:table-cell">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const actions = r.debtPaymentId ? (
                    <Link href={r.debtId ? `/debts/${r.debtId}` : "/debts"} className="inline-flex min-h-12 items-center underline">債務還款，到債務管理處理</Link>
                  ) : (
                    <span className="flex flex-wrap gap-x-4">
                      <Link href={`/records/${r.kind}/${r.id}/edit`} className="inline-flex min-h-12 items-center underline">✏️ 修改</Link>
                      <Link href={`/records/${r.kind}/${r.id}/delete?month=${month}`} className="inline-flex min-h-12 items-center underline">🗑️ 刪除</Link>
                    </span>
                  );
                  return (
                    <tr key={`${r.kind}-${r.id}`}>
                      <th scope="row" className="break-words">
                        <span className="block font-bold">{formatDateShort(r.date)}</span>
                        <span className="block font-bold">{r.category}</span>
                        <span className={`block font-normal xl:hidden ${r.balance < 0 ? "neg" : ""}`}>累計剩餘 {formatYuan(r.balance)}</span>
                        {r.note && <span className="block font-normal xl:hidden">{r.note}</span>}
                        <span className="block font-normal xl:hidden">{actions}</span>
                      </th>
                      <td className="r text-income">{r.kind === "income" ? formatYuan(r.amount) : ""}</td>
                      <td className="r text-expense">{r.kind === "expense" ? formatYuan(r.amount) : ""}</td>
                      <td className={`r hidden font-bold xl:table-cell ${r.balance < 0 ? "neg" : ""}`}>{formatYuan(r.balance)}</td>
                      <td className="hidden break-words xl:table-cell">{r.note ?? ""}</td>
                      <td className="hidden xl:table-cell">{actions}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="total">
                  <th scope="row">本月總計</th>
                  <td className="r text-income">{formatYuan(totals.income)}</td>
                  <td className="r text-expense">{formatYuan(totals.expense)}</td>
                  <td className={`r hidden xl:table-cell ${totals.balance < 0 ? "neg" : ""}`}>{formatYuan(totals.balance)}</td>
                  <td colSpan={2} className="hidden xl:table-cell">← 本月結餘</td>
                </tr>
                <tr className="total xl:hidden">
                  <th scope="row">本月結餘</th>
                  <td colSpan={2} className={`r ${totals.balance < 0 ? "neg" : ""}`}>{formatYuan(totals.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SubtotalTable({ title, rows, total, tone }: { title: string; rows: CategorySubtotal[]; total: number; tone: string }) {
  return (
    <div className="sheet-wrap">
      <table className="sheet">
        <caption className="sr-only">{title}分類小計</caption>
        <thead>
          <tr>
            <th scope="col">{title}分類</th>
            <th scope="col" className="r">筆數</th>
            <th scope="col" className="r">小計</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={3} className="muted">本月沒有{title}</td></tr>
          ) : (
            rows.map((c) => (
              <tr key={c.category}>
                <th scope="row" className="font-bold">{c.category}</th>
                <td className="r">{c.count}</td>
                <td className={`r font-bold ${tone}`}>{formatYuan(c.total)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="total">
            <th scope="row">{title}總計</th>
            <td className="r">{rows.reduce((a, c) => a + c.count, 0)}</td>
            <td className={`r ${tone}`}>{formatYuan(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
