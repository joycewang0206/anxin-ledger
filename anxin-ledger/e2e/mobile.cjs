// 手機／電腦響應式驗收（Playwright）。
// 用法：先啟動測試環境（node tools/test-gateway/run.mjs）與網站，再 BASE_URL=http://localhost:3111 node e2e/mobile.cjs
// 需要先安裝 playwright（npm i -D playwright && npx playwright install chromium），並且啟動網站（正式版或開發版皆可）。
// 注意：這個腳本會註冊測試帳號並新增測試資料，請只對全新的「測試用」環境執行，不要對正式的 Supabase 專案執行。
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL || "http://localhost:3111";
const PASSWORD = "e2e-password-123";
const RUN = Date.now().toString(36);
const OWNER = `owner-${RUN}@e2e.test`;
const MEMBER = `member-${RUN}@e2e.test`;
const STRANGER = `stranger-${RUN}@e2e.test`;
const SHOTS = process.env.SHOT_DIR || path.join(process.cwd(), "e2e-shots");
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  —  " + String(detail).replace(/\s+/g, " ") : ""}`);
}

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];
const PAGES = ["/", "/add", "/income/new", "/expense/new", "/records", "/report", "/settings", "/debts", "/debts/new"];

async function newCtx(browser, width, height = 800) {
  const mobile = width < 768;
  return browser.newContext({
    baseURL: BASE,
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
  });
}

async function login(page, email = OWNER, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "登入", exact: true }).click();
}

// 註冊新帳號（測試環境的登入替身不寄信，註冊後直接登入並進入「建立／加入家庭」頁）
async function signup(page, email) {
  await page.goto("/signup");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#password2", PASSWORD);
  await page.getByRole("button", { name: "註冊", exact: true }).click();
  await page.waitForURL(/\/onboarding/);
}
async function createHousehold(page, name, who) {
  await page.fill("#c-name", name);
  await page.fill("#c-display", who);
  await page.getByRole("button", { name: "建立家庭" }).click();
  await page.waitForURL(/saved=household/);
}
async function joinHousehold(page, code, who) {
  await page.fill("#j-code", code);
  await page.fill("#j-display", who);
  await page.getByRole("button", { name: "加入家庭" }).click();
}

async function dismissModalIfAny(page) {
  const btn = page.getByRole("button", { name: "我知道了" });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function overflowOf(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === "fixed" && r.right <= vw + 1) continue;
      if (r.right > vw + 1 || r.left < -1) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} (${Math.round(r.left)}→${Math.round(r.right)})`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, vw, bad: bad.slice(0, 5) };
  });
}

async function addEntry(page, kind, category, amount) {
  await page.goto(kind === "income" ? "/income/new" : "/expense/new");
  await page.locator(`label.choice:has(input[value="${category}"])`).click();
  await page.fill("#amount", String(amount));
  await page.getByRole("button", { name: /儲存/ }).click();
  await page.waitForURL(/saved=/);
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. 沒登入不能看資料 ----------
  {
    const ctx = await newCtx(browser, 390);
    const r = ctx.request;
    const home = await r.get("/", { maxRedirects: 0 });
    check("未登入：首頁導向登入頁", home.status() >= 300 && home.status() < 400 && (home.headers()["location"] || "").includes("/login"), `status ${home.status()}`);
    for (const p of ["/debts", "/records", "/report", "/settings", "/income/new"]) {
      const x = await r.get(p, { maxRedirects: 0 });
      check(`未登入：${p} 不能直接看`, x.status() >= 300 && x.status() < 400);
    }
    const api = await r.get("/api/export/json", { maxRedirects: 0 });
    check("未登入：備份匯出 API 回 401", api.status() === 401, `status ${api.status()}`);
    const csv = await r.get("/api/export/csv", { maxRedirects: 0 });
    check("未登入：CSV 匯出 API 回 401", csv.status() === 401, `status ${csv.status()}`);
    const man = await r.get("/manifest.webmanifest");
    const mj = man.ok() ? await man.json() : {};
    check("PWA：登入前就能讀到 manifest（可安裝）", man.ok() && mj.display === "standalone" && mj.icons?.length >= 3 && mj.theme_color, `display=${mj.display} icons=${mj.icons?.length}`);
    check("PWA：manifest 名稱與起始網址", mj.name === "安心記帳本" && mj.start_url === "/", `${mj.name} ${mj.start_url}`);
    const ic = await r.get("/icons/icon-192.png");
    check("PWA：圖示可讀取", ic.ok() && (ic.headers()["content-type"] || "").includes("image/png"));
    const icm = await r.get("/icons/icon-maskable-512.png");
    check("PWA：maskable 圖示可讀取", icm.ok());
    const page = await ctx.newPage();
    await page.goto("/login");
    const head = await page.evaluate(() => ({
      manifest: !!document.querySelector('link[rel="manifest"]'),
      viewport: document.querySelector('meta[name="viewport"]')?.content || "",
      theme: document.querySelector('meta[name="theme-color"]')?.content || "",
      apple: !!document.querySelector('link[rel="apple-touch-icon"]'),
      sw: "serviceWorker" in navigator ? null : "n/a",
    }));
    check("PWA：頁首有 manifest / theme-color / apple-touch-icon", head.manifest && head.theme && head.apple, JSON.stringify(head));
    check("手機：viewport 設定正確（含 viewport-fit=cover）", /width=device-width/.test(head.viewport) && /viewport-fit=cover/.test(head.viewport), head.viewport);
    const regs = await page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0));
    check("PWA：沒有註冊 Service Worker（不會快取到舊資料）", regs === 0, `registrations=${regs}`);
    // 登入頁在 320 沒有水平溢出
    await page.setViewportSize({ width: 320, height: 640 });
    const o = await overflowOf(page);
    check("320px：登入頁沒有水平溢出", o.scrollWidth <= o.vw && o.bad.length === 0, JSON.stringify(o));
    // 錯誤密碼
    await login(page, "nobody@e2e.test", "wrong-password-xx");
    await page.getByText("電子郵件或密碼不正確").waitFor({ timeout: 8000 }).catch(() => {});
    check("登入：錯誤的帳號密碼會被拒絕並顯示提示", await page.getByText("電子郵件或密碼不正確").isVisible());
    const onb = await ctx.request.get("/onboarding", { maxRedirects: 0 });
    check("未登入：/onboarding 不能直接看", onb.status() >= 300 && onb.status() < 400);
    const sg = await ctx.request.get("/signup", { maxRedirects: 0 });
    check("未登入：註冊頁可以打開", sg.status() === 200);
    check("登入：錯誤密碼後仍然看不到資料", (await ctx.request.get("/", { maxRedirects: 0 })).status() >= 300);
    await ctx.close();
  }

  // ---------- 2. 手機登入並建立測試資料 ----------
  const mctx = await newCtx(browser, 390, 844);
  const m = await mctx.newPage();
  const consoleErrors = [];
  m.on("pageerror", (e) => consoleErrors.push(String(e)));
  await signup(m, OWNER);
  check("註冊：新帳號先到「建立或加入家庭」頁，而不是直接看到帳本", /\/onboarding/.test(m.url()) && (await m.locator('nav[aria-label="手機主選單"]').count()) === 0);
  const early = await mctx.request.get("/records", { maxRedirects: 0 });
  check("還沒有家庭的帳號：看不到帳本頁面（導向建立家庭）", early.status() >= 300 && (early.headers()["location"] || "").includes("/onboarding"), `status ${early.status()}`);
  const earlyApi = await mctx.request.get("/api/export/json", { maxRedirects: 0 });
  check("還沒有家庭的帳號：備份匯出回 403", earlyApi.status() === 403, `status ${earlyApi.status()}`);
  await createHousehold(m, "測試之家", "爸爸");
  check("建立家庭：進入首頁", new URL(m.url()).pathname === "/", m.url());
  check("手機：登入後底部導覽列出現（5 個按鈕）", (await m.locator('nav[aria-label="手機主選單"] a').count()) === 5);

  // 預算 30,000
  await m.goto("/settings");
  await m.fill("#budget", "30000");
  await m.getByRole("button", { name: "儲存這個月的預算" }).click();
  await m.waitForURL(/saved=/);
  // 薪水 40,000
  await addEntry(m, "income", "薪水", 40000);
  await dismissModalIfAny(m);
  const incomeShown = await m.getByText("40,000").first().isVisible().catch(() => false);
  check("驗收：新增薪水 40,000，首頁收入顯示正確", incomeShown);

  // 支出 24,000 -> 80%
  await addEntry(m, "expense", "吃飯買菜", 24000);
  let dlg = m.locator('[role="alertdialog"]');
  check("驗收：支出 24,000 → 顯示預算使用 80% 提醒", (await dlg.count()) === 1 && /快要超過/.test(await dlg.innerText()), (await dlg.allInnerTexts()).join("|").slice(0, 80));
  await m.screenshot({ path: path.join(SHOTS, "390-alert-80.png") });
  await m.getByRole("button", { name: "我知道了" }).click();
  check("提醒：按「我知道了」後視窗關閉", (await dlg.count()) === 0);

  // 支出 6,000 -> 100%
  await addEntry(m, "expense", "水電瓦斯", 6000);
  check("驗收：再支出 6,000 → 顯示預算已用完", /用完/.test(await dlg.innerText()));
  await m.getByRole("button", { name: "我知道了" }).click();

  // 支出 10,500 -> 總 40,500，同時超過預算與薪水
  await addEntry(m, "expense", "休閒娛樂", 10500);
  const txt = await dlg.innerText();
  check("驗收：同時超過預算與薪水 → 只有一個提醒視窗", (await dlg.count()) === 1);
  check("驗收：單一視窗同時列出兩種超支與金額", /預算/.test(txt) && /收入/.test(txt) && /10,500/.test(txt) && /500/.test(txt), txt.replace(/\s+/g, " ").slice(0, 160));
  await m.screenshot({ path: path.join(SHOTS, "390-alert-double.png") });
  await m.getByRole("button", { name: "我知道了" }).click();
  check("首頁：支出合計 40,500", await m.getByText("40,500").first().isVisible());

  // 債務
  await m.goto("/debts/new");
  await m.fill("#name", "銀行貸款");
  await m.fill("#creditor", "某某銀行");
  await m.fill("#originalPrincipal", "200000");
  await m.fill("#monthlyPayment", "5000");
  await m.fill("#paymentDay", "15");
  await m.getByRole("button", { name: /儲存/ }).click();
  await m.waitForURL(/saved=debt/);
  await dismissModalIfAny(m);

  // ---------- 3. 債務卡片 430px ----------
  await m.setViewportSize({ width: 430, height: 900 });
  await m.goto("/debts");
  await dismissModalIfAny(m);
  const card = m.locator("article", { hasText: "銀行貸款" }).first();
  const cb = await card.boundingBox();
  check("430px：債務卡片完整顯示在畫面內", cb && cb.x >= 0 && cb.x + cb.width <= 430 + 1, JSON.stringify(cb));
  const cardText = await card.innerText();
  check("430px：卡片有名稱、剩餘本金、進度、預計還清、記錄還款", ["銀行貸款", "200,000", "預計", "記錄還款", "%"].every((t) => cardText.includes(t)), cardText.replace(/\s+/g, " ").slice(0, 120));
  await m.screenshot({ path: path.join(SHOTS, "430-debts.png"), fullPage: true });

  // 明細頁 + 時間表
  await card.getByRole("link", { name: "查看明細" }).click();
  await m.waitForURL(/\/debts\/[^/]+$/);
  const rows = await m.locator('ol > li[data-status]').count();
  check("債務明細頁可開啟，並顯示還款時間表（月份卡片）", rows >= 6, `rows=${rows}`);
  check("時間表：有待還款狀態與剩餘本金", (await m.locator('li[data-status="pending"], li[data-status="due-today"], li[data-status="overdue"]').count()) > 0);
  await m.screenshot({ path: path.join(SHOTS, "430-debt-detail.png"), fullPage: true });

  // 記錄還款
  await m.getByRole("link", { name: /我已經還款/ }).click();
  await m.waitForURL(/\/pay/);
  const amountVal = await m.inputValue("#amount");
  check("還款：預設金額為每月還款 5,000", amountVal === "5000", amountVal);
  await m.getByRole("button", { name: "確認還款" }).click();
  await m.waitForURL(/saved=/);
  await dismissModalIfAny(m);
  await m.goto("/");
  await dismissModalIfAny(m);
  const home = await m.locator("main").innerText();
  check("驗收：新增還款後首頁支出更新為 45,500", /45,500/.test(home));
  check("驗收：首頁顯示債務還款與剩餘債務 195,000", /債務還款/.test(home) && /195,000/.test(home));
  await m.goto("/debts");
  await dismissModalIfAny(m);
  check("債務頁：目前還欠 195,000", /195,000/.test(await m.locator("main").innerText()));

  // ---------- 4. 各寬度：水平溢出、按鈕大小、底部導覽 ----------
  for (const w of WIDTHS) {
    const ctx = await newCtx(browser, w, w < 768 ? 800 : 900);
    await ctx.addCookies(await mctx.cookies());
    const p = await ctx.newPage();
    const bad = [];
    for (const url of PAGES) {
      await p.goto(url);
      await dismissModalIfAny(p);
      const o = await overflowOf(p);
      if (o.scrollWidth > o.vw || o.bad.length) bad.push(`${url}: scrollWidth ${o.scrollWidth} > ${o.vw} ${o.bad.join("; ")}`);
    }
    check(`${w}px：所有頁面沒有水平溢出`, bad.length === 0, bad.join(" | "));
    if (w === 320 || w === 375 || w === 390 || w === 430) {
      await p.goto("/");
      await dismissModalIfAny(p);
      await p.screenshot({ path: path.join(SHOTS, `${w}-home.png`), fullPage: true });
    }
    if (w === 1440) {
      await p.goto("/");
      await dismissModalIfAny(p);
      await p.screenshot({ path: path.join(SHOTS, `1440-home.png`), fullPage: true });
    }
    await ctx.close();
  }

  // 按鈕大小（手機 390）
  {
    const small = [];
    for (const url of PAGES) {
      await m.setViewportSize({ width: 390, height: 844 });
      await m.goto(url);
      await dismissModalIfAny(m);
      const found = await m.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("main .btn, main button, main a.btn")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.height < 60) out.push(`${(el.textContent || "").trim().slice(0, 12)}:${Math.round(r.height)}`);
        }
        const touch = [];
        for (const el of document.querySelectorAll("main a, main button, main input:not([type=radio]):not([type=checkbox]):not([type=hidden])")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.height < 48) touch.push(`${(el.textContent || el.id || "").trim().slice(0, 12)}:${Math.round(r.height)}`);
        }
        return { out, touch };
      });
      if (found.out.length) small.push(`${url} 按鈕<60px → ${found.out.join(",")}`);
      if (found.touch.length) small.push(`${url} 可點擊<48px → ${found.touch.join(",")}`);
    }
    check("手機：主要按鈕高度 ≥ 60px、可點擊範圍 ≥ 48px", small.length === 0, small.join(" | "));
  }

  // 底部導覽：高度、安全區域、不遮住內容
  {
    await m.setViewportSize({ width: 390, height: 844 });
    const problems = [];
    for (const url of PAGES) {
      await m.goto(url);
      await dismissModalIfAny(m);
      await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const info = await m.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="手機主選單"]');
        const main = document.querySelector("main");
        const nb = nav.getBoundingClientRect();
        let last = 0;
        for (const el of main.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.height > 0) last = Math.max(last, r.bottom);
        }
        const links = [...nav.querySelectorAll("a")].map((a) => Math.round(a.getBoundingClientRect().height));
        return { navTop: nb.top, navH: nb.height, last, minLink: Math.min(...links), style: nav.getAttribute("style") || "" };
      });
      if (info.last > info.navTop + 1) problems.push(`${url}: 內容底部 ${Math.round(info.last)} 被導覽列 ${Math.round(info.navTop)} 遮住`);
      if (info.minLink < 64) problems.push(`${url}: 導覽按鈕高度 ${info.minLink}`);
      if (!/safe-area-inset-bottom/.test(info.style)) problems.push(`${url}: 沒有 safe-area-inset-bottom`);
    }
    check("手機：底部導覽列 ≥64px、使用 safe-area-inset-bottom、不遮住內容", problems.length === 0, problems.join(" | "));
    await m.goto("/");
    const labels = (await m.locator('nav[aria-label="手機主選單"] a').allInnerTexts()).map((t) => t.replace(/\s+/g, "").replace(/[^一-鿿]/g, ""));
    check("手機：底部導覽順序為 首頁/記帳/債務/報表/設定", labels.join(",") === "首頁,記帳,債務,報表,設定", labels.join(","));
    await m.getByRole("link", { name: /記帳/ }).last().click();
    await m.waitForURL(/\/add/);
    check("手機：點「記帳」進入記收入／記支出選擇頁", await m.getByText("記收入").first().isVisible());
  }

  // 表格在手機上不能有橫向捲動
  {
    await m.setViewportSize({ width: 320, height: 640 });
    const wide = [];
    for (const url of ["/records", "/report", "/debts"]) {
      await m.goto(url);
      await dismissModalIfAny(m);
      const t = await m.evaluate(() => [...document.querySelectorAll("table")].filter((t) => t.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length);
      if (t) wide.push(url);
    }
    check("320px：沒有需要左右滑動的表格", wide.length === 0, wide.join(","));
  }

  // ---------- 5. 320px 提醒視窗 ----------
  {
    const ctx = await newCtx(browser, 320, 568);
    await ctx.addCookies(await mctx.cookies());
    const p = await ctx.newPage();
    await p.goto("/");
    const d = p.locator('[role="alertdialog"]');
    await d.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    const visible = await d.isVisible().catch(() => false);
    check("320px：（新瀏覽器）超支提醒會再次顯示", visible);
    if (visible) {
      const box = await d.boundingBox();
      const btn = p.getByRole("button", { name: "我知道了" });
      const bb = await btn.boundingBox();
      check("320px：提醒視窗在畫面內（全寬或接近全寬）", box.x >= 0 && box.x + box.width <= 320 + 1 && box.width >= 290 && box.y >= 0 && box.y + box.height <= 568 + 1, JSON.stringify(box));
      check("320px：「我知道了」按鈕完整可見且高度 ≥ 60px", bb && bb.y >= 0 && bb.y + bb.height <= 568 && bb.height >= 60, JSON.stringify(bb));
      await p.screenshot({ path: path.join(SHOTS, "320-alert.png") });
      const pageText = () =>
        p.evaluate(() => {
          const c = document.querySelector("main").cloneNode(true);
          c.querySelectorAll('[role="alertdialog"]').forEach((n) => n.parentElement.remove());
          return c.innerText;
        });
      const before = await pageText();
      await btn.click();
      check("320px：提醒可關閉", (await d.count()) === 0);
      await p.reload();
      check("提醒：同樣狀態下重新整理不會再彈出", (await p.locator('[role="alertdialog"]').count()) === 0);
      const after = await pageText();
      check("提醒：關閉提醒不會改變記帳資料（頁面內容完全相同）", before === after && /45,623|45,500/.test(after));
    }
    await ctx.close();
  }

  // ---------- 6. 電腦與手機同一資料來源 ----------
  {
    const dctx = await newCtx(browser, 1440, 900);
    const d = await dctx.newPage();
    await login(d, OWNER);
    await d.waitForURL(`${BASE}/`);
    await dismissModalIfAny(d);
    check("電腦（1440px）：側邊導覽列顯示、底部導覽列隱藏", (await d.locator('nav[aria-label="主選單"]').isVisible()) && !(await d.locator('nav[aria-label="手機主選單"]').isVisible()));
    check("電腦與手機：看到相同的本月支出 45,500", /45,500/.test(await d.locator("main").innerText()));
    await m.setViewportSize({ width: 390, height: 844 });
    await addEntry(m, "expense", "交通費", 123);
    await dismissModalIfAny(m);
    await d.reload();
    await dismissModalIfAny(d);
    check("電腦與手機：手機新增 123 元後，電腦重新整理即時看到 45,623", /45,623/.test(await d.locator("main").innerText()));
    // 修改／刪除後金額更新
    await d.goto("/records");
    await dismissModalIfAny(d);
    check("紀錄頁：債務還款支出有標示", /債務還款/.test(await d.locator("main").innerText()));
    await dctx.close();
  }

  // ---------- 6b. 家庭共享與資料隔離 ----------
  {
    await m.goto("/settings");
    const code = (await m.locator('[aria-label="邀請碼"]').innerText()).replace(/\s/g, "");
    check("家庭：設定頁顯示邀請碼與成員", code.length === 10 && /爸爸/.test(await m.locator("main").innerText()), code);
    await m.goto("/debts");
    await dismissModalIfAny(m);
    const debtHref = await m.locator('a[href^="/debts/"]:not([href="/debts/new"])').first().getAttribute("href");

    // 第二位家人：註冊、輸入錯誤邀請碼被擋、輸入正確邀請碼加入
    const c2 = await newCtx(browser, 390, 844);
    const p2 = await c2.newPage();
    await signup(p2, MEMBER);
    await joinHousehold(p2, "ZZZZZZZZZZ", "媽媽");
    await p2.getByText("邀請碼不正確").waitFor({ timeout: 8000 }).catch(() => {});
    check("加入家庭：錯誤的邀請碼會被拒絕", await p2.getByText("邀請碼不正確").isVisible());
    await joinHousehold(p2, code, "媽媽");
    await p2.waitForURL(/saved=joined/);
    await dismissModalIfAny(p2);
    check("家人加入後：看到和管理者同一份帳（本月支出 45,623）", /45,623/.test(await p2.locator("main").innerText()));
    await addEntry(p2, "expense", "交通費", 77);
    await m.goto("/");
    await dismissModalIfAny(m);
    check("家人新增 77 元後：管理者重新整理即時看到 45,700", /45,700/.test(await m.locator("main").innerText()));
    await p2.goto("/debts");
    await dismissModalIfAny(p2);
    check("家人也看得到共用的債務", (await p2.locator('a[href^="/debts/"]:not([href="/debts/new"])').count()) >= 1);
    await p2.goto("/settings");
    check("家人（非管理者）看不到「更換邀請碼」，但有「離開這個家庭」", (await p2.getByRole("button", { name: /更換邀請碼/ }).count()) === 0 && (await p2.getByRole("button", { name: /離開這個家庭/ }).count()) === 1);

    // 另一個家庭：什麼都看不到
    const c3 = await newCtx(browser, 390, 844);
    const p3 = await c3.newPage();
    await signup(p3, STRANGER);
    await createHousehold(p3, "別人家", "路人");
    await dismissModalIfAny(p3);
    const home3 = await p3.locator("main").innerText();
    check("另一個家庭：首頁看不到別人的金額", !/45,|40,000/.test(home3), home3.slice(0, 80).replace(/\s+/g, " "));
    const exp3 = await (await c3.request.get("/api/export/json")).json();
    check("另一個家庭：備份匯出是空的（沒有收入、支出、債務）", exp3.data.incomes.length === 0 && exp3.data.expenses.length === 0 && exp3.data.debts.length === 0 && exp3.data.debtPayments.length === 0);
    const csv3 = await (await c3.request.get("/api/export/csv")).text();
    check("另一個家庭：CSV 只有標題列", csv3.trim().split(/\r?\n/).length === 1);
    const other = await c3.request.get(debtHref);
    check("另一個家庭：直接輸入別人家的債務網址 → 找不到（404）", other.status() === 404, `status ${other.status()}`);
    await p3.goto("/records");
    const rec3 = await p3.locator("main").innerText();
    check("另一個家庭：紀錄頁是空的（沒有紀錄、合計 0 元）", /沒有紀錄/.test(rec3) && /收入合計\s*0 元/.test(rec3) && /支出合計\s*0 元/.test(rec3));
    await c3.close();

    // 管理者移除成員後，對方立刻看不到資料
    await m.goto("/settings");
    await m.locator("li", { hasText: "媽媽" }).getByRole("button", { name: "移除" }).click();
    await m.waitForURL(/saved=member-removed/);
    const gone = await c2.request.get("/records", { maxRedirects: 0 });
    check("被移除的成員：立刻看不到家庭資料（導向建立／加入家庭）", gone.status() >= 300 && (gone.headers()["location"] || "").includes("/onboarding"), `status ${gone.status()}`);
    const goneApi = await c2.request.get("/api/export/json", { maxRedirects: 0 });
    check("被移除的成員：備份匯出回 403", goneApi.status() === 403, `status ${goneApi.status()}`);
    await c2.close();
  }

  // ---------- 7. 登出 ----------
  await m.goto("/settings");
  await m.getByRole("button", { name: /登出/ }).last().click();
  await m.waitForURL(/\/login/);
  check("登出：登出後回到登入頁，且不能再看資料", (await mctx.request.get("/", { maxRedirects: 0 })).status() >= 300);

  check("頁面沒有未處理的 JavaScript 錯誤", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 200));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n共 ${results.length} 項檢查，通過 ${results.length - failed.length}，失敗 ${failed.length}`);
  fs.writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error("腳本執行失敗：", e);
  process.exit(2);
});
