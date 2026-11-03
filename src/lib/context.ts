import { cache } from "react";
import { redirect } from "next/navigation";
import type { Db } from "@/lib/db";
import { createSupabase } from "@/lib/supabase/server";

export interface User { id: string; email: string | null }
export interface Membership {
  householdId: string;
  householdName: string;
  inviteCode: string;
  role: "owner" | "member";
  displayName: string;
}

/** 目前登入者（由 Supabase 驗證登入憑證；沒登入就是 null）。 */
export const getUser = cache(async (): Promise<User | null> => {
  const sb = await createSupabase();
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: c.sub, email: typeof c.email === "string" ? c.email : null } : null;
});

/** 目前登入者所屬的家庭（查詢本身受 RLS 限制，只會看到自己的）。 */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await getUser();
  if (!user) return null;
  const sb = await createSupabase();
  const { data, error } = await sb
    .from("household_members")
    .select("household_id, role, display_name, households(name, invite_code)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(`讀取家庭資料失敗：${error.message}`);
  if (!data) return null;
  const h = data.households as unknown as { name: string; invite_code: string } | null;
  return { householdId: data.household_id, householdName: h?.name ?? "", inviteCode: h?.invite_code ?? "", role: data.role, displayName: data.display_name };
});

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

/** 頁面與 Server Action 的入口：未登入導向登入頁，還沒加入家庭導向建立／加入家庭。回傳以該使用者身分連線的 client。 */
export async function getDb(): Promise<Db> {
  await requireUser();
  if (!(await getMembership())) redirect("/onboarding");
  return createSupabase();
}
