# 快速啟動與端對端驗證指南 (Quickstart): 照片相簿日期分組與拖放整理系統

**Feature Branch**: `001-photo-album-organizer`  
**Date**: 2026-10-20  
**Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md) | **Contracts**: [contracts/rest-api.md](./contracts/rest-api.md)

本指南說明如何在本機環境配置 MySQL 資料庫、啟動 Node.js 後端與 Vite 原生 JavaScript 前端，並執行自動化測試與端對端驗收情境。

---

## 1. 環境先決條件 (Prerequisites)

- **Node.js**: `v20.x LTS` 或以上版本（含 `npm`）
- **MySQL**: `8.0` 或以上版本（本機執行於預設埠 `3306`）
- **現代瀏覽器**: Chrome、Edge、Safari 或 Firefox 最新穩定版

---

## 2. 專案安裝與環境設定 (Setup)

### 2.1 建立 MySQL 資料庫與結構

登入本機 MySQL 並建立開發與測試資料庫，接著執行初始化 Schema 腳本（資料表結構詳見 [data-model.md](./data-model.md)）：

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS photo_album_organizer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS photo_album_organizer_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 2.2 設定後端環境變數 (`backend/.env`)

於 `backend/` 目錄下建立 `.env` 檔案（可由 `backend/.env.example` 複製）：

```ini
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=photo_album_organizer
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=20
```

### 2.3 安裝套件並初始化資料表

於專案根目錄（或分別於 `backend/` 與 `frontend/`）安裝依賴並執行資料庫初始化：

```bash
# 安裝後端套件並建立資料表
cd backend
npm install
npm run db:init

# 安裝前端套件（Vite 極簡配置）
cd ../frontend
npm install
```

---

## 3. 啟動開發伺服器 (Run Application)

1. **啟動 Node.js 後端伺服器**（預設監聽 `http://localhost:3000`）：
   ```bash
   cd backend
   npm run dev
   ```
2. **啟動 Vite 前端開發伺服器**（預設監聽 `http://localhost:5173`，並將 `/api` 與 `/uploads` 代理至 `http://localhost:3000`）：
   ```bash
   cd frontend
   npm run dev
   ```
3. 開啟瀏覽器造訪 `http://localhost:5173`。

---

## 4. 執行靜態檢查與自動化測試 (Verification & Tests)

依據專案憲法第 I、II 原則，所有變更皆須通過以下指令驗證：

```bash
# 1. 靜態程式碼分析、JSDoc 型別檢查與排版檢核
npm run lint
npm run typecheck

# 2. 執行後端與前端單元／整合測試 (Vitest + Supertest)
npm test

# 3. 執行關鍵使用者路徑端對端測試 (Playwright)
npm run test:e2e
```

---

## 5. 核心功能端對端驗證情境 (End-to-End Validation Scenarios)

詳細 API 規格請參閱 [contracts/rest-api.md](./contracts/rest-api.md)。

### 情境 1：建立相簿、上傳照片與「年＋月」分組驗證 (對應 User Story 1)
1. 在主頁面點擊「新增相簿」，輸入名稱 `2026 阿里山日出`、日期 `2026-10-15`；再新增另一個相簿 `夏日海邊`，日期 `2026-08-20`。
2. 點擊「匯入照片」，選取數張 `JPEG`、`PNG`、`WebP` 照片上傳至指定相簿，或於主頁直接選取照片並選擇「建立新相簿」（驗證日期自動帶入照片最早拍攝／修改日期）。
3. **預期結果**：
   - 主頁面自動顯示 `2026 年 10 月` 與 `2026 年 8 月` 兩個日期分組標題，且由新到舊排列。
   - 介面無任何建立子相簿或將相簿拖入另一相簿的操作入口（100% 單層扁平結構）。
   - 若嘗試上傳超過 `20 MB` 或非支援格式之檔案，畫面顯示繁體中文錯誤提示且不中斷其餘正常照片匯入。

### 情境 2：主頁面內嵌平鋪式（磚牆／網格）預覽與收合驗證 (對應 User Story 2)
1. 檢視主頁面上的各個相簿區塊，調整瀏覽器視窗寬度（從桌面寬度縮放至平板／手機寬度）。
2. 點擊相簿標題列右側的「收合／展開」按鈕，以及點擊空白相簿。
3. **預期結果**：
   - 各相簿預設直接展開平鋪式照片縮圖網格，縮圖比例整齊不變形，視窗縮放時每列張數自動響應式重排。
   - 空白相簿顯示友善的繁體中文空白狀態引導提示。

### 情境 3：主頁面拖放重新排列與跨相簿移動持久化驗證 (對應 User Story 3)
1. 在同一相簿的平鋪網格內，按住第 1 張照片拖曳至第 3 個位置放開。
2. 將一張照片從 `2026 阿里山日出` 相簿拖曳至 `夏日海邊` 相簿（分別測試拖放至展開網格內，以及拖放至已收合的相簿標題列）。
3. 重新整理瀏覽器頁面（`F5`）。
4. **預期結果**：
   - 拖曳過程中顯示明確的目標佔位指示線與可放置相簿高亮回饋；按 `Esc` 取消時照片安全回到原位。
   - 放開滑鼠後畫面在 `< 100ms` 內平滑完成重排，雙方相簿照片計數即時更新。
   - 重新整理頁面後，向後端 MySQL 查詢所得之照片順序與相簿歸屬 100% 維持變更後的狀態。
