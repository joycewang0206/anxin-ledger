import Link from "next/link";
import { notFound } from "next/navigation";
import { removeEntryAction } from "@/app/actions";
import { PageTitle } from "@/components/ui";
import { formatDateZh } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { formatYuan } from "@/lib/money";
import { DEBT_LOCKED_MESSAGE, getExpense, getIncome } from "@/lib/services/ledger";

export const dynamic = "force-dynamic";

export default async function DeleteRecordPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "income" && kind !== "expense") notFound();
  const db = await getDb();
  const rec = kind === "income" ? await getIncome(db, id) : await getExpense(db, id);
  if (!rec) notFound();
  const month = rec.date.slice(0, 7);
  const locked = "debtPaymentId" in rec && !!rec.debtPaymentId;

  return (
    <>
      <PageTitle>確定要刪除這筆{kind === "income" ? "收入" : "支出"}嗎？</PageTitle>
      <div className="card mb-4 max-w-[40rem]">
        <p className="font-bold">{formatDateZh(rec.date)}　{rec.category}</p>
        <p className={`num ${kind === "income" ? "text-income" : "text-expense"}`}>{formatYuan(rec.amount)}</p>
        {rec.note && <p className="muted">{rec.note}</p>}
      </div>
      {locked ? (
        <>
          <p className="card mb-4">{DEBT_LOCKED_MESSAGE}</p>
          <Link href="/debts" className="btn btn-primary">前往債務管理</Link>
        </>
      ) : (
        <>
          <p className="mb-4 font-bold">刪除後無法復原。</p>
          <form action={removeEntryAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="btn btn-danger">是，刪除</button>
            <Link href={`/records?month=${month}`} className="btn btn-secondary">不要，回上一頁</Link>
          </form>
        </>
      )}
    </>
  );
}
