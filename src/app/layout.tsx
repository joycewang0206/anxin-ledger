import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { LogoutButton } from "@/components/LogoutButton";
import { NavLinks } from "@/components/NavLinks";
import { getMembership } from "@/lib/context";
import { readEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "安心記帳本",
  description: "大字體、簡單操作的每月收支與債務記帳本",
  applicationName: "安心記帳本",
  appleWebApp: { capable: true, title: "安心記帳", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // 讓內容延伸到 iPhone 的安全區域，再用 safe-area-inset 避開
  themeColor: "#1e40af",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 只有登入且已加入家庭時才顯示主選單（未登入的人根本進不到這裡，proxy 會先擋下）
  const authed = readEnv().ok && (await getMembership()) !== null;
  return (
    <html lang="zh-Hant">
      <body>
        <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-3 p-3 lg:flex-row lg:gap-6 lg:p-5">
          <header className="lg:w-[320px] lg:shrink-0">
            <div className="lg:sticky lg:top-5">
              <p className="text-[1.3rem] font-extrabold lg:mb-3">🛡️ 安心記帳本</p>
              {authed && (
                <nav aria-label="主選單" className="hidden lg:block">
                  <NavLinks />
                  <LogoutButton className="mt-4" />
                </nav>
              )}
            </div>
          </header>
          <main className={`min-w-0 flex-1 lg:pb-16 ${authed ? "pb-[calc(96px+env(safe-area-inset-bottom))]" : "pb-8"}`}>{children}</main>
        </div>
        {authed && <BottomNav />}
      </body>
    </html>
  );
}
