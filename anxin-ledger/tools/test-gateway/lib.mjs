// 測試用的 Supabase 替身環境（只供自動化測試使用，絕對不是正式環境的一部分）。
//
//   真的：PostgreSQL（你的資料庫）＋ PostgREST（Supabase 的資料 API，RLS 由資料庫實際執行）
//   假的：登入服務（只實作 signup / 密碼登入 / refresh / user / logout 幾個端點，沒有寄信、沒有驗證信流程）
//
// 因此這裡能驗證「資料隔離、權限、交易函式、網站與資料庫的整合」，
// 但驗證不到真正的 Supabase Auth（信箱驗證、密碼規則、寄信額度等），那部分要在真的 Supabase 專案上確認。
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import pg from "pg";

const b64 = (b) => Buffer.from(b).toString("base64url");

export function signJwt(payload, secret) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const expect = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  const a = Buffer.from(expect), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitFor(fn, what, ms = 15000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < ms) {
    try {
      if (await fn()) return;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`等不到 ${what}${last ? `：${last.message}` : ""}`);
}

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

function json(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(crypto.scryptSync(pw, salt, 32).toString("hex")), b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 建立一個全新的測試資料庫、套用 shim 與 migration、啟動 PostgREST 與閘道。
 * options: { adminUrl, postgrestBin, jwtSecret?, migrationsDir, shimSql, auth?: boolean, requireConfirm?: boolean }
 */
export async function startStack(options) {
  const jwtSecret = options.jwtSecret ?? crypto.randomBytes(32).toString("hex");
  const dbName = options.dbName ?? `anxin_test_${crypto.randomBytes(5).toString("hex")}`;
  const admin = new pg.Client({ connectionString: options.adminUrl });
  await admin.connect().catch((e) => {
    throw new Error(`連不上測試用 PostgreSQL（${options.adminUrl}）：${e.message}`);
  });
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const dbUrl = new URL(options.adminUrl);
  dbUrl.pathname = `/${dbName}`;
  const db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  await db.query(fs.readFileSync(options.shimSql, "utf8"));
  const files = fs.readdirSync(options.migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) await db.query(fs.readFileSync(path.join(options.migrationsDir, f), "utf8"));

  // PostgREST 以 authenticator 角色連線，再依 JWT 切換成 anon / authenticated（與 Supabase 相同）
  const restPort = await freePort();
  const adminPort = await freePort();
  const authUrl = new URL(dbUrl.toString());
  authUrl.username = "authenticator";
  authUrl.password = "";
  const logs = [];
  const child = spawn(options.postgrestBin, [], {
    env: {
      PATH: process.env.PATH,
      PGRST_DB_URI: authUrl.toString(),
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: jwtSecret,
      PGRST_DB_MAX_ROWS: "1000", // Supabase 預設也是 1000：用來確認程式有做分頁
      PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: String(restPort),
      PGRST_ADMIN_SERVER_PORT: String(adminPort),
      PGRST_DB_POOL: "8",
      PGRST_LOG_LEVEL: "error",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => logs.push(String(d)));
  child.stderr.on("data", (d) => logs.push(String(d)));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${adminPort}/ready`)).ok, `PostgREST 啟動\n${logs.join("")}`);

  const anonKey = signJwt({ role: "anon", iss: "test-gateway", iat: 0, exp: 4102444800 }, jwtSecret);

  // ---- 閘道：/rest/v1 轉給 PostgREST；/auth/v1 為登入替身 ----
  const sessions = new Map(); // refresh_token -> user id
  const userRow = async (where, val) => (await db.query(`select * from auth.users where ${where} = $1`, [val])).rows[0];
  const publicUser = (u) => ({
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.created_at, phone: "", confirmed_at: u.created_at, last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.raw_user_meta_data ?? {},
    identities: [], created_at: u.created_at, updated_at: u.created_at, is_anonymous: false,
  });
  const issue = (u) => {
    const now = Math.floor(Date.now() / 1000);
    const access = signJwt({
      iss: "test-gateway/auth/v1", aud: "authenticated", sub: u.id, email: u.email, role: "authenticated",
      aal: "aal1", amr: [{ method: "password", timestamp: now }], session_id: crypto.randomUUID(),
      app_metadata: { provider: "email" }, user_metadata: u.raw_user_meta_data ?? {}, iat: now, exp: now + 3600,
    }, jwtSecret);
    const refresh = crypto.randomBytes(12).toString("hex");
    sessions.set(refresh, u.id);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: publicUser(u) };
  };
  const authErr = (res, status, error_code, msg) => json(res, status, { code: status, error_code, msg });

  async function handleAuth(req, res, url) {
    const route = url.pathname.replace("/auth/v1", "");
    const body = req.method === "POST" ? JSON.parse((await readBody(req)).toString() || "{}") : {};
    if (route === "/signup" && req.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr(res, 422, "validation_failed", "Unable to validate email address: invalid format");
      if (String(body.password || "").length < 6) return authErr(res, 422, "weak_password", "Password should be at least 6 characters.");
      if (await userRow("email", email)) return authErr(res, 422, "user_already_exists", "User already registered");
      const { rows } = await db.query(
        `insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1,$2,$3) returning *`,
        [email, hashPassword(body.password), body.data ?? {}],
      );
      if (options.requireConfirm) return json(res, 200, publicUser({ ...rows[0] }));
      return json(res, 200, issue(rows[0]));
    }
    if (route === "/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const u = await userRow("email", String(body.email || "").trim().toLowerCase());
        if (!u || !checkPassword(String(body.password || ""), u.encrypted_password)) return authErr(res, 400, "invalid_credentials", "Invalid login credentials");
        return json(res, 200, issue(u));
      }
      if (grant === "refresh_token") {
        const uid = sessions.get(body.refresh_token);
        if (!uid) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        sessions.delete(body.refresh_token);
        return json(res, 200, issue(await userRow("id", uid)));
      }
    }
    if (route === "/user" && req.method === "GET") {
      const claims = verifyJwt((req.headers.authorization || "").replace(/^Bearer /i, ""), jwtSecret);
      if (!claims || claims.role !== "authenticated") return authErr(res, 401, "bad_jwt", "invalid JWT");
      const u = await userRow("id", claims.sub);
      return u ? json(res, 200, publicUser(u)) : authErr(res, 403, "user_not_found", "User from sub claim in JWT does not exist");
    }
    if (route === "/logout" && req.method === "POST") {
      res.writeHead(204);
      return res.end();
    }
    return authErr(res, 404, "not_found", `no such test endpoint: ${req.method} ${route}`);
  }

  const gateway = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname.startsWith("/rest/v1")) {
        const headers = { ...req.headers };
        delete headers.host;
        const upstream = http.request(
          { host: "127.0.0.1", port: restPort, method: req.method, path: url.pathname.replace("/rest/v1", "") + url.search, headers },
          (r) => {
            res.writeHead(r.statusCode ?? 502, r.headers);
            r.pipe(res);
          },
        );
        upstream.on("error", (e) => json(res, 502, { message: String(e) }));
        req.pipe(upstream);
        return;
      }
      if (options.auth && url.pathname.startsWith("/auth/v1")) return await handleAuth(req, res, url);
      json(res, 404, { message: "not found" });
    } catch (e) {
      json(res, 500, { message: String(e?.stack ?? e) });
    }
  });
  await new Promise((r) => gateway.listen(options.gatewayPort ?? 0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${gateway.address().port}`;

  return {
    url,
    anonKey,
    jwtSecret,
    dbUrl: dbUrl.toString(),
    dbName,
    /** 直接在資料庫建立一個登入帳號並簽發它的 JWT（測試捷徑，不經過登入替身）。 */
    async createUser(email) {
      const { rows } = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
      const now = Math.floor(Date.now() / 1000);
      const jwt = signJwt({ aud: "authenticated", sub: rows[0].id, email, role: "authenticated", iat: now, exp: now + 3600 }, jwtSecret);
      return { id: rows[0].id, email, jwt };
    },
    query: (sql, params) => db.query(sql, params),
    async stop() {
      await new Promise((r) => gateway.close(r));
      child.kill("SIGTERM");
      await new Promise((r) => (child.exitCode !== null ? r() : child.once("exit", r)));
      await db.end();
      const a = new pg.Client({ connectionString: options.adminUrl });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await a.end();
    },
  };
}
