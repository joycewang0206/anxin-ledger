"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/context";
import { ServiceError } from "@/lib/db";
import { createHousehold, JOIN_ERRORS, joinHousehold } from "@/lib/services/household";
import { createSupabase } from "@/lib/supabase/server";

export type HouseholdState = { error?: string } | null;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

function checkNames(name: string, display: string, needHousehold: boolean): string | null {
  if (needHousehold && (name.length < 1 || name.length > 40)) return "請輸入家庭名稱（40 字以內）";
  if (display.length < 1 || display.length > 30) return "請輸入你的稱呼（30 字以內），例如「爸爸」";
  return null;
}

export async function createHouseholdAction(_p: HouseholdState, fd: FormData): Promise<HouseholdState> {
  await requireUser();
  const name = str(fd, "name"), display = str(fd, "displayName");
  const bad = checkNames(name, display, true);
  if (bad) return { error: bad };
  try {
    await createHousehold(await createSupabase(), name, display);
  } catch (e) {
    console.error("createHousehold failed", e);
    return { error: e instanceof ServiceError ? e.message : "建立失敗，請稍後再試一次。" };
  }
  refresh();
  redirect("/?saved=household");
}

export async function joinHouseholdAction(_p: HouseholdState, fd: FormData): Promise<HouseholdState> {
  await requireUser();
  const code = str(fd, "code"), display = str(fd, "displayName");
  const bad = checkNames("", display, false);
  if (bad) return { error: bad };
  if (code.replace(/[^A-Za-z0-9]/g, "").length < 6) return { error: "請輸入家人給你的邀請碼" };
  try {
    const r = await joinHousehold(await createSupabase(), code, display);
    if (!r.ok) return { error: JOIN_ERRORS[r.error] ?? "加入失敗" };
  } catch (e) {
    console.error("joinHousehold failed", e);
    return { error: e instanceof ServiceError ? e.message : "加入失敗，請稍後再試一次。" };
  }
  refresh();
  redirect("/?saved=joined");
}
