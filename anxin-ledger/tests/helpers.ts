import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll } from "vitest";
import type { Db } from "@/lib/db";
import { type Stack, startStack } from "../tools/test-gateway/lib.mjs";

/**
 * 測試環境：真的 PostgreSQL ＋ 真的 PostgREST（RLS 由資料庫實際執行），每個測試檔各一份。
 * 需要：TEST_DATABASE_URL（可建立資料庫的 PostgreSQL）與 POSTGREST_BIN（PostgREST 執行檔）。
 */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgresql://anxin:anxin@localhost:5432/postgres";
const root = path.resolve(import.meta.dirname, "..");

let stackPromise: Promise<Stack> | null = null;
export function getStack(): Promise<Stack> {
  stackPromise ??= startStack({
    adminUrl: ADMIN_URL,
    postgrestBin: process.env.POSTGREST_BIN ?? "postgrest",
    migrationsDir: path.join(root, "supabase/migrations"),
    shimSql: path.join(root, "tests/sql/supabase-shim.sql"),
  });
  return stackPromise;
}

afterAll(async () => {
  if (stackPromise) await (await stackPromise).stop();
  stackPromise = null;
});

export interface TestUser {
  id: string;
  email: string;
  db: Db;
}

export async function clientFor(jwt: string | null): Promise<Db> {
  const s = await getStack();
  return createClient(s.url, s.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt ?? s.anonKey}` } },
  });
}

let counter = 0;
export async function newUser(label = "user"): Promise<TestUser> {
  const s = await getStack();
  const u = await s.createUser(`${label}-${++counter}-${Math.random().toString(36).slice(2, 7)}@test.local`);
  return { id: u.id, email: u.email, db: await clientFor(u.jwt) };
}

export interface TestDb extends TestUser {
  householdId: string;
  inviteCode: string;
  cleanup: () => Promise<void>;
}

/** 建立一個已登入、而且有自己家庭的使用者（每次都是全新的家庭，彼此資料互相看不到）。 */
export async function createTestDb(): Promise<TestDb> {
  const user = await newUser("owner");
  const { data, error } = await user.db.rpc("create_household", { p_name: "測試家", p_display_name: "測試者" });
  if (error) throw new Error(error.message);
  const h = await user.db.from("households").select("invite_code").eq("id", data).single();
  return { ...user, db: user.db, householdId: data as string, inviteCode: h.data!.invite_code as string, cleanup: async () => {} };
}

export const entry = (over: Partial<{ date: string; category: string; amount: number; note: string | null }> = {}) => ({
  date: "2026-11-01",
  category: "吃飯買菜",
  amount: 500,
  note: null as string | null,
  ...over,
});

/** 直接讀資料表（以該使用者身分，受 RLS 限制）。 */
export async function count(db: Db, table: string): Promise<number> {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return n ?? 0;
}
export async function allExpenses(db: Db) {
  const { data, error } = await db.from("expenses").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, debtPaymentId: r.debt_payment_id as string | null, note: r.note as string | null }));
}
export async function expenseByPayment(db: Db, paymentId: string) {
  const { data, error } = await db.from("expenses").select("*").eq("debt_payment_id", paymentId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
