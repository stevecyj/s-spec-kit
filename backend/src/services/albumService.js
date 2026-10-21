// @ts-check
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { getPool, withTransaction } from '../config/db.js';
import { NotFoundError, ValidationError } from '../api/errorHandler.js';
import { groupAlbumsByMonth } from '../utils/dateGroupFormatter.js';

const NESTING_KEYS = ['parent_album_id', 'parent_id', 'parentAlbumId'];

/**
 * @param {Record<string, unknown> | null | undefined} body
 */
export function assertFlatAlbumPayload(body) {
  if (!body || typeof body !== 'object') return;
  for (const key of NESTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new ValidationError('不支援巢狀相簿，系統僅允許單層相簿結構');
    }
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTitle(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * @param {string} title
 */
export function assertTitle(title) {
  if (title.length === 0) {
    throw new ValidationError('請輸入相簿名稱');
  }
  if ([...title].length > 120) {
    throw new ValidationError('相簿名稱不可超過 120 個字元');
  }
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidAlbumDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * @param {string} storedName
 */
function safeBasename(storedName) {
  const base = path.basename(storedName);
  if (base !== storedName || base.includes('..')) {
    throw new ValidationError('照片檔名不正確');
  }
  return base;
}

/**
 * @param {string} filePath
 */
async function safeUnlink(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    if (code !== 'ENOENT') {
      console.error(`無法刪除檔案 ${filePath}`, error);
    }
  }
}

/**
 * @param {string | Date} value
 */
export function toIsoDateTime(value) {
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  if (/[zZ]$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text)) {
    return new Date(text).toISOString();
  }
  return new Date(`${text.replace(' ', 'T')}Z`).toISOString();
}

/**
 * @param {string | Date} value
 */
export function toDateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * @typedef {object} PhotoDto
 * @property {number} id
 * @property {number} albumId
 * @property {string} originalFilename
 * @property {string} thumbnailUrl
 * @property {string} originalUrl
 * @property {string} mimeType
 * @property {number} fileSizeBytes
 * @property {number | null} width
 * @property {number | null} height
 * @property {string} takenAt
 * @property {number} sortOrder
 */

/**
 * @param {import('../models/photoRepository.js').PhotoRow} row
 * @returns {PhotoDto}
 */
export function mapPhoto(row) {
  return {
    id: Number(row.id),
    albumId: Number(row.album_id),
    originalFilename: row.original_filename,
    thumbnailUrl: `/uploads/thumbnails/${row.thumbnail_filename}`,
    originalUrl: `/uploads/originals/${row.stored_filename}`,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    takenAt: toIsoDateTime(row.taken_at),
    sortOrder: Number(row.sort_order),
  };
}

/**
 * @param {import('../models/albumRepository.js').AlbumRow} row
 * @param {PhotoDto[]} photos
 */
export function mapAlbum(row, photos) {
  return {
    id: Number(row.id),
    title: row.title,
    albumDate: toDateOnly(row.album_date),
    isCollapsed: Number(row.is_collapsed) === 1,
    photoCount: photos.length,
    photos,
  };
}

/**
 * @param {() => { originals: string, thumbnails: string }} getUploadPaths
 * @param {ReturnType<import('../models/albumRepository.js').createAlbumRepository>} albums
 * @param {ReturnType<import('../models/photoRepository.js').createPhotoRepository>} photos
 */
export function createAlbumService(getUploadPaths, albums, photos) {
  return {
    async listGrouped() {
      const pool = getPool();
      const albumRows = await albums.listAlbums(pool);
      const photoRows = await photos.listPhotos(pool);
      /** @type {Map<number, PhotoDto[]>} */
      const byAlbum = new Map();
      for (const row of photoRows) {
        const albumId = Number(row.album_id);
        const list = byAlbum.get(albumId) ?? [];
        list.push(mapPhoto(row));
        byAlbum.set(albumId, list);
      }
      const albumDtos = albumRows.map((row) => mapAlbum(row, byAlbum.get(Number(row.id)) ?? []));
      return groupAlbumsByMonth(albumDtos);
    },

    /**
     * @param {Record<string, unknown>} body
     */
    async create(body) {
      assertFlatAlbumPayload(body);
      const title = normalizeTitle(body.title);
      const albumDate = body.albumDate;
      if (!title || !isValidAlbumDate(albumDate)) {
        if (!title && !isValidAlbumDate(albumDate)) {
          throw new ValidationError('請輸入有效的相簿名稱與日期');
        }
        if (!title) throw new ValidationError('請輸入相簿名稱');
        throw new ValidationError('請輸入有效的相簿日期');
      }
      assertTitle(title);
      const id = await albums.insertAlbum(getPool(), { title, albumDate });
      const created = await albums.findAlbumById(getPool(), id);
      if (!created) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');
      return mapAlbum(created, []);
    },

    /**
     * @param {number} albumId
     * @param {Record<string, unknown>} body
     */
    async update(albumId, body) {
      assertFlatAlbumPayload(body);
      const existing = await albums.findAlbumById(getPool(), albumId);
      if (!existing) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');

      /** @type {{ title?: string, albumDate?: string, isCollapsed?: boolean }} */
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(body, 'title')) {
        const title = normalizeTitle(body.title);
        assertTitle(title);
        patch.title = title;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'albumDate')) {
        if (!isValidAlbumDate(body.albumDate)) {
          throw new ValidationError('請輸入有效的相簿日期');
        }
        patch.albumDate = body.albumDate;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'isCollapsed')) {
        if (typeof body.isCollapsed !== 'boolean') {
          throw new ValidationError('收合狀態必須是布林值');
        }
        patch.isCollapsed = body.isCollapsed;
      }
      if (Object.keys(patch).length === 0) {
        throw new ValidationError('沒有可更新的相簿欄位');
      }
      await albums.updateAlbum(getPool(), albumId, patch);
      const updated = await albums.findAlbumById(getPool(), albumId);
      if (!updated) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');
      const photoRows = await photos.listByAlbumId(getPool(), albumId);
      return mapAlbum(
        updated,
        photoRows.map((row) => mapPhoto(row)),
      );
    },

    /**
     * @param {number} albumId
     */
    async remove(albumId) {
      const existing = await albums.findAlbumById(getPool(), albumId);
      if (!existing) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');
      const photoRows = await photos.listByAlbumId(getPool(), albumId);
      await withTransaction(async (connection) => {
        await albums.deleteAlbum(connection, albumId);
      });
      const paths = getUploadPaths();
      await Promise.all(
        photoRows.flatMap((row) => [
          safeUnlink(path.join(paths.originals, safeBasename(row.stored_filename))),
          safeUnlink(path.join(paths.thumbnails, safeBasename(row.thumbnail_filename))),
        ]),
      );
      const deletedPhotoCount = photoRows.length;
      return {
        deletedAlbumId: albumId,
        deletedPhotoCount,
        message:
          deletedPhotoCount > 0 ? `相簿及內部 ${deletedPhotoCount} 張照片已成功刪除` : '相簿已刪除',
      };
    },
  };
}
