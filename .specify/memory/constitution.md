<!--
Sync Impact Report:
- Version change: [CONSTITUTION_VERSION] (uninitialized) → 1.0.0
- List of modified principles:
  - [PRINCIPLE_1_NAME] → I. 程式碼品質與可維護性 (Code Quality & Maintainability)
  - [PRINCIPLE_2_NAME] → II. 測試標準與品質保證 (Testing Standards & Quality Assurance)
  - [PRINCIPLE_3_NAME] → III. 使用者體驗一致性 (User Experience Consistency)
  - [PRINCIPLE_4_NAME] → IV. 效能需求與預算 (Performance Requirements & Budgets)
  - [PRINCIPLE_5_NAME] → V. 繁體中文文件與規格標準 (Traditional Chinese Specification Standard)
- Added sections:
  - 語言與規格產出規範 (取代 [SECTION_2_NAME])
  - 開發工作流程與品質閘門 (取代 [SECTION_3_NAME])
- Removed sections: None
- Follow-up TODOs: None
-->
# s-spec-kit Constitution

## Core Principles

### I. 程式碼品質與可維護性 (Code Quality & Maintainability)

所有程式碼必須 (MUST) 通過靜態分析、型別檢查與格式化工具驗證，且不得存在未經合理解釋的警告或規則略過。模組與函式必須遵循單一職責原則 (SRP)，保持清晰的邊界與高可讀性，禁止留下死碼 (dead code) 或未處理的錯誤分支。

**理由**：高品質且結構一致的程式碼能降低認知負擔與技術債，確保團隊長期維護與擴充時的穩定性。

### II. 測試標準與品質保證 (Testing Standards & Quality Assurance)

所有新功能與錯誤修正必須 (MUST) 隨附對應的自動化測試（包含單元測試、整合測試，以及關鍵使用者路徑的端對端測試）。測試必須涵蓋正常路徑 (happy path)、邊界條件與錯誤處理情境，且必須在獨立環境中具備可重複執行性 (deterministic)。所有測試必須全數通過後方可合併程式碼。

**理由**：嚴謹的自動化測試網是防止回歸錯誤 (regression) 的核心保障，確保重構與迭代時的系統可靠性。

### III. 使用者體驗一致性 (User Experience Consistency)

所有使用者介面與互動行為必須 (MUST) 遵循統一的設計系統、視覺樣式、無障礙標準 (WCAG AA) 與操作回饋模式。載入狀態、空白狀態、表單驗證及錯誤訊息必須提供一致且易懂的繁體中文提示，並確保跨裝置與跨瀏覽器的響應式體驗一致。

**理由**：一致的互動與視覺體驗能降低使用者的學習成本與操作失誤率，建立專業且可信賴的產品品質。

### IV. 效能需求與預算 (Performance Requirements & Budgets)

系統開發必須 (MUST) 滿足明確的效能指標與資源預算：前端核心網頁指標需達到 LCP < 2.5 秒、互動延遲 (INP/FID) < 100 毫秒、CLS < 0.1，且初始打包體積需控制在 < 500KB (gzipped)；後端或資料處理介面之 P95 回應時間必須控制在 < 200 毫秒。任何可能突破效能預算的變更必須在規劃階段提出分析與最佳化方案。

**理由**：效能直接影響使用者留存率與系統擴展成本，將效能視為一級需求可避免後期高昂的架構重構。

### V. 繁體中文文件與規格標準 (Traditional Chinese Specification Standard)

本專案憲法及所有透過 Spec-Kit 產出的製品——包含功能規格 (`spec.md`)、實作計畫 (`plan.md`)、研究文件 (`research.md`)、資料模型 (`data-model.md`)、介面契約 (`contracts/`)、任務清單 (`tasks.md`) 與檢核表 (`checklists/`)——必須 (MUST) 一律使用繁體中文 (zh-TW) 撰寫。程式碼識別字、API 路徑、套件名稱及業界通用專有名詞（如 REST、JSON、LCP）得保留英文原文以維持技術精確性。

**理由**：統一使用繁體中文撰寫規格與治理文件，能確保團隊成員在需求溝通、架構審查與驗收標準上達成零歧義的共識。

## 語言與規格產出規範

- **Spec-Kit 全面繁體中文化**：在執行 `/speckit.specify`、`/speckit.clarify`、`/speckit.plan`、`/speckit.tasks`、`/speckit.checklist`、`/speckit.analyze` 與 `/speckit.implement` 等所有工作流程時，產出的說明文字、使用者故事、驗收情境與任務描述必須 (MUST) 使用自然且精確的臺灣繁體中文慣用術語。
- **結構與標記保留**：Spec-Kit 模板中的結構性標籤（如 `FR-001`、`SC-001`、`[P]`、`[US1]`、Given/When/Then 關鍵字或 Markdown 語法結構）必須依模板規範保留，以確保自動化腳本與解析工具正常運作，但其內容敘述必須為繁體中文。

## 開發工作流程與品質閘門

- **規格優先閘門**：任何功能實作前必須 (MUST) 先完成繁體中文功能規格 (`spec.md`) 與實作計畫 (`plan.md`)，並通過憲法合規性檢核 (Constitution Check)。
- **程式碼審查與合併閘門**：所有變更必須通過自動化測試、靜態品質檢查、UX 一致性檢視與效能指標驗證；未符合本憲法任一原則之變更不得合併至主幹分支。

## Governance

本憲法為 `s-spec-kit` 專案之最高開發與規格治理準則，優先於其他慣例或個別文件。

- **修訂程序**：任何憲法原則之新增、修改或廢除，必須透過憲法更新流程提出，記錄變更影響報告 (Sync Impact Report)，並同步檢視相關規格與計畫是否需配合調整。
- **版本控制政策**：採用語意化版本 (`MAJOR.MINOR.PATCH`)：
  - `MAJOR`：移除核心原則、不相容的治理規則變更或核心規範重新定義。
  - `MINOR`：新增核心原則、新增治理章節，或實質擴充既有指導規範。
  - `PATCH`：文字潤飾、勘誤、格式調整或非語意之釐清說明。
- **合規性審查**：每次執行規格規劃 (`plan.md`)、規格分析 (`/speckit.analyze`) 與程式碼審查時，必須明確驗證是否符合本憲法之五大核心原則與繁體中文產出規範。

**Version**: 1.0.0 | **Ratified**: 2026-10-19 | **Last Amended**: 2026-10-19
