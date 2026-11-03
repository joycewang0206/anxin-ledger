"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/env";
import { createSupabase } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string } | null;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signInAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "請輸入正確的電子郵件" };
  if (!password) return { error: "請輸入密碼" };
  const sb = await createSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "這個信箱還沒完成驗證，請先到信箱點擊驗證連結。" };
    if (error.status === 429 || error.code === "over_request_rate_limit") return { error: "嘗試次數過多，請稍後再試。" };
    if (error.code === "invalid_credentials") return { error: "電子郵件或密碼不正確。" };
    console.error("signIn failed", error.code, error.status);
    return { error: "登入失敗，請稍後再試一次。" };
  }
  redirect(safeNextPath(String(fd.get("next") ?? "")));
}

export async function signUpAction(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "請輸入正確的電子郵件" };
  if (password.length < 8) return { error: "密碼至少需要 8 個字元" };
  if (password !== String(fd.get("password2") ?? "")) return { error: "兩次輸入的密碼不一樣" };
  const sb = await createSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback?next=/onboarding` },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "這個密碼太容易被猜到，請換一個更長、更特別的密碼。" };
    if (error.code === "user_already_exists") return { error: "這個信箱已經註冊過了，請直接登入。" };
    if (error.status === 429 || error.code === "over_email_send_rate_limit") return { error: "嘗試次數過多，請稍後再試。" };
    console.error("signUp failed", error.code, error.status);
    return { error: "註冊失敗，請稍後再試一次。" };
  }
  if (data.session) redirect("/onboarding");
  return { notice: "驗證信已寄出，請到信箱點擊連結完成註冊，再回來登入。" };
}

export async function signOutAction(): Promise<void> {
  const sb = await createSupabase();
  await sb.auth.signOut();
  redirect("/login");
}
