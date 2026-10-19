# REST API 與前端介面契約 (Interface Contracts): 照片相簿日期分組與拖放整理系統

**Feature Branch**: `001-photo-album-organizer`  
**Date**: 2026-10-20  
**Spec**: [spec.md](./spec.md) | **Data Model**: [data-model.md](./data-model.md)

本專案採前後端分離架構（Vite 原生 JS 前端 + Node.js/MySQL 後端）。後端提供 JSON RESTful API 與圖片靜態資源服務，基礎路徑為 `/api`。所有錯誤回應皆包含繁體中文訊息（符合 FR-010 與憲法第 III 原則）。

---

## 1. 共通回應與錯誤格式

### 成功回應結構
```json
{
  "data": { ... },
  "message": "操作成功"
}
```

### 錯誤回應結構 (`4xx` / `5xx`)
```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "請輸入相簿名稱",
    "details": []
  }
}
```

---

## 2. 相簿與日期分組端點 (Albums & Date Groups API)

### 2.1 取得主頁面依「年＋月」分組之所有相簿與平鋪照片清單
- **Endpoint**: `GET /api/albums/grouped`
- **說明**: 供主頁面初始化與重新整理時呼叫。回傳依「年＋月」（`YYYY-MM`）由新到舊排序的分組清單；同分組內的相簿依 `albumDate DESC, id DESC` 排列；每個相簿內含依 `sortOrder ASC` 排列的照片清單（FR-003、FR-005）。
- **Response `200 OK`**:
```json
{
  "data": {
    "groups": [
      {
        "yearMonth": "2026-10",
        "label": "2026 年 10 月",
        "albums": [
          {
            "id": 12,
            "title": "太魯閣秋日健行",
            "albumDate": "2026-10-18",
            "isCollapsed": false,
            "photoCount": 2,
            "photos": [
              {
                "id": 101,
                "albumId": 12,
                "originalFilename": "IMG_0001.JPG",
                "thumbnailUrl": "/uploads/thumbnails/9b1deb4d.webp",
                "originalUrl": "/uploads/originals/9b1deb4d.jpg",
                "mimeType": "image/jpeg",
                "fileSizeBytes": 3451200,
                "width": 4032,
                "height": 3024,
                "takenAt": "2026-10-18T09:30:00.000Z",
                "sortOrder": 0
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

### 2.2 建立新相簿
- **Endpoint**: `POST /api/albums`
- **說明**: 建立單層相簿（嚴禁傳入父相簿 ID，FR-002、FR-004）。
- **Request Body (`application/json`)**:
```json
{
  "title": "台南週末美食之旅",
  "albumDate": "2026-10-10"
}
```
- **Response `201 Created`**:
```json
{
  "data": {
    "id": 15,
    "title": "台南週末美食之旅",
    "albumDate": "2026-10-10",
    "isCollapsed": false,
    "photoCount": 0,
    "photos": []
  },
  "message": "相簿已建立"
}
```
- **Error Responses**:
  - `400 Bad Request`: `{"error": {"code": "VALIDATION_ERROR", "message": "請輸入有效的相簿名稱與日期"}}`

---

### 2.3 修改相簿名稱、關聯日期或展開／收合狀態
- **Endpoint**: `PATCH /api/albums/:albumId`
- **說明**: 更新相簿名稱、所屬日期（若跨年月將自動移動至對應日期分組）或主頁面平鋪預覽的收合狀態（FR-002、FR-005）。
- **Request Body (`application/json`)**:
```json
{
  "title": "台南雙十連假美食紀錄",
  "albumDate": "2026-09-28",
  "isCollapsed": true
}
```
- **Response `200 OK`**: 回傳更新後的相簿物件與 `"message": "相簿已更新"`。
- **Error Responses**:
  - `404 Not Found`: `{"error": {"code": "ALBUM_NOT_FOUND", "message": "找不到指定的相簿"}}`

---

### 2.4 刪除相簿（連同內部照片一併移除）
- **Endpoint**: `DELETE /api/albums/:albumId`
- **說明**: 刪除指定相簿及其內部所有照片的資料庫紀錄與磁碟檔案（FR-002）。前端在 `photoCount > 0` 時必須先顯示繁體中文確認對話框，使用者確認後才呼叫此端點。
- **Response `200 OK`**:
```json
{
  "data": {
    "deletedAlbumId": 15,
    "deletedPhotoCount": 8
  },
  "message": "相簿及內部 8 張照片已成功刪除"
}
```

---

## 3. 照片上傳、查詢與管理端點 (Photos API)

### 3.1 上傳照片（至既有相簿，或於主頁上傳並自動建立新相簿）
- **Endpoint**: `POST /api/photos/upload`
- **Content-Type**: `multipart/form-data`
- **說明**: 支援單張或多張照片上傳（支援 `JPEG/JPG`、`PNG`、`WebP`、`GIF`、`AVIF`，單檔上限 `20 MB`）。可指定既有 `albumId`，或指定 `createAlbumTitle`（與選填 `createAlbumDate`）在同一次上傳中自動建立新相簿（預設取該批照片最早拍攝或修改日期，FR-001）。
- **Form Fields**:
  - `photos`: `File[]`（必填，1 至多張圖片檔案）
  - `fileLastModified`: `string`（選填，JSON 字串陣列 `[1729243800000, ...]`，供無 EXIF 的照片計算預設日期）
  - `albumId`: `number`（與 `createAlbumTitle` 二擇一：歸入既有相簿）
  - `createAlbumTitle`: `string`（與 `albumId` 二擇一：建立新相簿名稱）
  - `createAlbumDate`: `string`（選填，`YYYY-MM-DD`，若未提供則自動取該批有效照片最早日期）
- **Response `201 Created`（含部分成功與略過提示）**:
```json
{
  "data": {
    "album": {
      "id": 16,
      "title": "家庭聚餐",
      "albumDate": "2026-10-05",
      "isCollapsed": false
    },
    "uploadedPhotos": [
      {
        "id": 108,
        "albumId": 16,
        "originalFilename": "dinner_01.webp",
        "thumbnailUrl": "/uploads/thumbnails/3f8a12c0.webp",
        "originalUrl": "/uploads/originals/3f8a12c0.webp",
        "mimeType": "image/webp",
        "fileSizeBytes": 1024000,
        "width": 1920,
        "height": 1080,
        "takenAt": "2026-10-05T12:15:00.000Z",
        "sortOrder": 0
      }
    ],
    "skippedFiles": [
      {
        "filename": "video.mp4",
        "reason": "檔案「video.mp4」格式不支援，僅支援 JPEG、PNG、WebP、GIF、AVIF 格式"
      },
      {
        "filename": "huge.png",
        "reason": "檔案「huge.png」大小超過 20 MB 上限，已略過匯入"
      }
    ]
  },
  "message": "成功匯入 1 張照片，略過 2 個不符合規範的檔案"
}
```

---

### 3.2 同一相簿內拖放重新排列照片順序
- **Endpoint**: `PUT /api/albums/:albumId/photos/reorder`
- **說明**: 當使用者在同一相簿的平鋪網格內拖放照片調整順序時呼叫，將新的照片 ID 排列順序持久化保存（FR-006、FR-009）。
- **Request Body (`application/json`)**:
```json
{
  "photoIds": [105, 101, 103, 102]
}
```
- **Response `200 OK`**:
```json
{
  "data": {
    "albumId": 12,
    "photoIds": [105, 101, 103, 102]
  },
  "message": "照片排列順序已儲存"
}
```

---

### 3.3 跨相簿拖放移動照片（含指定插入位置或放入已收合相簿末尾）
- **Endpoint**: `PATCH /api/photos/:photoId/move`
- **說明**: 將單張照片從原相簿拖放移動至目標相簿 `targetAlbumId`，並指定在目標相簿中的 `targetIndex`（0-based；若拖放至已收合的相簿標題列則不傳或傳入目標相簿照片總數以歸入末尾，FR-007、FR-009）。
- **Request Body (`application/json`)**:
```json
{
  "targetAlbumId": 15,
  "targetIndex": 2
}
```
- **Response `200 OK`**:
```json
{
  "data": {
    "photoId": 101,
    "sourceAlbumId": 12,
    "targetAlbumId": 15,
    "targetIndex": 2
  },
  "message": "照片已移動至目標相簿"
}
```

---

### 3.4 刪除單張照片
- **Endpoint**: `DELETE /api/photos/:photoId`
- **說明**: 從相簿中移除單張照片，並同步刪除磁碟上的原圖與縮圖檔案（FR-002）。
- **Response `200 OK`**:
```json
{
  "data": {
    "deletedPhotoId": 101,
    "albumId": 12
  },
  "message": "照片已刪除"
}
```

---

## 4. 靜態圖片預覽與查詢路由
- **縮圖預覽路由**: `GET /uploads/thumbnails/:filename`（供主頁面平鋪式網格預覽高速載入，設定 `Cache-Control: public, max-age=31536000, immutable`）
- **原始照片路由**: `GET /uploads/originals/:filename`（供點選單張照片放大檢視原始畫質）
