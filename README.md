# 安心記帳本

給長輩與家人使用的每月收支記帳本：大字體、簡單操作、預算與債務提醒、全家共用。

技術架構：**Next.js + TypeScript + Tailwind CSS**（網站）／**Supabase PostgreSQL**（資料庫）／**Supabase Auth**（家人登入）／**Row Level Security**（家庭資料隔離）／**Vercel**（部署）。

功能：收入、支出、每月預算（80%／100%／超支雙重提醒）、債務管理與還款時間表、還款自動連動支出、「真正可以使用的錢」、家庭共享（邀請碼）、備份與還原（JSON／CSV）、手機優先的響應式畫面與 PWA。

## 資料如何被保護

- 每位家人用**自己的電子郵件與密碼**登入（Supabase Auth），沒登入看不到任何頁面，也呼叫不了任何資料 API。
- 所有資料表（收入、支出、預算、債務、還款、家庭、成員）都有 `household_id` 並啟用 **RLS**：資料庫只會回傳「你所屬家庭」的列。權限由資料庫強制執行，不是靠前端隱藏按鈕。
- 家庭資料表之間用「含 `household_id` 的複合外鍵」連結，不可能把 A 家的資料掛到 B 家。
- 債務、還款與「債務還款」支出只能透過資料庫函式修改（同一個交易內保持金額一致），無法繞過去直接改表。
- 網站只使用 **anon key**（可公開，安全性來自 RLS）。`SUPABASE_SERVICE_ROLE_KEY` 可繞過 RLS，**網站不讀取、請不要設定到 Vercel**。

## 本機開發

```bash
cp .env.example .env.local     # 填入你自己的 Supabase 網址與 anon key（見下方「建立 Supabase 專案」）
npm install
npm run dev                    # http://localhost:3000
```

## 部署步驟（Supabase + Vercel）

完整步驟請看 [DEPLOY.md](./DEPLOY.md)，順序如下：

1. 建立 Supabase 專案，取得 `Project URL` 與 `anon key`
2. 在 Supabase 執行資料庫 Migration（`supabase/migrations/*.sql`）
3. 設定 Auth（網站網址、Redirect URL、是否需要信箱驗證）
4. 把 3 個環境變數中的 2 個設定到 Vercel，部署
5. 註冊第一個帳號 → 建立家庭 → 把邀請碼給家人加入
6. 驗證：兩個同家庭帳號共用資料、另一個家庭看不到

## 環境變數

| 名稱 | 用途 | 設定到 Vercel？ |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案網址 | 要 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon（public）金鑰 | 要 |
| `SUPABASE_SERVICE_ROLE_KEY` | 最高權限金鑰，僅限伺服器端／管理腳本，網站不使用 | **不要** |
| `APP_TIMEZONE` | （選填）日期時區，預設 `Asia/Taipei` | 選填 |

缺少前兩項時，網站會拒絕服務（顯示 503），不會在沒有保護的情況下運作。

## 家庭與成員

- 第一個註冊的人選「建立家庭」，成為**管理者**，並在「設定 → 家庭成員」看到邀請碼。
- 其他家人註冊後選「輸入邀請碼加入」。邀請碼輸入錯誤 5 次會暫時鎖住 15 分鐘。
- 管理者可以更換邀請碼（舊的立刻失效）、移除成員；成員可以自己離開。被移除或離開的人立刻看不到家庭資料。
- 一個帳號只屬於一個家庭。管理者不能直接離開（目前沒有「轉移管理者」功能）。
- 目前沒有「忘記密碼」頁面；忘記密碼時可由 Supabase 後台（Authentication → Users）寄送重設信或重設密碼。

## 資料庫與 Migration

結構與權限全部寫在 `supabase/migrations/`（目前是 `20261103000000_init.sql`）。**只新增、不覆蓋**：之後改結構請新增一個時間較新的 `.sql` 檔，不要修改已執行過的檔案。

執行方式（擇一）：Supabase 後台 **SQL Editor** 貼上整個檔案執行；或安裝 Supabase CLI 後 `supabase link` 再 `supabase db push`。

## 備份與還原

「設定 → 備份與還原」可下載 JSON 備份、CSV（可用 Excel 開）。還原是「合併」：只新增不存在的紀錄，不會覆蓋或刪除現有資料，重複還原不會重複。備份檔包含私人財務資料，請妥善保管。正式開始使用前，請先試一次「備份 → 還原」。

## 測試與檢查

```bash
npm run typecheck && npm run lint
npm test            # 需要 PostgreSQL 與 PostgREST，見下
```

測試不會碰到你的 Supabase：它會在一個**暫時的 PostgreSQL** 上套用同一份 migration，並用真正的 **PostgREST**（Supabase 資料 API 的核心）執行 RLS。需要設定：

```bash
export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/postgres   # 可建立資料庫的帳號
export POSTGREST_BIN=/path/to/postgrest                                    # https://github.com/PostgREST/postgrest/releases
```

測試涵蓋：記帳與提醒邏輯、債務與還款、備份還原、兩個家庭的資料隔離、未登入（anon）完全被擋、沒有家庭的帳號看不到資料、直接寫入被擋、邀請碼與成員權限、超過 1000 筆的分頁匯出。

> 測試用的登入服務是**替身**（`tools/test-gateway`），只模擬註冊／登入／換發憑證，不寄信。因此**真正的 Supabase Auth（信箱驗證、密碼規則、寄信額度）要在你的實際專案上親自驗證**，見 DEPLOY.md 最後的檢查清單。

### 手機畫面自動化驗收（Playwright）

```bash
node tools/test-gateway/run.mjs          # 啟動測試環境，會印出 URL 與 anon key（保持執行）
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run build && npx next start -p 3111
BASE_URL=http://localhost:3111 npm run test:e2e
```

## 安全提醒

- 不要把 `.env.local`、任何金鑰提交到 Git（`.gitignore` 已排除）。
- 正式使用前，請先在測試環境確認登入、資料隔離與備份都正常；測試期間不要放入正式帳本資料。
- 不要使用共用的簡單密碼；每位家人各自一組。
