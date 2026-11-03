import Link from "next/link";
import { notFound } from "next/navigation";
import { removeDebtAction } from "@/app/actions";
import { PageTitle } from "@/components/ui";
import { getDb } from "@/lib/context";
import { formatYuan } from "@/lib/money";
import { getDebt } from "@/lib/services/debts";

export const dynamic = "force-dynamic";

export default async function DeleteDebtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debt = await getDebt(await getDb(), id);
  if (!debt) notFound();
  const hasPayments = debt.payments.length > 0;
  return (
    <>
      <PageTitle>刪除債務：{debt.name}</PageTitle>
      <div className="card mb-4 max-w-[40rem]">
        <p className="font-bold">原始欠款</p>
        <p className="num">{formatYuan(debt.originalPrincipal)}</p>
      </div>
      {hasPayments ? (
        <>
          <p className="card mb-4 max-w-[40rem]">
            這筆債務已經有 {debt.payments.length} 筆還款紀錄，不能直接刪除，以免歷史紀錄和每月支出對不起來。如果已經還清，請回明細按「標記已還清」。
          </p>
          <Link href={`/debts/${id}`} className="btn btn-primary">回到債務明細</Link>
        </>
      ) : (
        <>
          <p className="mb-4 font-bold">這筆債務還沒有還款紀錄。刪除後無法復原。</p>
          <form action={removeDebtAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="btn btn-danger">是，刪除</button>
            <Link href={`/debts/${id}`} className="btn btn-secondary">不要，回上一頁</Link>
          </form>
        </>
      )}
    </>
  );
}
