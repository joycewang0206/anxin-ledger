import type { MetadataRoute } from "next";

// 讓使用者可以把網站「加入主畫面」，像 App 一樣開啟。
// 刻意不使用 Service Worker：記帳資料每次都向伺服器取得最新內容，不會因為快取而看到舊金額。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "安心記帳本",
    short_name: "安心記帳",
    description: "大字體、簡單操作的每月收支與債務記帳本",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "zh-TW",
    background_color: "#faf6ee",
    theme_color: "#1e40af",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
