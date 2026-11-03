import { getMembership, getUser } from "@/lib/context";
import { createSupabase } from "@/lib/supabase/server";
import { exportCsv } from "@/lib/services/backup";
import { todayStr } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getUser())) return Response.json({ error: "請先登入" }, { status: 401 });
  if (!(await getMembership())) return Response.json({ error: "請先建立或加入家庭" }, { status: 403 });
  const db = await createSupabase();
  const csv = await exportCsv(db);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anxin-ledger-${todayStr()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
