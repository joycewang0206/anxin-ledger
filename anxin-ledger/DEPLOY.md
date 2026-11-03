# 部署指南（Supabase + Vercel）

> 先用**測試資料**完成整份清單，確認登入、資料隔離與備份都正常，再開始放正式帳本資料。

## 1. 建立 Supabase 專案

1. 到 <https://supabase.com> 登入 → **New project**，選區域（台灣使用者建議 Singapore 或 Tokyo），設定資料庫密碼（自己保管，網站不需要它）。
2. 專案建好後到 **Project Settings → API**（或 **Connect**），記下：
   - **Project URL**（`https://xxxx.supabase.co`）→ `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - 另有 **service_role key**：**不要**貼到網站或 Vercel，也不要傳給任何人。

## 2. 執行資料庫 Migration

1. Supabase 後台 → **SQL Editor** → New query。
2. 開啟專案內的 `supabase/migrations/20261103000000_init.sql`，整個內容貼上，按 **Run**。應顯示 Success（沒有錯誤）。
3. 到 **Table Editor** 確認有 `households`、`household_members`、`incomes`、`expenses`、`monthly_budgets`、`debts`、`debt_payments`，且每張表旁邊顯示 **RLS enabled**。
4. （進階）改用 CLI：`supabase link --project-ref <ref>` 後 `supabase db push`。

之後若有新的 migration 檔，依檔名順序再執行新的那幾個，不要重跑舊的。

## 3. 設定 Auth

**Authentication → Providers → Email**：保持啟用。

**Authentication → URL Configuration**：
- **Site URL**：你的正式網址，例如 `https://你的專案.vercel.app`
- **Redirect URLs**：加入 `https://你的專案.vercel.app/auth/callback`（本機測試再加 `http://localhost:3000/auth/callback`）

信箱驗證（**Confirm email**）：
- 開啟（建議）：註冊後家人要點信中連結才能登入。Supabase 內建寄信有嚴格的寄信頻率限制，家人多或常重寄時，建議在 **Authentication → SMTP Settings** 設定自己的寄信服務。
- 關閉：註冊後直接登入，最省事，但任何人都能用任何信箱註冊。因為**沒有邀請碼就看不到任何家庭資料**，風險有限，但仍建議保持開啟。

**建立家人帳號**有兩種方式：
- 讓家人自己到網站 `/signup` 註冊（推薦）。
- 或由管理者在 **Authentication → Users → Add user** 建立帳號（可勾選 Auto Confirm User），再把密碼私下告知，請對方登入後改用自己的密碼。

> 若想完全禁止陌生人註冊，可在建立完所有家人帳號後，到 **Authentication → Sign In / Providers**（或 Settings）關閉 **Allow new users to sign up**；之後新家人由管理者用 Add user 建立。

## 4. 部署到 Vercel

1. 把專案放上 GitHub（私人 repo）。確認沒有 `.env*` 檔被提交（`.gitignore` 已排除）。
2. Vercel → **Add New → Project** → 匯入該 repo，Framework 會自動辨識為 Next.js。
3. **Environment Variables** 只新增這兩個（Production / Preview 都勾）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - （選填）`APP_TIMEZONE` = `Asia/Taipei`
   - **不要**新增 `SUPABASE_SERVICE_ROLE_KEY`。
4. **Deploy**。完成後把網址填回上一步 Supabase 的 Site URL 與 Redirect URLs。
5. 沒有 GitHub 時也可以用 CLI：`npx vercel`（首次會要你登入並連結專案），設定好環境變數後 `npx vercel --prod`。

> 環境變數是在「建置時」打包進網站的（`NEXT_PUBLIC_` 開頭），之後若修改，需要重新部署才會生效。

## 5. 驗證清單（務必親自做完）

用 **3 個測試帳號**（A、B、C，三個不同信箱）：

- [ ] 沒登入時，網站任何頁面都導向登入頁；直接開 `/api/export/json` 回 401
- [ ] A 註冊 →（如開啟驗證）點信中連結 → 建立家庭「測試家」→ 設定頁看到邀請碼
- [ ] B 註冊 → 輸入 A 的邀請碼加入 → 看到 A 記的帳
- [ ] A、B 輪流新增收入、支出、預算、債務、還款 → 雙方重新整理後看到同樣的數字與提醒
- [ ] C 註冊 → 建立**另一個**家庭 → 首頁、紀錄、債務、報表、備份匯出都是空的；用 A 家的債務網址直接開 → 找不到
- [ ] A 在設定頁「移除」B → B 重新整理後只剩建立／加入家庭頁，看不到資料
- [ ] 下載 JSON 備份 → 在另一個測試家庭還原 → 數字一致；再還原一次不會變成兩倍
- [ ] 手機（iPhone Safari／Android Chrome）開啟網站，登入、記帳、加入主畫面

全部通過後，再刪掉測試帳號與測試家庭（Authentication → Users 刪帳號會連同其成員關係一併移除），開始正式使用。

## 常見問題

- **網站顯示「尚未完成設定」（503）**：Vercel 的兩個環境變數沒設或貼錯，補上後重新部署。
- **註冊後收不到信**：先看垃圾郵件；Supabase 內建寄信限制很低，請設定自己的 SMTP。
- **點驗證信後回到登入頁並顯示連結失效**：Redirect URLs 沒有加入 `/auth/callback`，或連結已過期，直接用信箱密碼登入即可。
- **忘記密碼**：Authentication → Users → 該帳號 → Send password recovery，或直接設定新密碼。
