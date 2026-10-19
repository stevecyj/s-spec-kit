# Implementation Plan: 照片相簿日期分組與拖放整理系統 (Photo Album Organizer)

**Branch**: `001-photo-album-organizer` | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-photo-album-organizer/spec.md`

## Summary

開發一套支援「依年＋月日期分組」、「單層扁平相簿結構」、「主頁內嵌平鋪式（磚牆／網格）照片預覽」與「主頁拖放重新排列／跨相簿移動照片」的網頁應用程式。

依據使用者技術指示與規格需求：
- **前端**：採用 **Vite** 作為建置與開發工具，搭配**原生 HTML5、CSS3 與原生 JavaScript (ES Modules)**，維持最少套件數量，不引入 React 等複雜前端框架或第三方 UI／拖放系統。
- **後端**：採用 **Node.js (Express)** 提供 RESTful API，接收照片上傳（支援 `JPEG/JPG`、`PNG`、`WebP`、`GIF`、`AVIF`，單檔上限 `20 MB`）、自動產生預覽縮圖與解析拍攝日期，並提供前端查詢與預覽圖片。
- **資料庫**：採用 **MySQL 8.0+** 持久化儲存相簿 (`albums`)、照片 (`photos`) 歸屬關係與拖放後的自訂排序 (`sort_order`)，並於資料表結構層級禁止相簿嵌套。

## Technical Context

**Language/Version**: JavaScript (ES2022+ / ESM)，Node.js v20 LTS+（搭配 JSDoc + `@ts-check` 進行靜態型別驗證）

**Primary Dependencies**:
- **Frontend**: Vite（開發伺服器與打包工具），零執行期前端框架（純原生 HTML5、CSS3、Vanilla JavaScript）
- **Backend**: Express 5（HTTP 路由）、`mysql2`（MySQL Promise 連線池與 Transaction 支援）、`multer`（`multipart/form-data` 圖片上傳處理）、`sharp`（圖片格式檢驗、EXIF 日期讀取與平鋪預覽縮圖生成）

**Storage**: MySQL 8.0+（儲存 `albums` 與 `photos` 關聯資料及排序索引）＋ 後端本機檔案系統（`backend/uploads/originals/` 與 `backend/uploads/thumbnails/` 儲存實體照片與縮圖）

**Testing**: Vitest（前後端單元測試與整合測試）、Supertest（後端 API 契約與資料庫整合測試）、Playwright（端對端使用者流程與拖放互動測試）

**Target Platform**: 現代桌面與行動網頁瀏覽器（Chrome、Safari、Firefox、Edge，支援滑鼠、觸控與鍵盤無障礙操作）及 Node.js 伺服器環境

**Project Type**: Web application（`frontend/` + `backend/` 前後端分離架構）

**Performance Goals**:
- 前端核心指標：`LCP < 2.5s`、`INP/FID < 100ms`、`CLS < 0.1`，初始 JS/CSS 打包體積 `< 50 KB (gzipped)`（憲法上限為 `< 500 KB`）
- 拖放視覺回饋：放開照片至畫面完成重排之視覺回饋延遲 `< 100ms`（SC-002）
- 大量照片預覽：單一相簿 200 張照片之平鋪預覽初始呈現時間 `< 2s`（SC-003）
- 後端 API 效能：相簿分組查詢、順序更新與跨相簿移動 API 之 `P95 < 200ms`

**Constraints**:
- 相簿必須為 100% 單層扁平結構，嚴禁任何子相簿或相簿嵌套（FR-004、SC-004）
- 僅支援 `JPEG/JPG`、`PNG`、`WebP`、`GIF`、`AVIF` 格式，單檔上限 `20 MB`（FR-001）
- 前端不使用 React 或第三方 UI／拖放框架，使用原生 HTML、CSS、JavaScript 與最少套件
- 所有使用者介面、空白狀態、確認對話框與錯誤提示皆須使用自然清晰的臺灣繁體中文（FR-010）

**Scale/Scope**: 個人相簿管理應用程式；支援數十至數百個相簿、數千張照片（單一相簿 200+ 張照片流暢平鋪瀏覽與拖放排序）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 憲法核心原則 | 規劃前檢核 (Pre-Research) | 設計後複核 (Post-Design) | 合規說明 |
| :--- | :---: | :---: | :--- |
| **I. 程式碼品質與可維護性**<br>(靜態分析、型別檢查、格式化、SRP) | ✅ PASS | ✅ PASS | 前後端按職責拆分模組（API、Service、Repository、DOM 元件、Drag Controller），配置 ESLint、Prettier 與 JSDoc `@ts-check` 靜態檢查，無死碼或未處理錯誤分支。 |
| **II. 測試標準與品質保證**<br>(單元、整合、E2E 測試與可重複性) | ✅ PASS | ✅ PASS | 規劃 Vitest 單元測試、Supertest + MySQL 測試資料庫整合測試，以及 Playwright E2E 測試，完整覆蓋正常路徑、20MB/格式邊界條件與拖放取消情境。 |
| **III. 使用者體驗一致性**<br>(WCAG AA、繁體中文提示、響應式) | ✅ PASS | ✅ PASS | 所有載入、空白狀態、刪除相簿確認（含照片數提醒）與上傳略過訊息皆為繁體中文；支援鍵盤無障礙操作與 CSS Grid 響應式平鋪排版。 |
| **IV. 效能需求與預算**<br>(LCP < 2.5s, INP < 100ms, CLS < 0.1, Bundle < 500KB, API P95 < 200ms) | ✅ PASS | ✅ PASS | 原生 JS + Vite 打包體積 `< 50KB`；縮圖使用固定 `aspect-ratio: 1/1` 與 `loading="lazy"` 確保 `CLS < 0.1` 且 200 張照片 `< 2s` 呈現；MySQL 複合索引確保 API `P95 < 200ms`。 |
| **V. 繁體中文文件與規格標準**<br>(所有 Spec-Kit 製品一律使用繁體中文) | ✅ PASS | ✅ PASS | `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/rest-api.md` 與 `quickstart.md` 全數採用臺灣繁體中文撰寫。 |

## Project Structure

### Documentation (this feature)

```text
specs/001-photo-album-organizer/
├── plan.md              # 本實作計畫文件 (/speckit.plan 產出)
├── research.md          # Phase 0 技術研究與決策紀錄 (/speckit.plan 產出)
├── data-model.md        # Phase 1 MySQL 資料模型與狀態轉換設計 (/speckit.plan 產出)
├── quickstart.md        # Phase 1 快速啟動與端對端驗證指南 (/speckit.plan 產出)
├── contracts/           # Phase 1 前後端 REST API 介面契約 (/speckit.plan 產出)
│   └── rest-api.md
└── tasks.md             # Phase 2 實作任務清單 (將由 /speckit.tasks 產出)
```

### Source Code (repository root)

```text
backend/
├── package.json
├── .env.example
├── src/
│   ├── server.js                # Express 應用程式入口與靜態圖片路由掛載
│   ├── config/
│   │   └── db.js                # MySQL2 連線池設定與初始化腳本
│   ├── models/
│   │   ├── schema.sql           # albums 與 photos 資料表 DDL
│   │   ├── albumRepository.js   # 相簿 CRUD 與年月分組查詢
│   │   └── photoRepository.js   # 照片新增、刪除、同相簿重排與跨相簿移動 Transaction
│   ├── services/
│   │   ├── albumService.js      # 相簿商業邏輯與連動清理實體圖片檔
│   │   └── photoService.js      # 圖片格式/20MB 驗證、EXIF 日期解析與縮圖生成
│   ├── api/
│   │   ├── albumsRouter.js      # /api/albums 路由控制器
│   │   ├── photosRouter.js      # /api/photos 路由控制器與 multer 上傳中介層
│   │   └── errorHandler.js      # 統一繁體中文錯誤回應中介層
│   └── utils/
│       └── dateGroupFormatter.js # YYYY-MM 轉「YYYY 年 M 月」分組聚合工具
├── uploads/
│   ├── originals/               # 儲存上傳之原始圖片檔
│   └── thumbnails/              # 儲存平鋪式預覽專用縮圖
└── tests/
    ├── unit/                    # 日期分組、檔案驗證與排序邏輯單元測試
    └── integration/             # REST API 與 MySQL 整合測試 (Supertest)

frontend/
├── package.json
├── vite.config.js               # Vite 設定（含 /api 與 /uploads 代理設定）
├── index.html                   # 應用程式主頁面語意化 HTML5 結構
├── src/
│   ├── main.js                  # 前端初始化入口與事件綁定
│   ├── styles/
│   │   ├── variables.css        # 設計系統變數（色彩、間距、字體、陰影）
│   │   ├── layout.css           # 主頁面、日期分組標題與相簿卡片佈局
│   │   └── photo-grid.css       # 平鋪式網格預覽與拖放視覺回饋樣式
│   ├── services/
│   │   └── apiClient.js         # 封裝向後端查詢、上傳、刪除與拖放排序之 Fetch API
│   ├── state/
│   │   └── store.js             # 前端狀態管理（相簿分組狀態、樂觀更新與錯誤還原快照）
│   ├── components/
│   │   ├── DateGroupSection.js  # 「年＋月」日期分組區塊渲染元件
│   │   ├── AlbumCard.js         # 單層相簿區塊（含標題、展開/收合控制、平鋪照片網格）
│   │   ├── PhotoTile.js         # 單張平鋪照片縮圖項目與無障礙操作按鈕
│   │   ├── UploadModal.js       # 匯入照片與建立/選擇相簿對話框
│   │   ├── ConfirmDialog.js     # 刪除含照片相簿之繁體中文確認提示框
│   │   └── Toast.js             # 繁體中文操作回饋與略過檔案錯誤通知
│   └── controllers/
│       └── dragDropController.js # 主頁照片同相簿重排與跨相簿移動拖放控制器
└── tests/
    ├── unit/                    # 前端狀態管理、日期格式化與拖放計算單元測試
    └── e2e/                     # Playwright 端對端驗收測試
```

**Structure Decision**: 採用 **Web application (`frontend/` + `backend/`)** 雙目錄結構。前端使用 Vite 與純原生 HTML/CSS/JavaScript 保持極簡與零框架複雜度；後端使用 Node.js + MySQL 獨立負責照片檔案接收、縮圖生成、EXIF 日期提取與資料庫持久化，前後端職責邊界清晰且易於獨立測試。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

無違反憲法原則之處（所有技術選型與架構設計皆完全符合五大核心原則與使用者技術約束）。
