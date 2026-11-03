import Link from "next/link";
import { AlertModal } from "@/components/AlertModal";
import { MonthNav } from "@/components/MonthNav";
import { SAVED_MESSAGES, SuccessBanner } from "@/components/SuccessBanner";
import { ErrorBanner, PageTitle } from "@/components/ui";
import { DEBT_CATEGORY, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { currentMonthKey, formatDateShort, todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { formatYuan, signedYuan } from "@/lib/money";
import { first, monthFrom, type SearchParams } from "@/lib/params";
import { loadAlertModal } from "@/lib/services/alerts";
import { listCategories, listRecords, type RecordKind } from "@/lib/services/ledger";

export const dynamic = "force-dynamic";

export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const month = monthFrom(sp.month);
  const typeRaw = first(sp.type);
  const kind: RecordKind | "all" = typeRaw === "income" || typeRaw === "expense" ? typeRaw : "all";
  const category = first(sp.category) || "";
  const saved = first(sp.saved);
  const db = await getDb();

  const [rows, extraCats, modal] = await Promise.all([
    listRecords(db, { month, kind, category: category || undefined }),
    listCategories(db, month),
    loadAlertModal(db, { month, includeLedger: month === currentMonthKey() || !!saved, today: todayStr() }),
  ]);
  const categories = [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, DEBT_CATEGORY, ...extraCats])];
  const incomeTotal = rows.filter((r) => r.kind === "income").reduce((a, r) => a + r.amount, 0);
  const expenseTotal = rows.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amount, 0);

  return (
    <>
      <AlertModal data={modal} />
      <SuccessBanner message={saved ? (SAVED_MESSAGES[saved] ?? null) : null} />
      <ErrorBanner message={first(sp.error)} />
      <PageTitle>收支紀錄</PageTitle>
      <MonthNav month={month} basePath="/records" extra={{ ...(kind !== "all" ? { type: kind } : {}), ...(category ? { category } : {}) }} />

      <form method="get" className="card mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <input type="hidden" name="month" value={month} />
        <div>
          <label htmlFor="type" className="field-label">看哪一種</label>
          <select id="type" name="type" defaultValue={kind} className="input">
            <option value="all">收入和支出</option>
            <option value="income">只看收入</option>
            <option value="expense">只看支出</option>
          </select>
        </div>
        <div>
          <label htmlFor="category" className="field-label">分類</label>
          <select id="category" name="category" defaultValue={category} className="input">
            <option value="">全部分類</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn btn-primary w-full">查詢</button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card"><p className="font-bold">收入合計</p><p className="num text-income">{formatYuan(incomeTotal)}</p></div>
        <div className="card"><p className="font-bold">支出合計</p><p className="num text-expense">{formatYuan(expenseTotal)}</p></div>
      </div>

      {rows.length === 0 ? (
        <p className="card">這個條件下沒有紀錄。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 grow basis-[9rem]">
                  <p className="font-bold">{formatDateShort(r.date)}　{r.category}</p>
                  {r.note && <p className="muted break-words">{r.note}</p>}
                </div>
                <p className={`num ml-auto shrink-0 ${r.kind === "income" ? "text-income" : "text-expense"}`}>{signedYuan(r.amount, r.kind)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {r.debtPaymentId ? (
                  <Link href={r.debtId ? `/debts/${r.debtId}` : "/debts"} className="btn btn-secondary">
                    👛 這是債務還款，到債務管理處理
                  </Link>
                ) : (
                  <>
                    <Link href={`/records/${r.kind}/${r.id}/edit`} className="btn btn-secondary">✏️ 修改</Link>
                    <Link href={`/records/${r.kind}/${r.id}/delete?month=${month}`} className="btn btn-secondary">🗑️ 刪除</Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
