// @ts-check
import { withTransaction } from '../config/db.js';

/** @typedef {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} Queryable */

/**
 * @typedef {object} PhotoRow
 * @property {number} id
 * @property {number} album_id
 * @property {string} original_filename
 * @property {string} stored_filename
 * @property {string} thumbnail_filename
 * @property {string} mime_type
 * @property {number} file_size_bytes
 * @property {number | null} width
 * @property {number | null} height
 * @property {string} taken_at
 * @property {number} sort_order
 */

/**
 * @param {Queryable} db
 * @param {string} sql
 * @param {unknown[]} [params]
 * @returns {Promise<PhotoRow[]>}
 */
async function queryPhotos(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return /** @type {PhotoRow[]} */ (rows);
}

/**
 * 單一 UPDATE 以 CASE 正規化 sort_order，避免逐列往返。
 * 200 張照片仍是一次索引更新，維持 API P95 < 200ms。
 * @param {Queryable} db
 * @param {number} albumId
 * @param {number[]} photoIds
 */
export async function applySortOrder(db, albumId, photoIds) {
  if (photoIds.length === 0) return;
  const cases = photoIds.map(() => 'WHEN ? THEN ?').join(' ');
  /** @type {unknown[]} */
  const params = [];
  photoIds.forEach((id, index) => {
    params.push(id, index);
  });
  params.push(albumId);
  await db.query(
    `UPDATE photos SET sort_order = CASE id ${cases} ELSE sort_order END WHERE album_id = ?`,
    params,
  );
}

/**
 * @param {number[]} existing
 * @param {number[]} requested
 */
export function isCompletePhotoIdList(existing, requested) {
  if (existing.length !== requested.length) return false;
  if (new Set(requested).size !== requested.length) return false;
  const existingSet = new Set(existing);
  return requested.every((id) => existingSet.has(id));
}

export function createPhotoRepository() {
  return {
    /** @param {Queryable} db */
    async listPhotos(db) {
      return queryPhotos(
        db,
        `SELECT id, album_id, original_filename, stored_filename, thumbnail_filename,
                mime_type, file_size_bytes, width, height, taken_at, sort_order
         FROM photos
         ORDER BY album_id ASC, sort_order ASC, id ASC`,
      );
    },

    /**
     * @param {Queryable} db
     * @param {number} albumId
     */
    async listByAlbumId(db, albumId) {
      return queryPhotos(
        db,
        `SELECT id, album_id, original_filename, stored_filename, thumbnail_filename,
                mime_type, file_size_bytes, width, height, taken_at, sort_order
         FROM photos
         WHERE album_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [albumId],
      );
    },

    /**
     * @param {Queryable} db
     * @param {number} photoId
     */
    async findById(db, photoId) {
      const rows = await queryPhotos(
        db,
        `SELECT id, album_id, original_filename, stored_filename, thumbnail_filename,
                mime_type, file_size_bytes, width, height, taken_at, sort_order
         FROM photos WHERE id = ?`,
        [photoId],
      );
      return rows[0] ?? null;
    },

    /**
     * @param {Queryable} db
     * @param {Array<{
     *   albumId: number,
     *   originalFilename: string,
     *   storedFilename: string,
     *   thumbnailFilename: string,
     *   mimeType: string,
     *   fileSizeBytes: number,
     *   width: number | null,
     *   height: number | null,
     *   takenAt: string,
     *   sortOrder: number
     * }>} photos
     */
    async insertMany(db, photos) {
      if (photos.length === 0) return [];
      const placeholders = photos.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      /** @type {unknown[]} */
      const params = [];
      for (const photo of photos) {
        params.push(
          photo.albumId,
          photo.originalFilename,
          photo.storedFilename,
          photo.thumbnailFilename,
          photo.mimeType,
          photo.fileSizeBytes,
          photo.width,
          photo.height,
          photo.takenAt,
          photo.sortOrder,
        );
      }
      const [result] = await db.query(
        `INSERT INTO photos (
           album_id, original_filename, stored_filename, thumbnail_filename, mime_type,
           file_size_bytes, width, height, taken_at, sort_order
         ) VALUES ${placeholders}`,
        params,
      );
      const insertId = Number(/** @type {{ insertId: number }} */ (result).insertId);
      return photos.map((_, index) => insertId + index);
    },

    /**
     * @param {Queryable} db
     * @param {number} photoId
     */
    async deleteById(db, photoId) {
      await db.query('DELETE FROM photos WHERE id = ?', [photoId]);
    },

    /**
     * @param {number} albumId
     * @param {number[]} photoIds
     */
    async reorder(albumId, photoIds) {
      return withTransaction(async (connection) => {
        const [albums] = await connection.query('SELECT id FROM albums WHERE id = ? FOR UPDATE', [
          albumId,
        ]);
        if (/** @type {unknown[]} */ (albums).length === 0) {
          return { missingAlbum: true };
        }
        const rows = await queryPhotos(
          connection,
          `SELECT id, album_id, original_filename, stored_filename, thumbnail_filename,
                  mime_type, file_size_bytes, width, height, taken_at, sort_order
           FROM photos WHERE album_id = ? ORDER BY id ASC FOR UPDATE`,
          [albumId],
        );
        const existing = rows.map((row) => Number(row.id));
        if (!isCompletePhotoIdList(existing, photoIds)) {
          return { invalidList: true };
        }
        await applySortOrder(connection, albumId, photoIds);
        return { albumId, photoIds };
      });
    },

    /**
     * @param {{ photoId: number, targetAlbumId: number, targetIndex: number | null }} input
     */
    async move(input) {
      return withTransaction(async (connection) => {
        const currentRows = await queryPhotos(
          connection,
          `SELECT id, album_id, original_filename, stored_filename, thumbnail_filename,
                  mime_type, file_size_bytes, width, height, taken_at, sort_order
           FROM photos WHERE id = ? FOR UPDATE`,
          [input.photoId],
        );
        const current = currentRows[0];
        if (!current) return { missingPhoto: true };

        const sourceAlbumId = Number(current.album_id);
        const targetAlbumId = input.targetAlbumId;
        if (sourceAlbumId === targetAlbumId) return { sameAlbum: true };

        const lockIds = [sourceAlbumId, targetAlbumId].sort((a, b) => a - b);
        const [lockedAlbums] = await connection.query(
          'SELECT id FROM albums WHERE id IN (?, ?) ORDER BY id FOR UPDATE',
          lockIds,
        );
        const lockedIds = new Set(
          /** @type {{ id: number }[]} */ (lockedAlbums).map((row) => Number(row.id)),
        );
        if (!lockedIds.has(targetAlbumId)) return { missingTarget: true };
        if (!lockedIds.has(sourceAlbumId)) return { missingSource: true };

        await queryPhotos(
          connection,
          `SELECT id, album_id, original_filename, stored_filename, thumbnail_filename,
                  mime_type, file_size_bytes, width, height, taken_at, sort_order
           FROM photos WHERE album_id IN (?, ?) ORDER BY id FOR UPDATE`,
          [sourceAlbumId, targetAlbumId],
        );

        const sourceRows = await queryPhotos(
          connection,
          `SELECT id FROM photos WHERE album_id = ? ORDER BY sort_order ASC, id ASC`,
          [sourceAlbumId],
        );
        const targetRows = await queryPhotos(
          connection,
          `SELECT id FROM photos WHERE album_id = ? ORDER BY sort_order ASC, id ASC`,
          [targetAlbumId],
        );
        const sourceIds = sourceRows
          .map((row) => Number(row.id))
          .filter((id) => id !== input.photoId);
        const targetIds = targetRows.map((row) => Number(row.id));
        const targetIndex = input.targetIndex == null ? targetIds.length : input.targetIndex;
        if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > targetIds.length) {
          return { invalidIndex: true };
        }
        targetIds.splice(targetIndex, 0, input.photoId);
        await connection.query('UPDATE photos SET album_id = ? WHERE id = ?', [
          targetAlbumId,
          input.photoId,
        ]);
        await applySortOrder(connection, sourceAlbumId, sourceIds);
        await applySortOrder(connection, targetAlbumId, targetIds);
        return {
          photoId: input.photoId,
          sourceAlbumId,
          targetAlbumId,
          targetIndex,
        };
      });
    },
  };
}
