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

/**
 * @param {string} title
 * @param {string} albumDate
 */
async function createAlbum(title, albumDate) {
  const response = await request(getApp()).post('/api/albums').send({ title, albumDate });
  return response.body.data.id;
}

describe('照片重排與跨相簿移動', () => {
  it('以單一交易保存同相簿順序，並拒絕不完整或無效的編號', async () => {
    const albumId = await createAlbum('順序測試', '2026-10-02');
    const jpeg = await imageBuffer('jpeg');
    const uploaded = await request(getApp())
      .post('/api/photos/upload')
      .field('albumId', String(albumId))
      .attach('photos', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('photos', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .attach('photos', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' });
    const uploadedPhotos = /** @type {Array<{ id: number }>} */ (uploaded.body.data.uploadedPhotos);
    const ids = uploadedPhotos.map((photo) => photo.id);
    const reversed = [ids[2], ids[0], ids[1]];
    const saved = await request(getApp())
      .put(`/api/albums/${albumId}/photos/reorder`)
      .send({ photoIds: reversed });
    expect(saved.status).toBe(200);
    expect(saved.body.message).toBe('照片排列順序已儲存');

    const grouped = await request(getApp()).get('/api/albums/grouped');
    const orderedPhotos = /** @type {Array<{ id: number }>} */ (
      grouped.body.data.groups[0].albums[0].photos
    );
    expect(orderedPhotos.map((photo) => photo.id)).toEqual(reversed);

    const incomplete = await request(getApp())
      .put(`/api/albums/${albumId}/photos/reorder`)
      .send({ photoIds: [ids[0]] });
    expect(incomplete.status).toBe(400);
    const missingAlbum = await request(getApp())
      .put('/api/albums/999999/photos/reorder')
      .send({ photoIds: [] });
    expect(missingAlbum.status).toBe(404);
    const badId = await request(getApp())
      .put('/api/albums/abc/photos/reorder')
      .send({ photoIds: reversed });
    expect(badId.status).toBe(400);
  });

  it('跨相簿移動後正規化兩邊順序，來源相簿清空後仍然保留', async () => {
    const sourceId = await createAlbum('來源', '2026-10-03');
    const targetId = await createAlbum('目標', '2026-09-03');
    const png = await imageBuffer('png');
    const sourceUpload = await request(getApp())
      .post('/api/photos/upload')
      .field('albumId', String(sourceId))
      .attach('photos', png, { filename: 'only.png', contentType: 'image/png' });
    const targetUpload = await request(getApp())
      .post('/api/photos/upload')
      .field('albumId', String(targetId))
      .attach('photos', png, { filename: 'keep.png', contentType: 'image/png' });
    const photoId = sourceUpload.body.data.uploadedPhotos[0].id;
    const targetPhotoId = targetUpload.body.data.uploadedPhotos[0].id;

    const moved = await request(getApp())
      .patch(`/api/photos/${photoId}/move`)
      .send({ targetAlbumId: targetId, targetIndex: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.message).toBe('照片已移動至目標相簿');
    expect(moved.body.data).toMatchObject({
      photoId,
      sourceAlbumId: sourceId,
      targetAlbumId: targetId,
      targetIndex: 0,
    });

    const grouped = await request(getApp()).get('/api/albums/grouped');
    const groups =
      /** @type {Array<{ albums: Array<{ id: number, photos: Array<{ id: number }>, photoCount: number }> }>} */ (
        grouped.body.data.groups
      );
    const albums = groups.flatMap((group) => group.albums);
    const source = albums.find((album) => album.id === sourceId);
    const target = albums.find((album) => album.id === targetId);
    expect(source?.photos).toEqual([]);
    expect(source?.photoCount).toBe(0);
    expect(target?.photos.map((photo) => photo.id)).toEqual([photoId, targetPhotoId]);

    const appended = await request(getApp())
      .patch(`/api/photos/${photoId}/move`)
      .send({ targetAlbumId: sourceId });
    expect(appended.status).toBe(200);
    expect(appended.body.data.targetIndex).toBe(0);

    const missing = await request(getApp())
      .patch('/api/photos/999999/move')
      .send({ targetAlbumId: sourceId, targetIndex: 0 });
    expect(missing.status).toBe(404);
    const invalid = await request(getApp())
      .patch(`/api/photos/${photoId}/move`)
      .send({ targetAlbumId: targetId, targetIndex: 99 });
    expect(invalid.status).toBe(400);
  });

  it('200 張照片的順序更新落在效能預算內', async () => {
    const albumId = await createAlbum('大量照片', '2026-04-01');
    const pool = getPool();
    const values = Array.from({ length: 200 }, (_, index) => [
      albumId,
      `bulk-${index}.jpg`,
      `bulk-${albumId}-${index}.jpg`,
      `bulk-${albumId}-${index}.webp`,
      'image/jpeg',
      1024,
      400,
      400,
      '2026-04-01 08:00:00',
      index,
    ]);
    await pool.query(
      `INSERT INTO photos (
         album_id, original_filename, stored_filename, thumbnail_filename, mime_type,
         file_size_bytes, width, height, taken_at, sort_order
       ) VALUES ?`,
      [values],
    );
    const [rows] = await pool.query(
      'SELECT id FROM photos WHERE album_id = ? ORDER BY sort_order ASC, id ASC',
      [albumId],
    );
    const photoIds = /** @type {Array<{ id: number }>} */ (rows)
      .map((row) => Number(row.id))
      .reverse();
    const started = performance.now();
    const saved = await request(getApp())
      .put(`/api/albums/${albumId}/photos/reorder`)
      .send({ photoIds });
    const elapsed = performance.now() - started;
    expect(saved.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
    const [ordered] = await pool.query(
      'SELECT id FROM photos WHERE album_id = ? ORDER BY sort_order ASC, id ASC',
      [albumId],
    );
    expect(/** @type {Array<{ id: number }>} */ (ordered).map((row) => Number(row.id))).toEqual(
      photoIds,
    );
  });
});
