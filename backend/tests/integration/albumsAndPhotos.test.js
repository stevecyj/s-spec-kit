import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getPool } from '../../src/config/db.js';
import { getApp, imageBuffer, resetTables, setupApp, shutdownApp } from '../helpers/testApp.js';

beforeAll(async () => {
  await setupApp();
});

afterAll(async () => {
  await shutdownApp();
});

beforeEach(async () => {
  await resetTables();
});

describe('相簿與照片管理 API', () => {
  it('拒絕任何巢狀相簿參數，並建立單層相簿', async () => {
    const nested = await request(getApp()).post('/api/albums').send({
      title: '子相簿',
      albumDate: '2026-10-01',
      parent_id: 1,
    });
    expect(nested.status).toBe(400);
    expect(nested.body.error.message).toContain('不支援巢狀相簿');

    const parentAlbum = await request(getApp())
      .post('/api/albums')
      .send({ title: '  台南週末美食之旅  ', albumDate: '2026-10-10', parentAlbumId: 9 });
    expect(parentAlbum.status).toBe(400);

    const blank = await request(getApp())
      .post('/api/albums')
      .send({ title: '   ', albumDate: '2026-10-10' });
    expect(blank.status).toBe(400);
    expect(blank.body.error.message).toBe('請輸入相簿名稱');

    const created = await request(getApp())
      .post('/api/albums')
      .send({ title: '  台南週末美食之旅  ', albumDate: '2026-10-10' });
    expect(created.status).toBe(201);
    expect(created.body.message).toBe('相簿已建立');
    expect(created.body.data.title).toBe('台南週末美食之旅');
    expect(created.body.data.photos).toEqual([]);
    expect(created.body.data).not.toHaveProperty('parentId');

    const columns = await getPool().query(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'albums' AND COLUMN_NAME LIKE '%parent%'`,
    );
    expect(columns[0]).toEqual([]);
  });

  it('依年與月由新到舊分組，並可修改與刪除相簿', async () => {
    const august = await request(getApp())
      .post('/api/albums')
      .send({ title: '夏日海邊', albumDate: '2026-08-20' });
    const october = await request(getApp())
      .post('/api/albums')
      .send({ title: '2026 阿里山日出', albumDate: '2026-10-15' });
    const grouped = await request(getApp()).get('/api/albums/grouped');
    expect(grouped.status).toBe(200);
    const labels = /** @type {Array<{ label: string, yearMonth: string }>} */ (
      grouped.body.data.groups
    );
    expect(labels.map((group) => group.label)).toEqual(['2026 年 10 月', '2026 年 8 月']);
    expect(grouped.body.data.groups[0].yearMonth).toBe('2026-10');

    const updated = await request(getApp())
      .patch(`/api/albums/${october.body.data.id}`)
      .send({ title: '太魯閣秋日健行', albumDate: '2026-10-18' });
    expect(updated.status).toBe(200);
    expect(updated.body.message).toBe('相簿已更新');
    expect(updated.body.data.albumDate).toBe('2026-10-18');

    const missing = await request(getApp()).patch('/api/albums/999999').send({ title: '不存在' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ALBUM_NOT_FOUND');

    const removed = await request(getApp()).delete(`/api/albums/${august.body.data.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.deletedPhotoCount).toBe(0);
    const afterDelete = await request(getApp()).get('/api/albums/grouped');
    const remaining = /** @type {Array<{ yearMonth: string }>} */ (afterDelete.body.data.groups);
    expect(remaining.map((group) => group.yearMonth)).toEqual(['2026-10']);
  });

  it('上傳合法照片、略過不符檔案，並刪除相簿時清掉磁碟檔案', async () => {
    const album = await request(getApp())
      .post('/api/albums')
      .send({ title: '家庭聚餐', albumDate: '2026-10-05' });
    const jpeg = await imageBuffer('jpeg');
    const response = await request(getApp())
      .post('/api/photos/upload')
      .field('albumId', String(album.body.data.id))
      .field('fileLastModified', JSON.stringify([Date.parse('2026-10-05T12:15:00.000Z')]))
      .attach('photos', jpeg, { filename: 'dinner.jpg', contentType: 'image/jpeg' })
      .attach('photos', Buffer.from('not-bmp'), {
        filename: 'example.bmp',
        contentType: 'image/bmp',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.uploadedPhotos).toHaveLength(1);
    expect(response.body.data.skippedFiles[0].reason).toContain('格式不支援');
    expect(response.body.message).toContain('略過 1 個');
    const photo = response.body.data.uploadedPhotos[0];
    expect(photo.thumbnailUrl).toMatch(/^\/uploads\/thumbnails\/.+\.webp$/);

    const thumbnail = await request(getApp()).get(photo.thumbnailUrl);
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers['cache-control']).toContain('immutable');
    expect(thumbnail.headers['content-type']).toContain('image/webp');

    const deleted = await request(getApp()).delete(`/api/albums/${album.body.data.id}`);
    expect(deleted.body.data.deletedPhotoCount).toBe(1);
    expect(deleted.body.message).toBe('相簿及內部 1 張照片已成功刪除');
    const gone = await request(getApp()).get(photo.originalUrl);
    expect(gone.status).toBe(404);
  });

  it('可在上傳時建立新相簿，並刪除單張照片', async () => {
    const png = await imageBuffer('png');
    const uploaded = await request(getApp())
      .post('/api/photos/upload')
      .field('createAlbumTitle', '清晨步道')
      .field('createAlbumDate', '2026-09-02')
      .attach('photos', png, { filename: 'trail.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.album.title).toBe('清晨步道');
    const photoId = uploaded.body.data.uploadedPhotos[0].id;
    const removed = await request(getApp()).delete(`/api/photos/${photoId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('照片已刪除');
    const grouped = await request(getApp()).get('/api/albums/grouped');
    expect(grouped.body.data.groups[0].albums[0].photoCount).toBe(0);
  });
});
