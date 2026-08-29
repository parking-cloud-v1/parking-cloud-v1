# 智驛停車營運雲端平台 V1

這是全新重建的第一階段骨架，不沿用舊 V3。

## 已完成
- Supabase Email/Password 登入
- 主管 / 場站管理員角色
- 多停車場資料模型
- 使用者與停車場分配表
- Row Level Security 基礎權限
- Dashboard
- 停車場管理頁
- 響應式手機 / 電腦版介面

## 啟動
1. 建立 Supabase 專案。
2. SQL Editor 執行 `supabase/schema.sql`。
3. Authentication 建立第一個帳號。
4. 將該帳號在 `profiles` 的 role 更新為 `supervisor`。
5. 複製 `.env.local.example` 為 `.env.local`，填入 Supabase URL 與 anon key。
6. 執行：
   npm install
   npm run dev
7. 開啟 http://localhost:3000

## 下一階段
- 帳號與權限管理 UI
- 月租管理
- 候補名單
- 巡檢 / 缺失 / 防災
- 報表與 Excel/CSV
