import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readEnv, safeNextPath } from "@/lib/env";

const OK = { NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40) };

describe("環境變數檢查", () => {
  it("完整設定可以通過", () => {
    expect(readEnv(OK)).toMatchObject({ ok: true, env: { url: OK.NEXT_PUBLIC_SUPABASE_URL } });
  });
  it("缺少或不完整時會明確指出，網站會拒絕服務", () => {
    const r = readEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(readEnv({ ...OK, NEXT_PUBLIC_SUPABASE_URL: "abcd" }).ok).toBe(false);
    expect(readEnv({ ...OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: "short" }).ok).toBe(false);
  });
});

describe("登入後導向", () => {
  it("只允許站內路徑", () => {
    expect(safeNextPath("/debts?month=2026-11")).toBe("/debts?month=2026-11");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/signup")).toBe("/");
    expect(safeNextPath("/auth/callback")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});

describe("金鑰不會外洩到前端", () => {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(path.resolve(import.meta.dirname, "../src")).filter((f) => /\.(ts|tsx)$/.test(f));

  it("網站程式完全不讀取 SUPABASE_SERVICE_ROLE_KEY", () => {
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/process\.env[.\[][^\n;]*SERVICE_ROLE/i);
  });
  it("沒有任何 NEXT_PUBLIC_ 開頭的機密變數", () => {
    for (const f of files) expect(fs.readFileSync(f, "utf8"), f).not.toMatch(/NEXT_PUBLIC_\w*(SERVICE|SECRET|PASSWORD)/i);
  });
  it("財務資料不放在 localStorage 當資料來源（僅允許提醒視窗記錄「已看過」的簽章）", () => {
    const users = files.filter((f) => /localStorage/.test(fs.readFileSync(f, "utf8"))).map((f) => path.basename(f));
    expect(users).toEqual(["AlertModal.tsx"]);
  });
});
