import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseEnv } from "@/lib/env";

/** 在 proxy 中刷新登入狀態（把新的 cookie 同時寫進請求與回應），並回傳目前登入者。 */
export async function updateSession(request: NextRequest, env: SupabaseEnv) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return { getResponse: () => response, userId: typeof sub === "string" ? sub : null };
}
