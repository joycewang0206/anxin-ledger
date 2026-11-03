import Link from "next/link";
import { notFound } from "next/navigation";
import { EntryForm } from "@/components/EntryForm";
import { PageTitle } from "@/components/ui";
import { getDb } from "@/lib/context";
import { DEBT_LOCKED_MESSAGE, getExpense, getIncome } from "@/lib/services/ledger";

export const dynamic = "force-dynamic";

export default async function EditRecordPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "income" && kind !== "expense") notFound();
  const db = await getDb();
  const rec = kind === "income" ? await getIncome(db, id) : await getExpense(db, id);
  if (!rec) notFound();
  if ("debtPaymentId" in rec && rec.debtPaymentId) {
    return (
      <>
        <PageTitle>這筆不能在這裡修改</PageTitle>
        <p className="card mb-4">{DEBT_LOCKED_MESSAGE}</p>
        <Link href="/debts" className="btn btn-primary">前往債務管理</Link>
      </>
    );
  }
  return (
    <>
      <PageTitle>修改{kind === "income" ? "收入" : "支出"}</PageTitle>
      <EntryForm
        kind={kind}
        initial={{ id: rec.id, date: rec.date, category: rec.category, amount: String(rec.amount), note: rec.note ?? "" }}
        cancelHref={`/records?month=${rec.date.slice(0, 7)}`}
      />
    </>
  );
}
