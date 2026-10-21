---

description: "照片相簿日期分組與拖放整理系統之實作任務清單"
---

# Tasks: 照片相簿日期分組與拖放整理系統 (Photo Album Organizer)

**Input**: Design documents from `/specs/001-photo-album-organizer/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/rest-api.md, quickstart.md

**Tests**: 依據專案憲法第 II 原則（測試標準與品質保證）與 `plan.md` 測試策略，本任務清單包含單元測試、後端 API 與資料庫整合測試，以及 Playwright 端對端測試任務。

**Organization**: 任務依使用者故事（User Story 1 至 User Story 3）分組編排，確保每個故事皆能獨立實作、獨立測試並作為增量交付。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行執行（修改不同檔案，且不依賴未完成之前置任務）
- **[Story]**: 所屬使用者故事標籤（`[US1]`、`[US2]`、`[US3]`，僅標記於使用者故事階段）
- 每個任務描述皆包含明確的檔案路徑與資料模型約束條件

## Path Conventions

- **Web app (前後端分離架構)**: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 專案雙目錄結構初始化、套件依賴安裝與靜態品質檢核工具設定

- [X] T001 依據實作計畫建立 `backend/`（含 `src/`、`uploads/originals/`、`uploads/thumbnails/`、`tests/`）與 `frontend/`（含 `src/`、`tests/`）目錄結構及根目錄跨專案指令腳本（`lint`、`typecheck`、`test`、`test:e2e`）於 `package.json`
- [X] T002 [P] 初始化後端 Node.js (ESM) 專案並配置 Express 5、`mysql2`、`multer`、`sharp`、Vitest 與 Supertest 依賴及 `db:init`、`dev`、`test` 腳本於 `backend/package.json`
- [X] T003 [P] 初始化前端 Vite 原生 JavaScript (ESM) 專案並配置 Vitest 與 Playwright 依賴及 `/api`、`/uploads` 開發代理設定於 `frontend/package.json` 與 `frontend/vite.config.js`
- [X] T004 [P] 配置 ESLint、Prettier 與 JSDoc `@ts-check`（`tsc --noEmit --allowJs --checkJs`）靜態分析與型別檢查規則於 `eslint.config.js`、`.prettierrc` 與 `tsconfig.json`
- [X] T005 [P] 建立後端環境變數範本檔（定義 `PORT=3000`、`DB_HOST=127.0.0.1`、`DB_PORT=3306`、`DB_USER=root`、`DB_PASSWORD`、`DB_NAME=photo_album_organizer`、`UPLOAD_DIR=./uploads`、`MAX_FILE_SIZE_MB=20`）於 `backend/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有使用者故事開始前必須完成的核心資料庫 Schema、連線池、統一錯誤處理、設計系統樣式與前端基礎狀態設施

**⚠️ CRITICAL**: 在本階段完成前，不得開始任何使用者故事之實作

- [X] T006 建立 MySQL 8.0 資料表 DDL 於 `backend/src/models/schema.sql`，嚴格依 `data-model.md` 定義 `albums` 資料表（**不包含任何父相簿欄位**，確保結構上絕對無法嵌套：`id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT`、`title VARCHAR(120) NOT NULL`、`album_date DATE NOT NULL`、`is_collapsed TINYINT(1) NOT NULL DEFAULT 0`、`sort_order INT NOT NULL DEFAULT 0`、`created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`、`updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` 與索引 `INDEX idx_albums_date_sort (album_date DESC, sort_order ASC, id DESC)`）及 `photos` 資料表（`id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT`、`album_id INT UNSIGNED NOT NULL` 且 `FOREIGN KEY REFERENCES albums(id) ON DELETE CASCADE`、`original_filename VARCHAR(255) NOT NULL`、`stored_filename VARCHAR(255) NOT NULL UNIQUE`、`thumbnail_filename VARCHAR(255) NOT NULL`、`mime_type VARCHAR(50) NOT NULL`、`file_size_bytes INT UNSIGNED NOT NULL`、`width INT UNSIGNED NULL`、`height INT UNSIGNED NULL`、`taken_at DATETIME NOT NULL`、`sort_order INT NOT NULL DEFAULT 0`、`created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`、`updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`、`UNIQUE KEY uk_photos_stored_filename (stored_filename)` 與索引 `INDEX idx_photos_album_sort (album_id, sort_order ASC, id ASC)`）
- [X] T007 實作 MySQL2 Promise 連線池、Transaction 封裝輔助函式與讀取 `backend/src/models/schema.sql` 自動初始化資料表的腳本於 `backend/src/config/db.js`
- [X] T008 [P] 實作統一繁體中文錯誤回應中介層（回傳 `{"error": {"code": "...", "message": "...", "details": []}}` 結構）與自訂驗證／查無資源錯誤類別於 `backend/src/api/errorHandler.js`
- [X] T009 [P] 建立 Express 應用程式入口、JSON 解析、自動建立 `backend/uploads/originals/` 與 `backend/uploads/thumbnails/` 目錄，以及掛載 `/uploads/thumbnails/:filename`（設定 `Cache-Control: public, max-age=31536000, immutable`）與 `/uploads/originals/:filename` 靜態圖片服務路由於 `backend/src/server.js`
- [X] T010 [P] 建立前端設計系統變數（色彩、間距、圓角、陰影、WCAG AA 對比色）與主頁面頂部工具列及年月分組版面樣式於 `frontend/src/styles/variables.css` 與 `frontend/src/styles/layout.css`
- [X] T011 [P] 建立應用程式主頁面語意化 HTML5 結構（包含主標題、新增相簿與匯入照片按鈕、日期分組主容器、對話框掛載區與無障礙 `aria-live` 通知區）於 `frontend/index.html`
- [X] T012 [P] 實作繁體中文操作成功回饋、錯誤訊息與略過檔案清單通知元件於 `frontend/src/components/Toast.js`
- [X] T013 [P] 實作支援鍵盤焦點鎖定與 `Esc` 關閉之繁體中文確認對話框元件於 `frontend/src/components/ConfirmDialog.js`
- [X] T014 [P] 實作前端集中式狀態管理（維護 `groups` 年月分組相簿狀態、狀態變更訂閱通知，以及支援樂觀更新與錯誤還原的快照 `createSnapshot`／`restoreSnapshot` 機制）於 `frontend/src/state/store.js`
- [X] T015 [P] 實作封裝向後端請求之 Fetch API 客戶端（涵蓋分組相簿查詢、相簿新增/修改/刪除、照片批次上傳、單張照片刪除、同相簿重排與跨相簿移動）於 `frontend/src/services/apiClient.js`

**Checkpoint**: 基礎設施就緒 — 可開始進行各使用者故事之實作與測試

---

## Phase 3: User Story 1 - 將照片整理至依日期分組的單層相簿 (Priority: P1) 🎯 MVP

**Goal**: 讓使用者能夠建立、編輯與刪除單層相簿，並匯入照片（支援直接在特定相簿新增，或從主頁匯入時選擇既有相簿／建立新相簿），在主頁面依「年＋月」（如 `2026 年 10 月`）由新到舊分組展示所有相簿，且嚴格禁止任何相簿嵌套。

**Independent Test**: 透過匯入數張不同日期與格式的照片、建立多個不同年月相簿並分配照片進行獨立測試；驗證主頁面是否依「年＋月」由新到舊正確分組顯示、驗證超過 `20 MB` 或非支援格式檔案之繁體中文攔截提示、驗證刪除含照片相簿之確認對話框與磁碟檔案清理，以及驗證系統完全禁止建立子相簿。

### Tests for User Story 1 ⚠️

> **NOTE: 請先撰寫以下測試並確認執行失敗（Red），再進行功能實作（Green）**

- [X] T016 [P] [US1] 撰寫 `DateGroup` 年月分組聚合邏輯單元測試（驗證 `yearMonth` 格式 `YYYY-MM`、繁體中文標題如 `"2026 年 10 月"`、分組與相簿由新到舊降序排列，以及刪除最後一個相簿後空日期分組自動消失）於 `backend/tests/unit/dateGroupFormatter.test.js`
- [X] T017 [P] [US1] 撰寫照片上傳驗證與日期解析單元測試（驗證僅接受 MIME type 為 `image/jpeg`、`image/png`、`image/webp`、`image/gif`、`image/avif` 且對應副檔名為 `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`、`.avif`、檔案大小 `0 < file_size_bytes <= 20 * 1024 * 1024`（20 MB）、損毀檔頭攔截與 EXIF `DateTimeOriginal`／`fileLastModified` 預設日期解析）於 `backend/tests/unit/photoService.test.js`
- [X] T018 [P] [US1] 撰寫相簿與照片管理 REST API 整合測試（涵蓋 `GET /api/albums/grouped`、`POST /api/albums`、`PATCH /api/albums/:albumId`、`DELETE /api/albums/:albumId`、`POST /api/photos/upload`、`DELETE /api/photos/:photoId` 及拒絕 `parent_id`/`parentAlbumId`/`parent_album_id` 嵌套參數）於 `backend/tests/integration/albumsAndPhotos.test.js`

### Implementation for User Story 1

- [X] T019 [P] [US1] 實作將平鋪相簿清單依 `album_date` 聚合為 `DateGroup`（含 `yearMonth` 如 `"2026-10"`、`label` 如 `"2026 年 10 月"`，且分組按 `yearMonth` 降序、同分組相簿按 `album_date DESC, id DESC` 排列）之純函式工具於 `backend/src/utils/dateGroupFormatter.js`
- [X] T020 [P] [US1] 實作相簿資料存取層（查詢所有相簿與關聯照片、新增單層相簿、更新 `title`/`album_date`/`is_collapsed`、刪除相簿）於 `backend/src/models/albumRepository.js`
- [X] T021 [P] [US1] 實作照片資料存取層（批次新增照片紀錄、依 `album_id` 與 `sort_order ASC, id ASC` 查詢照片、查詢與刪除單張照片紀錄）於 `backend/src/models/photoRepository.js`
- [X] T022 [US1] 實作相簿商業邏輯服務於 `backend/src/services/albumService.js`，強制執行 `data-model.md` 約束：`title` 必填且去除前後空白後長度 `1..120` 字元（空白時回傳繁體中文提示 `「請輸入相簿名稱」`）、`album_date` 必填且為有效之 `YYYY-MM-DD` 日期字串、若請求帶有 `parent_album_id`、`parent_id` 或 `parentAlbumId` 直接拒絕或忽略以確保 100% 單層結構，並在刪除相簿 Transaction 提交後同步清除 `backend/uploads/originals/` 與 `backend/uploads/thumbnails/` 下的實體圖片檔案
- [X] T023 [US1] 實作照片上傳、驗證、EXIF 解析與縮圖生成服務於 `backend/src/services/photoService.js`，強制執行 `data-model.md` 約束：僅接受 MIME type 為 `image/jpeg`、`image/png`、`image/webp`、`image/gif`、`image/avif` 且對應副檔名為 `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`、`.avif`，透過 `sharp` 驗證檔頭結構是否完好並生成 `400x400` WebP 縮圖、驗證檔案大小 `0 < file_size_bytes <= 20 * 1024 * 1024`（上限 `20,971,520` bytes = 20 MB）、拍攝日期 `taken_at` 優先取 EXIF `DateTimeOriginal`（若無則取 `fileLastModified` 或匯入當下時間）、若主頁上傳選擇「建立新相簿」且未指定日期則自動取該批有效照片中最早的 `taken_at` 日期作為預設值，並對不符規範之檔案回傳繁體中文 `skippedFiles` 項目（如 `「檔案 example.bmp 格式不支援，僅支援 JPEG、PNG、WebP、GIF、AVIF 格式」`）且繼續完成同批次其餘有效照片匯入
- [X] T024 [US1] 實作相簿路由控制器（`GET /api/albums/grouped`、`POST /api/albums`、`PATCH /api/albums/:albumId`、`DELETE /api/albums/:albumId`）於 `backend/src/api/albumsRouter.js` 並註冊至 `backend/src/server.js`
- [X] T025 [US1] 實作照片上傳與單張刪除路由控制器（`POST /api/photos/upload` 搭配 `multer` 檔案接收與 `DELETE /api/photos/:photoId` 同步清理磁碟原圖與縮圖）於 `backend/src/api/photosRouter.js` 並註冊至 `backend/src/server.js`
- [X] T026 [P] [US1] 實作主頁面「年＋月」日期分組區塊元件（渲染分組標題 `YYYY 年 M 月` 與該年月下之單層相簿清單，以及全系統尚無任何相簿時的繁體中文空白引導狀態）於 `frontend/src/components/DateGroupSection.js`
- [X] T027 [P] [US1] 實作匯入照片與建立／選擇相簿對話框元件（支援檔案多選、前端初步檢視並提取 `File.lastModified`、切換「歸入既有相簿」或「建立新相簿」，且建立新相簿時預設帶入選取照片最早修改日期並允許手動調整）於 `frontend/src/components/UploadModal.js`
- [X] T028 [US1] 實作單層相簿卡片元件基礎管理功能於 `frontend/src/components/AlbumCard.js`（渲染相簿名稱、所屬日期、照片數量、在特定相簿內直接新增照片按鈕、編輯名稱與日期表單，以及當 `photoCount > 0` 點擊刪除相簿時彈出 `ConfirmDialog.js` 顯示 `「此相簿包含 N 張照片，刪除後照片將一併移除且無法復原，確定要刪除嗎？」`）
- [X] T029 [US1] 實作主頁面初始化載入、新增相簿、匯入照片、編輯/刪除相簿與單張照片刪除之事件串接邏輯於 `frontend/src/main.js`

**Checkpoint**: User Story 1 完整功能就緒，可獨立執行建立相簿、匯入照片與檢視「年＋月」單層分組之 MVP 驗收

---

## Phase 4: User Story 2 - 相簿內照片平鋪式（磚牆／網格）預覽 (Priority: P2)

**Goal**: 在主頁面上各相簿區塊預設直接內嵌展開，將相簿內的所有照片以平鋪式（磚牆／網格狀）介面呈現清晰縮圖，支援隨視窗寬度自適應重排、支援手動收合／展開個別相簿，並在空白相簿顯示友善的繁體中文提示。

**Independent Test**: 開啟包含多張照片與無照片的相簿進行獨立測試；調整視窗尺寸驗證平鋪式網格是否自動重排每列張數且縮圖不變形，驗證手動切換相簿收合／展開狀態，並確認空白相簿顯示繁體中文空白狀態引導提示。

### Tests for User Story 2 ⚠️

> **NOTE: 請先撰寫以下測試並確認執行失敗（Red），再進行功能實作（Green）**

- [X] T030 [P] [US2] 撰寫平鋪式照片預覽元件、空白相簿繁體中文提示渲染與相簿收合／展開狀態切換之單元測試於 `frontend/tests/unit/albumPreview.test.js`
- [X] T031 [P] [US2] 撰寫相簿 `isCollapsed`（對應資料表 `is_collapsed TINYINT(1) NOT NULL DEFAULT 0`）狀態持久化更新與重新載入查詢之整合測試於 `backend/tests/integration/albumCollapse.test.js`

### Implementation for User Story 2

- [X] T032 [P] [US2] 實作平鋪式（磚牆／網格）預覽與響應式樣式於 `frontend/src/styles/photo-grid.css`（使用 CSS Grid `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`、固定縮圖容器 `aspect-ratio: 1 / 1`、`object-fit: cover` 防止圖片裁切失真或重疊，並支援桌面、平板與手機斷點自適應調整）
- [X] T033 [P] [US2] 實作單張平鋪照片縮圖元件於 `frontend/src/components/PhotoTile.js`（渲染 `/uploads/thumbnails/:filename` 縮圖、設定 `loading="lazy"` 與 `decoding="async"`、提供原始圖片燈箱預覽、單張照片移除按鈕與完整 `aria-label` 無障礙屬性）
- [X] T034 [US2] 擴充相簿卡片元件於 `frontend/src/components/AlbumCard.js`，實作主頁面預設直接內嵌展開平鋪照片網格（`isCollapsed: false`）、點擊標題列收合／展開切換控制項（同步呼叫 `PATCH /api/albums/:albumId` 持久化 `isCollapsed` 狀態），以及當相簿內無照片（`photos.length === 0`）時顯示友善的繁體中文空白狀態提示與「新增照片」快速按鈕

**Checkpoint**: User Stories 1 與 2 皆可獨立運作，主頁面具備年月分組與內嵌平鋪式響應式照片預覽

---

## Phase 5: User Story 3 - 在主頁面上透過拖放重新排列與整理照片 (Priority: P3)

**Goal**: 讓使用者在主頁面上直接透過滑鼠、觸控或鍵盤拖放重新排列同一相簿內的照片順序，或將照片跨相簿拖放移動至其他相簿（包含已展開的平鋪網格位置或已收合的相簿標題列），提供即時視覺回饋（`< 100ms`）並自動將新順序與歸屬持久化保存至 MySQL。

**Independent Test**: 在主頁面上將相簿內照片拖曳至同相簿另一位置、將照片從 A 相簿拖曳至 B 相簿（分別測試已展開網格與已收合相簿標題列），以及在拖曳途中按 `Esc` 取消；驗證視覺回饋、放開後 `< 100ms` 即時重排，並重新整理頁面驗證照片順序與相簿歸屬 100% 持久化保存。

### Tests for User Story 3 ⚠️

> **NOTE: 請先撰寫以下測試並確認執行失敗（Red），再進行功能實作（Green）**

- [X] T035 [P] [US3] 撰寫前端拖放排序索引計算、跨相簿插入位置計算、拖放至已收合相簿末尾及按 `Esc`/無效區域取消還原快照之單元測試於 `frontend/tests/unit/dragDropController.test.js`
- [X] T036 [P] [US3] 撰寫同相簿重新排序（`PUT /api/albums/:albumId/photos/reorder`）與跨相簿移動照片（`PATCH /api/photos/:photoId/move`）之 REST API 與 MySQL Transaction 整合測試（含來源相簿移空後保留空相簿、目標收合相簿歸入末尾與無效 ID 回傳 `400`/`404` 錯誤）於 `backend/tests/integration/photoReorderAndMove.test.js`

### Implementation for User Story 3

- [X] T037 [US3] 在 `backend/src/models/photoRepository.js` 實作拖放持久化資料庫方法：在單一 MySQL Transaction 中批次將同相簿照片的 `sort_order` 更新為連續整數 `0, 1, 2, ..., n-1`，以及在跨相簿移動時於單一 MySQL Transaction 中更新照片 `album_id`、將目標相簿所有照片 `sort_order` 依插入位置 `targetIndex` 重新正規化為 `0..k-1`，並將來源相簿剩餘照片 `sort_order` 重新正規化為連續整數 `0..m-1`
- [X] T038 [US3] 在 `backend/src/services/photoService.js` 實作同相簿重排與跨相簿移動服務邏輯（驗證 `photoIds` 完整屬於指定相簿、支援拖放至已收合相簿標題列時將 `targetIndex` 設為目標相簿末尾 `photos.length`，並確保來源相簿移出最後一張照片後依然保留為空相簿）
- [X] T039 [US3] 在 `backend/src/api/albumsRouter.js` 與 `backend/src/api/photosRouter.js` 實作 `PUT /api/albums/:albumId/photos/reorder` 與 `PATCH /api/photos/:photoId/move` 端點，回傳符合 `contracts/rest-api.md` 規範之繁體中文訊息
- [X] T040 [P] [US3] 在 `frontend/src/styles/photo-grid.css` 新增拖放視覺狀態回饋樣式（包含被拖曳照片預覽殘影 `.photo-tile--dragging`、目標放置位置佔位指示線 `.photo-tile--drop-before`／`.photo-tile--drop-after`，以及可放置相簿網格與已收合相簿標題列高亮 `.album-card--drop-target`）
- [X] T041 [US3] 實作主頁面拖放控制器於 `frontend/src/controllers/dragDropController.js`（使用原生 HTML5 Drag and Drop API 搭配 Pointer Events 觸控支援與鍵盤方向鍵重新排序；以 `requestAnimationFrame` 節流更新佔位指示；支援拖放至展開網格或已收合相簿標題列末尾；支援按 `Esc` 或於無效區域放開時立即還原至拖曳前狀態；放開時先於 `< 100ms` 內執行 `store.js` 樂觀更新重排畫面與相簿照片計數，再非同步呼叫 `apiClient.js` 持久化，若失敗則自動還原快照並顯示繁體中文錯誤通知）
- [X] T042 [US3] 在 `frontend/src/components/PhotoTile.js`、`frontend/src/components/AlbumCard.js` 與 `frontend/src/main.js` 綁定照片拖曳屬性（`draggable="true"`、`data-photo-id`、`data-album-id`）與相簿放置區（展開網格與已收合標題列）事件，並確保相簿容器本身禁止被拖曳嵌套以維持 100% 單層結構

**Checkpoint**: 所有三大使用者故事皆已完整實作並可獨立驗證

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 端對端自動化驗收測試、200 張大量照片效能預算驗證與全專案品質閘門檢核

- [X] T043 [P] 撰寫 Playwright 端對端驗收測試於 `frontend/tests/e2e/photoAlbumOrganizer.spec.js`（涵蓋 `quickstart.md` 三大情境：建立相簿與「年＋月」分組、20MB/非支援格式繁體中文錯誤攔截、平鋪式網格預覽與收合切換、同相簿拖放重排、跨相簿拖放移動至展開網格與已收合標題列、按 `Esc` 取消拖放及重新整理頁面後順序持久化）
- [X] T044 [P] 驗證並調校效能指標以符合憲法第 IV 原則與成功準則（單一相簿 200 張照片平鋪預覽初始呈現 `< 2s`、拖放放開至畫面重排視覺回饋 `< 100ms`、`CLS < 0.1`、前端初始打包體積 `< 50 KB gzipped`、後端 API `P95 < 200ms`）於 `frontend/src/controllers/dragDropController.js` 與 `backend/src/models/photoRepository.js`
- [X] T045 執行全專案靜態程式碼分析、型別檢查與自動化測試（`npm run lint`、`npm run typecheck`、`npm test`、`npm run test:e2e`），並依據 `specs/001-photo-album-organizer/quickstart.md` 完成端對端驗收確認

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 無前置依賴 — 可立即開始
- **Foundational (Phase 2)**: 依賴 Setup (Phase 1) 完成 — **阻塞所有使用者故事**
- **User Stories (Phase 3 ~ Phase 5)**: 皆依賴 Foundational (Phase 2) 完成
  - **User Story 1 (P1 - MVP)**: Phase 2 完成後即可開始，無其他故事依賴
  - **User Story 2 (P2)**: 依賴 Phase 2 完成，並在 User Story 1 的 `AlbumCard.js` 基礎上擴充內嵌平鋪式照片網格與收合預覽
  - **User Story 3 (P3)**: 依賴 User Story 1（相簿與照片資料流）與 User Story 2（主頁內嵌平鋪照片縮圖 `PhotoTile.js` 與 `AlbumCard.js`）完成後進行拖放互動整合（後端重排與移動 API `T036`~`T039` 則可於 Phase 2 完成後平行開發）
- **Polish (Phase 6)**: 依賴所有目標使用者故事（Phase 3 ~ Phase 5）完成

### Within Each User Story

- 測試任務（Tests）必須先撰寫並確認失敗（Red），再執行實作任務（Green）
- 後端順序：Repository / Utils (`models/`, `utils/`) → Services (`services/`) → Routers (`api/`)
- 前端順序：Styles / 子元件 (`styles/`, `components/`) → 控制器與主入口整合 (`controllers/`, `main.js`)

### Parallel Opportunities

- **Phase 1**: `T002`、`T003`、`T004`、`T005` 修改不同設定檔，可完全平行執行
- **Phase 2**: 在 `T006`、`T007` 建立資料庫基礎期間，`T008`~`T015`（後端錯誤處理、前端樣式、HTML、共用元件、Store 與 API Client）皆位於獨立檔案，可完全平行執行
- **User Story 1 (Phase 3)**:
  - 測試任務 `T016`、`T017`、`T018` 可平行撰寫
  - 資料層與工具 `T019`、`T020`、`T021` 可平行實作
  - 前端元件 `T026`、`T027` 可與後端 API 開發平行進行
- **User Story 2 (Phase 4)**:
  - 測試任務 `T030`、`T031` 可平行撰寫
  - 網格樣式 `T032` 與單張縮圖元件 `T033` 可平行實作
- **User Story 3 (Phase 5)**:
  - 測試任務 `T035`、`T036` 可平行撰寫
  - 後端 Transaction 排序 API（`T037`~`T039`）與前端拖放樣式及控制器（`T040`、`T041`）可分別由前後端平行開發

---

## Parallel Example: User Story 1 (MVP)

```bash
# 1. 平行啟動 User Story 1 的所有單元與整合測試撰寫：
Task: "T016 [P] [US1] 撰寫 DateGroup 年月分組聚合邏輯單元測試於 backend/tests/unit/dateGroupFormatter.test.js"
Task: "T017 [P] [US1] 撰寫照片上傳驗證與日期解析單元測試於 backend/tests/unit/photoService.test.js"
Task: "T018 [P] [US1] 撰寫相簿與照片管理 REST API 整合測試於 backend/tests/integration/albumsAndPhotos.test.js"

# 2. 平行啟動 User Story 1 的後端 Repository 與分組工具實作：
Task: "T019 [P] [US1] 實作 DateGroup 分組純函式工具於 backend/src/utils/dateGroupFormatter.js"
Task: "T020 [P] [US1] 實作相簿資料存取層於 backend/src/models/albumRepository.js"
Task: "T021 [P] [US1] 實作照片資料存取層於 backend/src/models/photoRepository.js"

# 3. 平行啟動 User Story 1 的前端分組區塊與上傳對話框元件：
Task: "T026 [P] [US1] 實作主頁面「年＋月」日期分組區塊元件於 frontend/src/components/DateGroupSection.js"
Task: "T027 [P] [US1] 實作匯入照片與建立／選擇相簿對話框元件於 frontend/src/components/UploadModal.js"
```

---

## Parallel Example: User Story 2 & User Story 3

```bash
# User Story 2 — 平行實作平鋪式網格 CSS 與單張縮圖元件：
Task: "T032 [P] [US2] 實作平鋪式（磚牆／網格）預覽與響應式樣式於 frontend/src/styles/photo-grid.css"
Task: "T033 [P] [US2] 實作單張平鋪照片縮圖元件於 frontend/src/components/PhotoTile.js"

# User Story 3 — 前後端平行開發拖放排序與跨相簿移動：
Task: "T037 [US3] 在 backend/src/models/photoRepository.js 實作拖放持久化資料庫方法"
Task: "T040 [P] [US3] 在 frontend/src/styles/photo-grid.css 新增拖放視覺狀態回饋樣式"
```

---

## Implementation Strategy

### MVP First (僅先交付 User Story 1)

1. 完成 **Phase 1: Setup**（專案結構與品質工具）
2. 完成 **Phase 2: Foundational**（MySQL 資料表、連線池、基礎前端 Store 與 API Client）
3. 完成 **Phase 3: User Story 1**（相簿 CRUD、照片上傳、EXIF 日期解析、主頁面「年＋月」單層分組展示）
4. **STOP and VALIDATE**: 獨立執行 User Story 1 單元測試、整合測試與手動匯入驗證
5. 確認單層相簿結構與年月分組完全符合預期後，再進入下一個增量階段

### Incremental Delivery (漸進式交付)

1. **Foundation Ready** (Phase 1 + Phase 2) → 前後端環境與 MySQL 資料表就緒
2. **Increment 1 — MVP** (Phase 3: User Story 1) → 可上傳照片並依「年＋月」分組管理單層相簿
3. **Increment 2 — 平鋪預覽** (Phase 4: User Story 2) → 主頁相簿直接內嵌展開響應式平鋪照片縮圖網格，支援收合／展開与空白狀態引導
4. **Increment 3 — 拖放整理** (Phase 5: User Story 3) → 主頁直接拖放重排同相簿照片順序或跨相簿移動照片，並即時持久化至 MySQL
5. **Final Polish** (Phase 6) → 通過完整 Playwright E2E 驗收與 200 張照片效能檢核

---

## Notes

- 標記 `[P]` 之任務代表操作不同檔案且無未完成之前置相依性，可安全平行執行
- 所有任務皆須遵守專案憲法第 I～V 原則（通過 ESLint/Prettier/`@ts-check`、隨附自動化測試、繁體中文介面提示、符合效能預算、使用繁體中文規格說明）
- 實作相簿相關功能時，嚴禁在資料庫、API 或前端 UI 加入任何子相簿或相簿嵌套機制（100% 單層結構）
