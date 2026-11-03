import { z } from "zod";

// 只需要兩個「可公開」的設定（網址與 anon key）。
// SUPABASE_SERVICE_ROLE_KEY 只留給你自己的管理腳本使用，這個網站完全不讀取它，也不要設定到 Vercel。
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ error: "尚未設定 NEXT_PUBLIC_SUPABASE_URL" })
    .refine((v) => /^https?:\/\//.test(v), "NEXT_PUBLIC_SUPABASE_URL 必須是 https://xxxx.supabase.co 這種網址"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string({ error: "尚未設定 NEXT_PUBLIC_SUPABASE_ANON_KEY" }).min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY 看起來不完整"),
});

export type SupabaseEnv = { url: string; anonKey: string };

export function readEnv(source: Record<string, string | undefined> = process.env): { ok: true; env: SupabaseEnv } | { ok: false; problems: string[] } {
  const parsed = schema.safeParse(source);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => i.message) };
  return { ok: true, env: { url: parsed.data.NEXT_PUBLIC_SUPABASE_URL, anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY } };
}

export function supabaseEnv(): SupabaseEnv {
  const r = readEnv();
  if (!r.ok) throw new Error(`環境變數設定不完整：${r.problems.join("；")}`);
  return r.env;
}

/** 只允許站內路徑，避免登入後被導到別的網站。 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/^\/(login|signup|auth)(\/|\?|$)/.test(next)) return "/";
  return next;
}
