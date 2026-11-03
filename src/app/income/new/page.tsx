import { EntryForm } from "@/components/EntryForm";
import { PageTitle } from "@/components/ui";
import { todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function NewIncomePage() {
  return (
    <>
      <PageTitle sub="照著 ① ② ③ ④ 的順序，四個步驟就完成">新增收入</PageTitle>
      <EntryForm kind="income" initial={{ date: todayStr(), category: "", amount: "", note: "" }} cancelHref="/" />
    </>
  );
}
