# 技術研究與決策紀錄 (Research): 照片相簿日期分組與拖放整理系統

**Feature Branch**: `001-photo-album-organizer`  
**Date**: 2026-10-20  
**Spec**: [spec.md](./spec.md)

## 1. 前端架構與建置工具 (Vite + 原生 HTML/CSS/JavaScript)

- **Decision**: 採用 **Vite** 作為前端開發伺服器與打包工具，搭配**原生 HTML5、CSS3（CSS Grid / Flexbox / CSS Custom Properties）與原生 ES Modules JavaScript (ES2022+)**，不引入 React、Vue 等前端框架，亦不引入第三方 UI 或拖放套件。
- **Rationale**:
  - 完全符合使用者明確指定「使用 Vite、最少數量套件、原生 HTML/CSS/JavaScript、不用 React、不要第三方系統」的架構要求。
  - 零框架執行期開銷，初始打包體積預計 `< 30 KB` (gzipped)，遠低於憲法規定之 `< 500 KB` 上限，且能輕鬆達成 `LCP < 2.5s` 與 `INP < 100ms` 指標。
  - 透過原生 ES Modules 將狀態管理 (`state/`)、API 客戶端 (`services/`)、DOM 元件渲染 (`components/`) 與拖放控制器 (`controllers/`) 進行模組化拆分，符合單一職責原則 (SRP)。
- **Alternatives considered**:
  - **React / Vue**：元件化生態豐富，但違背使用者「先不要用 React 太複雜」之指示，且增加打包體積與學習複雜度。
  - **無建置工具純靜態檔**：缺乏開發期 HMR（熱模組替換）、環境變數注入、API 代理 (`/api` proxy) 與生產環境壓縮打包能力，故採用 Vite 作為極簡建置層。

---

## 2. 平鋪式照片預覽與拖放排序機制 (Native Drag & Drop + Pointer Events)

- **Decision**: 使用瀏覽器原生 **HTML5 Drag and Drop API**（`dragstart`、`dragover`、`dragenter`、`dragleave`、`drop`、`dragend`）搭配 **Pointer Events** 觸控降級支援與鍵盤方向鍵重新排序（無障礙支援），並以 CSS Grid (`grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`) 搭配 `aspect-ratio: 1 / 1` 及 `object-fit: cover` 實作平鋪式（磚牆／網格）預覽。
- **Rationale**:
  - 不依賴第三方拖放函式庫（如 SortableJS），維持最少套件原則。
  - 結合樂觀更新（Optimistic UI Update）與 `requestAnimationFrame` 節流處理 `dragover` 佔位指示，確保放開照片至畫面重排完成的視覺回饋延遲 `< 100ms`（符合 SC-002）。
  - 圖片元素統一加上固定長寬比容器、`loading="lazy"` 與 `decoding="async"`，確保 CLS `< 0.1` 且在單一相簿 200 張照片下初始呈現 `< 2s`（符合 SC-003）。
- **Alternatives considered**:
  - **SortableJS / Dragula**：功能完整但屬於第三方拖放系統，違反最少套件與不依賴第三方系統之約束。
  - **純 Mouse Events 手刻拖放**：需自行處理跨捲軸自動捲動與拖曳殘影，不如原生 HTML5 Drag and Drop API 穩定。

---

## 3. 後端執行環境、框架與圖片上傳處理 (Node.js + MySQL + 本機檔案儲存)

- **Decision**: 後端採用 **Node.js (v20 LTS+)** 搭配極簡 HTTP 路由層（**Express 5**）、**`mysql2/promise`** 連線池套件，以及 **`multer`** 處理 `multipart/form-data` 照片檔案上傳；圖片縮圖與 EXIF 拍攝日期解析採用 **`sharp`**（或原生 EXIF 標頭解析搭配 `sharp` 產生預覽縮圖）。
- **Rationale**:
  - 照片單檔上限達 `20 MB`（支援 `JPEG/JPG`、`PNG`、`WebP`、`GIF`、`AVIF`）。若將原始大圖直接存入 MySQL `LONGBLOB` 會導致資料庫體積膨脹與查詢延遲突破 200ms；因此將**照片二進位原圖與縮圖儲存於後端本機磁碟目錄 (`backend/uploads/originals/` 與 `backend/uploads/thumbnails/`)**，並在 **MySQL 資料庫儲存相簿與照片中繼資料、檔案路徑、拍攝日期與排序索引**。
  - 產生 `400x400` WebP 縮圖供主頁平鋪網格載入，可大幅降低網路傳輸量，使 200 張照片平鋪預覽在 `< 2 秒` 內完成載入，同時保留原圖供檢視。
  - 若圖片不含 EXIF 拍攝日期，則以瀏覽器上傳時附帶之 `lastModified` 時間戳或伺服器接收時間作為預設日期（符合 Edge Cases 與 FR-001）。
- **Alternatives considered**:
  - **第三方雲端儲存 (AWS S3 / Cloudinary)**：違反「不要第三方系統」與個人本地優先之假設。
  - **將圖片以 Base64 或 BLOB 存入 MySQL**：當單一相簿有 200 張照片時，查詢回應時間與記憶體消耗將遠超 `P95 < 200ms` 效能預算。

---

## 4. 資料庫設計與照片拖放順序持久化策略 (MySQL 8.0+)

- **Decision**: 使用 **MySQL 8.0+** 儲存兩張核心資料表：`albums` 與 `photos`。
  - **單層結構強制約束**：`albums` 資料表**不設計** `parent_id` 欄位，從資料庫 Schema 層級杜絕任何相簿嵌套的可能性（100% 滿足 FR-004 與 SC-004）。
  - **相簿刪除連動**：`photos.album_id` 設定外鍵 `ON DELETE CASCADE`，並在刪除相簿 API 與後端服務層同步清理磁碟上的對應原圖與縮圖檔案（滿足 FR-002）。
  - **拖放排序持久化**：採用整數序列 `sort_order INT NOT NULL` 搭配資料庫交易（Transaction）批次更新，或於單一 API 請求 (`PUT /api/albums/:id/photos/reorder` / `PATCH /api/photos/:id/move`) 中在單一 Transaction 內重排目標相簿的 `sort_order`。由於單一相簿規模約數十至數百張照片，在 MySQL 索引 (`idx_album_sort (album_id, sort_order)`) 支援下，單次批次更新可在 `< 15ms` 內完成。
- **Rationale**:
  - 結構清晰、查詢直接，主頁面載入所有相簿與照片摘要僅需極簡 SQL 查詢並由後端或前端依 `DATE_FORMAT(album_date, '%Y-%m')` 聚合為「年＋月」日期分組，P95 回應時間可穩定控制在 `< 50ms`（遠低於 200ms 上限）。
- **Alternatives considered**:
  - **浮點數／LexoRank 排序**：雖可減少單次寫入行數，但連續拖放後仍需重新正規化（Rebalance），對於單相簿數百張照片的規模，Transaction 內整數序列更新更直覺且零精度問題。

---

## 5. 程式碼品質、靜態檢查與測試策略

- **Decision**:
  - **靜態分析與型別安全**：在維持純 JavaScript（不強制編成 TypeScript 建置管線）的前提下，使用 **ESLint** + **Prettier** 搭配 **`// @ts-check` 與 JSDoc 型別註記**（由 `typescript` `tsc --noEmit --allowJs --checkJs` 執行型別檢核），同時兼顧「原生 JavaScript 簡單開發」與憲法第 I 原則「必須通過靜態分析、型別檢查與格式化工具驗證」。
  - **單元與整合測試**：前後端統一使用 **Vitest**（搭配 **Supertest** 測試後端 REST API 與 MySQL 整合行為）。
  - **端對端測試 (E2E)**：使用 **Playwright** 驗證三大使用者故事（建立相簿與年月分組、平鋪式網格預覽與收合、主頁拖放排序與跨相簿移動）。
- **Rationale**:
  - 工具鏈統一建立在 Vite / Node.js 生態系上，套件數量極少、執行速度快，且完全滿足憲法第 I、II 原則之品質閘門。
- **Alternatives considered**:
  - **Jest + Mocha**：需額外配置 ESM 支援，與 Vite 生態整合度不如 Vitest。
