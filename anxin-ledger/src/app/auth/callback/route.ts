import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/env";
import { createSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 信箱驗證連結會回到這裡，換成登入狀態後導向目的頁。
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const sb = await createSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNextPath(searchParams.get("next"))}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
