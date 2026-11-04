import { BudgetForm } from "@/components/BudgetForm";
import { LogoutButton } from "@/components/LogoutButton";
import { MonthNav } from "@/components/MonthNav";
import { SAVED_MESSAGES, SuccessBanner } from "@/components/SuccessBanner";
import { PageTitle } from "@/components/ui";
import { clearBudgetAction } from "@/app/actions";
import { formatMonthZh } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { formatYuan } from "@/lib/money";
import { first, monthFrom, type SearchParams } from "@/lib/params";
import { getBudget } from "@/lib/services/ledger";
import { ErrorBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const month = monthFrom(sp.month);
  const saved = first(sp.saved);
  const db = await getDb();
  const budget = await getBudget(db, month);

  return (
    <>
      <SuccessBanner message={saved ? (SAVED_MESSAGES[saved] ?? null) : null} />
      <ErrorBanner message={first(sp.error)} />
      <PageTitle>設定</PageTitle>

      <section className="mb-8" aria-label="每月預算">
        <h2 className="mb-2 text-[1.4rem] font-extrabold">每月預算</h2>
        <p className="mb-3">設定這個月最多想花多少錢。記帳後快花到、花到或超過預算，畫面會跳出提醒；支出超過收入時，也會用紅字提醒。每個月可以分開設定，沒有設定預算也能照常記帳。</p>
        <MonthNav month={month} basePath="/settings" />
        <div className="card mb-4 max-w-[34rem]">
          <p className="font-bold">{formatMonthZh(month)} 的預算</p>
          <p className="num">{budget === null ? "還沒設定" : formatYuan(budget)}</p>
        </div>
        <BudgetForm key={`${month}-${budget}`} month={month} current={budget} />
        {budget !== null && (
          <form action={clearBudgetAction} className="mt-3">
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="btn btn-secondary">清除這個月的預算</button>
          </form>
        )}
      </section>

      <section aria-label="登出">
        <h2 className="mb-2 text-[1.4rem] font-extrabold">登出</h2>
        <p className="mb-3">在別人也會使用的手機或電腦上，用完請按登出。</p>
        <LogoutButton className="max-w-[34rem]" />
      </section>
    </>
  );
}
