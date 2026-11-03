// 啟動一個可以讓網站連線的測試環境（給 Playwright 驗收用）。
// 用法：POSTGREST_BIN=/path/to/postgrest TEST_DATABASE_URL=postgresql://... node tools/test-gateway/run.mjs
// 啟動後會印出 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY；按 Ctrl+C 結束並刪除測試資料庫。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStack } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stack = await startStack({
  adminUrl: process.env.TEST_DATABASE_URL ?? "postgresql://anxin:anxin@localhost:5432/postgres",
  postgrestBin: process.env.POSTGREST_BIN ?? "postgrest",
  migrationsDir: path.join(root, "supabase/migrations"),
  shimSql: path.join(root, "tests/sql/supabase-shim.sql"),
  auth: true,
  requireConfirm: process.env.REQUIRE_CONFIRM === "1",
  gatewayPort: Number(process.env.GATEWAY_PORT ?? 0),
  jwtSecret: process.env.TEST_JWT_SECRET,
});
console.log(JSON.stringify({ NEXT_PUBLIC_SUPABASE_URL: stack.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey, dbUrl: stack.dbUrl }));
const bye = async () => {
  await stack.stop();
  process.exit(0);
};
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
setInterval(() => {}, 1 << 30);
