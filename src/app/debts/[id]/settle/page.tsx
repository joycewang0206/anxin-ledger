import Link from "next/link";
import { notFound } from "next/navigation";
import { settleDebtAction } from "@/app/actions";
import { PageTitle } from "@/components/ui";
import { getDb } from "@/lib/context";
import { formatYuan } from "@/lib/money";
import { getDebt } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function SettleDebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debt = await getDebt(await getDb(), id);
  if (!debt) notFound();
  if (debt.status === "PAID_OFF") {
    return (
      <>
        <PageTitle>{debt.name}</PageTitle>
        <p className="card mb-4">這筆債務已經是「已還清」。</p>
        <Link href={`/debts/${id}`} className="btn btn-primary">回到債務明細</Link>
      </>
    );
  }
  return (
    <>
      <PageTitle>標記「{debt.name}」已還清？</PageTitle>
      <div className="card mb-4 max-w-[40rem]">
        <p className="font-bold">目前剩餘本金</p>
        <p className="num">{formatYuan(debt.remainingPrincipal)}</p>
      </div>
      <p className="card mb-4 max-w-[40rem]">
        標記後，剩下的 {formatYuan(debt.remainingPrincipal)} 會算成「已結清」，<strong>不會</strong>在記帳本新增支出。
        如果這筆錢是你這次真的還出去的，請改按「我已經還款」，這樣本月支出才會正確。
      </p>
      <form action={settleDebtAction} className="flex flex-wrap gap-3">
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn btn-primary">是，標記已還清</button>
        <Link href={`/debts/${id}/pay`} className="btn btn-income">改為記錄還款</Link>
        <Link href={`/debts/${id}`} className="btn btn-secondary">取消</Link>
      </form>
    </>
  );
}
