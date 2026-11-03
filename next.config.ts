import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 私人財務資料：不讓瀏覽器或中間的伺服器快取頁面內容（圖示與靜態檔案除外）
  async headers() {
    return [
      {
        source: "/((?!_next/static|icons/).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  experimental: {
    // 還原備份時會把備份檔內容送到伺服器，放寬上限
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
