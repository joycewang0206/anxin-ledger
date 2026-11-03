import { type Client, unwrap } from "../db";

export interface MemberRow { userId: string; displayName: string; role: "owner" | "member"; joinedAt: Date }

export async function listMembers(db: Client): Promise<MemberRow[]> {
  const rows = unwrap(await db.from("household_members").select("user_id, display_name, role, created_at").order("created_at").order("user_id"));
  return rows.map((r: Record<string, string>) => ({ userId: r.user_id, displayName: r.display_name, role: r.role as MemberRow["role"], joinedAt: new Date(r.created_at) }));
}

export async function createHousehold(db: Client, name: string, displayName: string): Promise<string> {
  return unwrap(await db.rpc("create_household", { p_name: name, p_display_name: displayName })) as string;
}

export type JoinResult = { ok: true } | { ok: false; error: "invalid_code" | "too_many_attempts" | "already_member" };

export async function joinHousehold(db: Client, code: string, displayName: string): Promise<JoinResult> {
  const r = unwrap(await db.rpc("join_household", { p_code: code, p_display_name: displayName })) as { ok: boolean; error?: string };
  return r.ok ? { ok: true } : { ok: false, error: r.error as "invalid_code" | "too_many_attempts" | "already_member" };
}

export async function regenerateInviteCode(db: Client): Promise<string> {
  return unwrap(await db.rpc("regenerate_invite_code")) as string;
}
export async function removeMember(db: Client, userId: string): Promise<void> {
  unwrap(await db.rpc("remove_member", { p_user: userId }));
}
export async function leaveHousehold(db: Client): Promise<void> {
  unwrap(await db.rpc("leave_household"));
}

export const JOIN_ERRORS: Record<string, string> = {
  invalid_code: "邀請碼不正確，請向家人再確認一次。",
  too_many_attempts: "輸入錯誤次數過多，請 15 分鐘後再試。",
  already_member: "你已經加入一個家庭了。",
};

/** 邀請碼顯示成 5 碼一組，比較好唸好抄。 */
export const formatInviteCode = (c: string) => c.replace(/(.{5})/g, "$1 ").trim();
