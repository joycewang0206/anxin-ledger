import Link from "next/link";
import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function AddPage() {
  return (
    <>
      <PageTitle sub="請選擇要記哪一種">要記什麼？</PageTitle>
      <div className="flex flex-col gap-4">
        <Link href="/income/new" className="btn btn-income min-h-[88px] text-[1.4rem]">
          💰 記收入
        </Link>
        <Link href="/expense/new" className="btn btn-expense min-h-[88px] text-[1.4rem]">
          🧾 記支出
        </Link>
        <Link href="/records" className="btn btn-secondary">
          📋 查看收支紀錄
        </Link>
      </div>
    </>
  );
}
