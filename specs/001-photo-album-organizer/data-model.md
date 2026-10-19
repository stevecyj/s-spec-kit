# 資料模型設計 (Data Model): 照片相簿日期分組與拖放整理系統

**Feature Branch**: `001-photo-album-organizer`  
**Date**: 2026-10-20  
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## 1. 實體概覽與關聯圖 (Entity Relationship)

本系統採用單層扁平相簿架構，核心持久化實體為 **相簿 (`Album`)** 與 **照片 (`Photo`)**，並由查詢層與前端視圖聚合產生 **日期分組 (`DateGroup`)**。

```text
[DateGroup (年＋月邏輯視圖: YYYY-MM)]
       │ 1 (邏輯聚合)
       ▼ *
   [Album (相簿)]  (嚴禁 parent_id，100% 單層扁平結構)
       │ 1
       │ ON DELETE CASCADE (刪除相簿時一併移除照片紀錄與實體檔案)
       ▼ *
   [Photo (照片)]
```

---

## 2. 資料庫資料表定義 (MySQL 8.0 Schema)

### 2.1 相簿資料表 (`albums`)

儲存使用者建立的獨立相簿容器。**不包含任何父相簿欄位**，確保結構上絕對無法嵌套（FR-004）。

| 欄位名稱 | 資料型別 | 約束條件 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT UNSIGNED` | `PRIMARY KEY AUTO_INCREMENT` | 相簿唯一識別碼 |
| `title` | `VARCHAR(120)` | `NOT NULL` | 相簿名稱（去除前後空白後長度 `1..120` 字元） |
| `album_date` | `DATE` | `NOT NULL` | 相簿所屬日期（格式 `YYYY-MM-DD`，用於計算 `YYYY-MM` 年月分組與排序） |
| `is_collapsed` | `TINYINT(1)` | `NOT NULL DEFAULT 0` | 主頁面平鋪預覽是否收合（`0` = 預設展開，`1` = 收合，對應 FR-005） |
| `sort_order` | `INT` | `NOT NULL DEFAULT 0` | 同一日期下相簿的輔助排序權重 |
| `created_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 建立時間 |
| `updated_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最後更新時間 |

**索引設計 (Indexes)**:
- `PRIMARY KEY (id)`
- `INDEX idx_albums_date_sort (album_date DESC, sort_order ASC, id DESC)`：加速主頁面依「年＋月」及日期由新到舊（降序）排序查詢（FR-003）。

---

### 2.2 照片資料表 (`photos`)

儲存上傳至後端的照片中繼資料、原始圖與縮圖儲存路徑，以及在所屬相簿內的自訂排序索引。

| 欄位名稱 | 資料型別 | 約束條件 | 說明 |
| :--- | :--- | :--- | :--- |
| `id` | `INT UNSIGNED` | `PRIMARY KEY AUTO_INCREMENT` | 照片唯一識別碼 |
| `album_id` | `INT UNSIGNED` | `NOT NULL`, `FOREIGN KEY REFERENCES albums(id) ON DELETE CASCADE` | 所屬相簿識別碼（必填） |
| `original_filename` | `VARCHAR(255)` | `NOT NULL` | 使用者上傳時的原始檔案名稱 |
| `stored_filename` | `VARCHAR(255)` | `NOT NULL UNIQUE` | 後端磁碟儲存的唯一檔名（UUID + 副檔名） |
| `thumbnail_filename` | `VARCHAR(255)` | `NOT NULL` | 後端磁碟儲存的平鋪預覽縮圖檔名 |
| `mime_type` | `VARCHAR(50)` | `NOT NULL` | 圖片 MIME 類型（限定 `image/jpeg`、`image/png`、`image/webp`、`image/gif`、`image/avif`） |
| `file_size_bytes` | `INT UNSIGNED` | `NOT NULL` | 檔案大小（位元組，上限 `20,971,520` bytes = 20 MB） |
| `width` | `INT UNSIGNED` | `NULL` | 圖片原始寬度（px） |
| `height` | `INT UNSIGNED` | `NULL` | 圖片原始高度（px） |
| `taken_at` | `DATETIME` | `NOT NULL` | 拍攝日期（優先取 EXIF `DateTimeOriginal`，若無則取檔案最後修改時間或匯入當下時間） |
| `sort_order` | `INT` | `NOT NULL DEFAULT 0` | 在所屬相簿內的平鋪排列順序（由 `0` 遞增，拖放後持久化更新） |
| `created_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 匯入系統時間 |
| `updated_at` | `DATETIME` | `NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最後更新時間 |

**索引設計 (Indexes)**:
- `PRIMARY KEY (id)`
- `UNIQUE KEY uk_photos_stored_filename (stored_filename)`
- `INDEX idx_photos_album_sort (album_id, sort_order ASC, id ASC)`：確保查詢特定相簿照片與拖放重排時達到 `< 50ms` 回應效能。

---

### 2.3 日期分組視圖模型 (`DateGroup` - 衍生聚合模型)

`DateGroup` 不獨立建立資料表，而是由後端查詢（或前端狀態衍生）根據 `albums.album_date` 的「年＋月」動態聚合而成，確保當某日期分組下最後一個相簿被刪除或修改日期時，空的日期分組標題自動消失（符合 Edge Cases）。

| 屬性名稱 | 型別 | 範例值 | 說明 |
| :--- | :--- | :--- | :--- |
| `yearMonth` | `string` | `"2026-10"` | 分組識別鍵（`YYYY-MM`），按降序（由新到舊）排列 |
| `label` | `string` | `"2026 年 10 月"` | 繁體中文顯示標題（符合 FR-003、FR-010） |
| `albums` | `AlbumWithPhotos[]` | `[...]` | 屬於該年月的相簿陣列，依 `album_date DESC, id DESC` 排列 |

---

## 3. 驗證規則與商業邏輯約束 (Validation Rules)

1. **照片上傳驗證 (FR-001 & Edge Cases)**：
   - **支援格式**：僅接受 MIME type 為 `image/jpeg`、`image/png`、`image/webp`、`image/gif`、`image/avif` 且對應副檔名為 `.jpg`、`.jpeg`、`.png`、`.webp`、`.gif`、`.avif`，並透過影像處理器驗證檔頭結構是否完好（防範損毀檔案）。
   - **檔案大小**：`0 < file_size_bytes <= 20 * 1024 * 1024`（20 MB）。
   - **錯誤處理**：批次上傳時，若個別檔案不符格式、超過 20 MB 或損毀，回傳結構化繁體中文錯誤項目（例如：`「檔案 example.bmp 格式不支援，僅支援 JPEG、PNG、WebP、GIF、AVIF 格式」`），並繼續完成同批次其餘有效照片的匯入。
2. **相簿建立與編輯驗證 (FR-001, FR-002, FR-004)**：
   - `title`：必填，去除首尾空白後長度介於 `1` 至 `120` 字元；空白時回傳繁體中文提示 `「請輸入相簿名稱」`。
   - `album_date`：必填，必須為有效之 `YYYY-MM-DD` 日期字串。若由主頁直接上傳照片並選擇「建立新相簿」且未指定日期，自動取該批有效照片中最早的 `taken_at` 日期作為預設值。
   - **禁止嵌套**：API 與資料表皆不接受 `parent_album_id` 屬性；若請求 payload 帶有 `parent_id` 或 `parentAlbumId`，直接拒絕或忽略。
3. **相簿刪除與實體檔案清理 (FR-002)**：
   - 當相簿內 `photoCount > 0` 時，前端必須先彈出繁體中文確認對話框（明確顯示：`「此相簿包含 N 張照片，刪除後照片將一併移除且無法復原，確定要刪除嗎？」`）。
   - 後端執行刪除時，先查詢該相簿下所有照片的 `stored_filename` 與 `thumbnail_filename`，在資料庫 Transaction 刪除相簿（連動刪除 `photos` 紀錄）提交後，同步清除磁碟上的原圖與縮圖檔案。

---

## 4. 狀態轉換：照片拖放排序與跨相簿移動 (State Transitions)

### 4.1 同一相簿內拖放重新排列 (FR-006)
- **觸發**：使用者將相簿 $A$ 中的照片 $P$ 從索引 `fromIndex` 拖放至 `toIndex`。
- **前端狀態**：立即執行樂觀更新（Optimistic UI）重排 DOM 順序，延遲 `< 100ms`；若拖曳中途按 `Esc` 或在無效區放開，立即還原至拖曳前快照。
- **後端持久化**：呼叫批次更新順序端點，在單一 MySQL Transaction 中將相簿 $A$ 內照片的 `sort_order` 依新順序更新為 `0, 1, 2, ..., n-1`。

### 4.2 跨相簿拖放移動照片 (FR-007)
- **觸發**：使用者將照片 $P$ 從來源相簿 $A$ 拖放至目標相簿 $B$ 的指定位置 `targetIndex`（若拖放至已收合的相簿 $B$ 標題列，則 `targetIndex` 設為相簿 $B$ 的末尾 `photos.length`）。
- **後端持久化**：在單一 MySQL Transaction 中：
  1. 將照片 $P$ 的 `album_id` 更新為相簿 $B$ 的 `id`。
  2. 重新正規化目標相簿 $B$ 所有照片的 `sort_order`（將照片 $P$ 插入 `targetIndex`）。
  3. 重新正規化來源相簿 $A$ 剩餘照片的 `sort_order` 為連續整數 `0..m-1`。
- **邊界保證**：若來源相簿 $A$ 移出最後一張照片，相簿 $A$ 依然保留（`photos: []`），並在前端顯示繁體中文空白狀態提示。
