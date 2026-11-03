import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/ui";
import { PaymentForm } from "@/components/PaymentForm";
import { todayStr } from "@/lib/dates";
import { getDb } from "@/lib/context";
import { estimateMonthlyInterest } from "@/lib/debt";
import { getDebt } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debt = await getDebt(await getDb(), id);
  if (!debt) notFound();
  if (debt.status === "PAID_OFF") {
    return (
      <>
        <PageTitle>{debt.name}</PageTitle>
        <p className="card mb-4">這筆債務已經還清了，不需要再記錄還款。</p>
        <Link href={`/debts/${id}`} className="btn btn-primary">回到債務明細</Link>
      </>
    );
  }
  const interest = estimateMonthlyInterest(debt.remainingPrincipal, debt.annualRate);
  const suggested = Math.min((debt.monthlyPayment ?? 0) || debt.remainingPrincipal + interest, debt.remainingPrincipal + interest);
  return (
    <>
      <PageTitle sub="還款後按這裡記錄，系統會自動更新剩餘欠款和本月支出">我已經還款</PageTitle>
      <PaymentForm
        debtId={id}
        debtName={debt.name}
        remainingForPayment={debt.remainingPrincipal}
        hasRate={debt.annualRate > 0}
        cancelHref={`/debts/${id}`}
        initial={{ date: todayStr(), amount: String(suggested), interest: String(interest), fee: "0", note: "" }}
      />
    </>
  );
}
