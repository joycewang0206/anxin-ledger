import { NextResponse, type NextRequest } from "next/server";
import { readEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

const PUBLIC = [/^\/login$/, /^\/signup$/, /^\/auth\/callback$/];

// 所有頁面與 API 都必須先登入。proxy 只做「是否登入」這道門；資料能不能讀，最終由資料庫的 RLS 決定。
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = readEnv();
  if (!config.ok) {
    return new NextResponse("網站尚未完成設定（缺少 Supabase 連線資訊），為了保護資料已暫停使用。", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const { getResponse, userId } = await updateSession(request, config.env);
  const isPublic = PUBLIC.some((r) => r.test(pathname));

  const redirectTo = (path: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = search;
    const res = NextResponse.redirect(url);
    for (const c of getResponse().cookies.getAll()) res.cookies.set(c);
    res.headers.set("Cache-Control", "no-store");
    return res;
  };

  if (!userId && !isPublic) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "請先登入" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return redirectTo("/login", pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`);
  }
  if (userId && (pathname === "/login" || pathname === "/signup")) return redirectTo("/");
  return getResponse();
}

export const config = {
  // 排除靜態檔案與 PWA 安裝檔（manifest 與圖示必須在登入前就能讀取）
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest).*)"],
};
