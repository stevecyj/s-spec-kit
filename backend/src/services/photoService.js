// @ts-check
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getPool, withTransaction } from '../config/db.js';
import { applySortOrder } from '../models/photoRepository.js';
import { NotFoundError, ValidationError } from '../api/errorHandler.js';
import {
  assertFlatAlbumPayload,
  assertTitle,
  isValidAlbumDate,
  mapAlbum,
  mapPhoto,
  normalizeTitle,
} from './albumService.js';

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** @type {Record<string, string>} */
const EXTENSION_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

/**
 * @param {unknown} value
 */
export function parseExifDateTime(value) {
  if (typeof value !== 'string') return null;
  const matched = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const hour = Number(matched[4]);
  const minute = Number(matched[5]);
  const second = Number(matched[6]);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * @param {Buffer} buffer
 * @param {number} offset
 * @param {boolean} little
 */
function readU16(buffer, offset, little) {
  return little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

/**
 * @param {Buffer} buffer
 * @param {number} offset
 * @param {boolean} little
 */
function readU32(buffer, offset, little) {
  return little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

/**
 * @param {Buffer} tiff
 * @param {number} valueOffset
 * @param {number} type
 * @param {number} length
 * @param {boolean} little
 */
function readAsciiValue(tiff, valueOffset, type, length, little) {
  if (type !== 2 || length <= 0 || length > 64) return null;
  const start = length > 4 ? readU32(tiff, valueOffset, little) : valueOffset;
  if (start < 0 || start + length > tiff.length) return null;
  return tiff.toString('ascii', start, start + length).replace(/\0+$/g, '');
}

/**
 * @param {Buffer} tiff
 * @param {number} offset
 * @param {boolean} little
 * @param {boolean} isIfd0
 * @returns {Date | null}
 */
function readIfdDate(tiff, offset, little, isIfd0) {
  if (offset < 0 || offset + 2 > tiff.length) return null;
  const count = readU16(tiff, offset, little);
  /** @type {number | null} */
  let exifOffset = null;
  /** @type {Date | null} */
  let dateTime = null;
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12;
    if (entry + 12 > tiff.length) return dateTime;
    const tag = readU16(tiff, entry, little);
    const type = readU16(tiff, entry + 2, little);
    const length = readU32(tiff, entry + 4, little);
    if (isIfd0 && tag === 0x8769 && type === 4) {
      exifOffset = readU32(tiff, entry + 8, little);
    }
    if (tag === 0x9003 || tag === 0x0132) {
      const parsed = parseExifDateTime(readAsciiValue(tiff, entry + 8, type, length, little));
      if (tag === 0x9003 && parsed) return parsed;
      if (parsed) dateTime = parsed;
    }
  }
  if (isIfd0 && exifOffset != null) {
    return readIfdDate(tiff, exifOffset, little, false) ?? dateTime;
  }
  return dateTime;
}

/**
 * @param {Buffer} tiff
 * @returns {Date | null}
 */
function readTiffDate(tiff) {
  if (tiff.length < 8) return null;
  const order = tiff.toString('ascii', 0, 2);
  const little = order === 'II';
  if (!little && order !== 'MM') return null;
  if (readU16(tiff, 2, little) !== 0x2a) return null;
  return readIfdDate(tiff, readU32(tiff, 4, little), little, true);
}

/**
 * @param {Buffer} buffer
 * @returns {Date | null}
 */
export function readExifDateTimeOriginal(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const size = buffer.readUInt16BE(offset + 2);
      if (size < 2 || offset + 2 + size > buffer.length) break;
      if (marker === 0xe1) {
        const start = offset + 4;
        if (buffer.toString('ascii', start, start + 6) === 'Exif\0\0') {
          const found = readTiffDate(buffer.subarray(start + 6, offset + 2 + size));
          if (found) return found;
        }
      }
      offset += 2 + size;
    }
    return null;
  }
  if (buffer.toString('ascii', 0, 6) === 'Exif\0\0') {
    return readTiffDate(buffer.subarray(6));
  }
  return readTiffDate(buffer);
}

/**
 * @param {{ exifDate: Date | null, fileLastModified?: number | null, now?: Date }} input
 * @returns {Date}
 */
export function resolveTakenAt({ exifDate, fileLastModified = null, now = new Date() }) {
  if (exifDate instanceof Date && !Number.isNaN(exifDate.getTime())) return exifDate;
  if (
    typeof fileLastModified === 'number' &&
    Number.isFinite(fileLastModified) &&
    fileLastModified > 0
  ) {
    const fromFile = new Date(fileLastModified);
    if (!Number.isNaN(fromFile.getTime())) return fromFile;
  }
  return now;
}

/**
 * @param {Date[]} dates
 */
export function earliestTakenAt(dates) {
  return dates.reduce((earliest, current) => (current < earliest ? current : earliest));
}

/**
 * @param {Date} date
 */
export function toMysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * @param {Date} date
 */
export function toDateOnlyUtc(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {{ originalFilename?: string, mimeType?: string, size?: number }} file
 * @returns {{ ok: false, filename: string, reason: string } | { ok: true, filename: string, extension: string, mimeType: string }}
 */
export function classifyUploadFile(file) {
  const filename =
    path.basename(file.originalFilename || '未命名檔案').slice(0, 255) || '未命名檔案';
  const extension = path.extname(filename).toLowerCase();
  const expectedMime = EXTENSION_MIME[extension];
  if (!expectedMime || file.mimeType !== expectedMime) {
    return {
      ok: false,
      filename,
      reason: `檔案「${filename}」格式不支援，僅支援 JPEG、PNG、WebP、GIF、AVIF 格式`,
    };
  }
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, filename, reason: `檔案「${filename}」是空檔案，已略過匯入` };
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, filename, reason: `檔案「${filename}」大小超過 20 MB 上限，已略過匯入` };
  }
  return { ok: true, filename, extension, mimeType: expectedMime };
}

/**
 * @typedef {object} UploadFile
 * @property {string} originalname
 * @property {string} mimetype
 * @property {number} size
 * @property {Buffer} buffer
 */

/**
 * @typedef {object} AcceptedPhoto
 * @property {true} ok
 * @property {string} filename
 * @property {string} extension
 * @property {string} mimeType
 * @property {Buffer} buffer
 * @property {Buffer} thumbnail
 * @property {number} width
 * @property {number} height
 * @property {Date} takenAt
 * @property {number} size
 */

/**
 * @param {UploadFile} file
 * @param {{ fileLastModified?: number | null, now?: Date }} [options]
 * @returns {Promise<AcceptedPhoto | { ok: false, filename: string, reason: string }>}
 */
export async function inspectPhotoFile(file, options = {}) {
  const classified = classifyUploadFile({
    originalFilename: file.originalname,
    mimeType: file.mimetype,
    size: file.size ?? file.buffer?.length,
  });
  if (!classified.ok) {
    return { ok: false, filename: classified.filename, reason: classified.reason };
  }
  try {
    const exifDate = readExifDateTimeOriginal(file.buffer);
    const metadata = await sharp(file.buffer, { failOn: 'error', animated: false }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('圖片尺寸無法讀取');
    }
    const thumbnail = await sharp(file.buffer, { failOn: 'error', animated: false })
      .rotate()
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 75 })
      .toBuffer();
    const takenAt = resolveTakenAt({
      exifDate,
      fileLastModified: options.fileLastModified,
      now: options.now,
    });
    return {
      ok: true,
      filename: classified.filename,
      extension: classified.extension,
      mimeType: classified.mimeType,
      buffer: file.buffer,
      thumbnail,
      width: metadata.width,
      height: metadata.height,
      takenAt,
      size: file.buffer.length,
    };
  } catch {
    return {
      ok: false,
      filename: classified.filename,
      reason: `檔案「${classified.filename}」已損毀或內容不是有效的圖片，已略過匯入`,
    };
  }
}

/**
 * @param {number} uploadedCount
 * @param {number} skippedCount
 */
export function buildUploadMessage(uploadedCount, skippedCount) {
  if (skippedCount === 0) return `成功匯入 ${uploadedCount} 張照片`;
  return `成功匯入 ${uploadedCount} 張照片，略過 ${skippedCount} 個不符合規範的檔案`;
}

/**
 * @param {string} raw
 */
function parseLastModifiedList(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => Number(value));
  } catch {
    return [];
  }
}

/**
 * @param {string} filePath
 */
async function safeUnlink(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    if (code !== 'ENOENT') console.error(`無法刪除檔案 ${filePath}`, error);
  }
}

/**
 * @param {() => { originals: string, thumbnails: string }} getUploadPaths
 * @param {ReturnType<import('../models/albumRepository.js').createAlbumRepository>} albums
 * @param {ReturnType<import('../models/photoRepository.js').createPhotoRepository>} photos
 */
export function createPhotoService(getUploadPaths, albums, photos) {
  return {
    /**
     * @param {{ files: UploadFile[], body: Record<string, unknown> }} input
     */
    async upload(input) {
      assertFlatAlbumPayload(input.body);
      const files = input.files ?? [];
      if (files.length === 0) {
        throw new ValidationError('請選擇至少一張照片');
      }
      const albumIdRaw = input.body.albumId;
      const createAlbumTitle = normalizeTitle(input.body.createAlbumTitle);
      const hasAlbumId =
        albumIdRaw !== undefined && albumIdRaw !== null && String(albumIdRaw) !== '';
      const hasCreateTitle = createAlbumTitle.length > 0;
      if (hasAlbumId === hasCreateTitle) {
        throw new ValidationError('請選擇既有相簿，或只輸入一個新相簿名稱');
      }

      const lastModifiedList = parseLastModifiedList(
        typeof input.body.fileLastModified === 'string' ? input.body.fileLastModified : '',
      );
      /** @type {Array<{ filename: string, reason: string }>} */
      const skippedFiles = [];
      /** @type {AcceptedPhoto[]} */
      const accepted = [];
      for (let index = 0; index < files.length; index += 1) {
        const inspected = await inspectPhotoFile(files[index], {
          fileLastModified: lastModifiedList[index] ?? null,
        });
        if (!inspected.ok) {
          skippedFiles.push({ filename: inspected.filename, reason: inspected.reason });
        } else {
          accepted.push(inspected);
        }
      }

      if (accepted.length === 0) {
        return {
          statusCode: 201,
          body: {
            data: {
              album: null,
              uploadedPhotos: [],
              skippedFiles,
            },
            message: buildUploadMessage(0, skippedFiles.length),
          },
        };
      }

      /** @type {number} */
      let albumId = 0;
      if (hasAlbumId) {
        albumId = Number(albumIdRaw);
        if (!Number.isInteger(albumId) || albumId <= 0) {
          throw new ValidationError('請選擇有效的相簿');
        }
        const existing = await albums.findAlbumById(getPool(), albumId);
        if (!existing) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');
      } else {
        assertTitle(createAlbumTitle);
        let albumDate = input.body.createAlbumDate;
        if (albumDate === undefined || albumDate === null || albumDate === '') {
          albumDate = toDateOnlyUtc(earliestTakenAt(accepted.map((file) => file.takenAt)));
        }
        if (!isValidAlbumDate(albumDate)) {
          throw new ValidationError('請輸入有效的相簿日期');
        }
        albumId = await albums.insertAlbum(getPool(), {
          title: createAlbumTitle,
          albumDate,
        });
      }

      const paths = getUploadPaths();
      await mkdir(paths.originals, { recursive: true });
      await mkdir(paths.thumbnails, { recursive: true });
      const existingPhotos = await photos.listByAlbumId(getPool(), albumId);
      let sortOrder =
        existingPhotos.reduce((max, row) => Math.max(max, Number(row.sort_order)), -1) + 1;

      /** @type {string[]} */
      const written = [];
      /** @type {Parameters<typeof photos.insertMany>[1]} */
      const records = [];
      try {
        for (const file of accepted) {
          const id = crypto.randomUUID();
          const storedFilename = `${id}${file.extension}`;
          const thumbnailFilename = `${id}.webp`;
          const originalPath = path.join(paths.originals, storedFilename);
          const thumbPath = path.join(paths.thumbnails, thumbnailFilename);
          await writeFile(originalPath, file.buffer);
          written.push(originalPath);
          await writeFile(thumbPath, file.thumbnail);
          written.push(thumbPath);
          records.push({
            albumId,
            originalFilename: file.filename,
            storedFilename,
            thumbnailFilename,
            mimeType: file.mimeType,
            fileSizeBytes: file.size,
            width: file.width,
            height: file.height,
            takenAt: toMysqlDateTime(file.takenAt),
            sortOrder,
          });
          sortOrder += 1;
        }
        await withTransaction(async (connection) => {
          await photos.insertMany(connection, records);
        });
      } catch (error) {
        await Promise.all(written.map((filePath) => safeUnlink(filePath)));
        throw error;
      }

      const albumRow = await albums.findAlbumById(getPool(), albumId);
      if (!albumRow) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');
      const photoRows = await photos.listByAlbumId(getPool(), albumId);
      const storedNames = new Set(records.map((record) => record.storedFilename));
      const uploadedPhotos = photoRows
        .filter((row) => storedNames.has(row.stored_filename))
        .map(mapPhoto);
      const album = mapAlbum(albumRow, []);
      return {
        statusCode: 201,
        body: {
          data: {
            album: {
              id: album.id,
              title: album.title,
              albumDate: album.albumDate,
              isCollapsed: album.isCollapsed,
            },
            uploadedPhotos,
            skippedFiles,
          },
          message: buildUploadMessage(uploadedPhotos.length, skippedFiles.length),
        },
      };
    },

    /**
     * @param {number} photoId
     */
    async remove(photoId) {
      const row = await photos.findById(getPool(), photoId);
      if (!row) throw new NotFoundError('PHOTO_NOT_FOUND', '找不到指定的照片');
      const paths = getUploadPaths();
      await withTransaction(async (connection) => {
        await photos.deleteById(connection, photoId);
        const remaining = await photos.listByAlbumId(connection, Number(row.album_id));
        await applySortOrder(
          connection,
          Number(row.album_id),
          remaining.map((photo) => Number(photo.id)),
        );
      });
      await safeUnlink(path.join(paths.originals, path.basename(row.stored_filename)));
      await safeUnlink(path.join(paths.thumbnails, path.basename(row.thumbnail_filename)));
      return { deletedPhotoId: photoId, albumId: Number(row.album_id) };
    },

    /**
     * @param {number} albumId
     * @param {unknown} photoIds
     */
    async reorder(albumId, photoIds) {
      if (!Array.isArray(photoIds) || photoIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw new ValidationError('照片清單格式不正確');
      }
      const result = await photos.reorder(
        albumId,
        photoIds.map((id) => Number(id)),
      );
      if ('missingAlbum' in result) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');
      if ('invalidList' in result) throw new ValidationError('照片清單與相簿內容不一致');
      return result;
    },

    /**
     * @param {number} photoId
     * @param {Record<string, unknown>} body
     */
    async move(photoId, body) {
      const targetAlbumId = Number(body.targetAlbumId);
      if (!Number.isInteger(targetAlbumId) || targetAlbumId <= 0) {
        throw new ValidationError('請指定有效的目標相簿');
      }
      /** @type {number | null} */
      let targetIndex = null;
      if (body.targetIndex !== undefined && body.targetIndex !== null && body.targetIndex !== '') {
        targetIndex = Number(body.targetIndex);
        if (!Number.isInteger(targetIndex) || targetIndex < 0) {
          throw new ValidationError('插入位置超出範圍');
        }
      }
      const result = await photos.move({ photoId, targetAlbumId, targetIndex });
      if ('missingPhoto' in result) throw new NotFoundError('PHOTO_NOT_FOUND', '找不到指定的照片');
      if ('missingTarget' in result) throw new NotFoundError('ALBUM_NOT_FOUND', '找不到指定的相簿');
      if ('sameAlbum' in result)
        throw new ValidationError('照片已在目標相簿中，請改用同一相簿的排序功能');
      if ('invalidIndex' in result) throw new ValidationError('插入位置超出範圍');
      return result;
    },
  };
}
