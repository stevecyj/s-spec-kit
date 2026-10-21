import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_SIZE_BYTES,
  classifyUploadFile,
  earliestTakenAt,
  inspectPhotoFile,
  readExifDateTimeOriginal,
  resolveTakenAt,
  toDateOnlyUtc,
} from '../../src/services/photoService.js';

const accepted = [
  ['photo.jpg', 'image/jpeg'],
  ['photo.jpeg', 'image/jpeg'],
  ['photo.png', 'image/png'],
  ['photo.webp', 'image/webp'],
  ['photo.gif', 'image/gif'],
  ['photo.avif', 'image/avif'],
];

/**
 * @param {string} dateText
 */
function buildExifDateJpeg(dateText) {
  const ascii = Buffer.from(`${dateText}\0`, 'ascii');
  const tiff = Buffer.alloc(44 + ascii.length);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(0x2a, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28);
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(ascii.length, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.writeUInt32LE(0, 40);
  ascii.copy(tiff, 44);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const app1 = Buffer.alloc(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])]);
}

describe('照片上傳驗證與日期解析', () => {
  it('只接受指定的 MIME 與副檔名', () => {
    for (const [filename, mimeType] of accepted) {
      expect(classifyUploadFile({ originalFilename: filename, mimeType, size: 128 }).ok).toBe(true);
    }
    const rejected = classifyUploadFile({
      originalFilename: 'example.bmp',
      mimeType: 'image/bmp',
      size: 128,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toBe(
        '檔案「example.bmp」格式不支援，僅支援 JPEG、PNG、WebP、GIF、AVIF 格式',
      );
    }
    expect(
      classifyUploadFile({ originalFilename: 'photo.jpg', mimeType: 'image/png', size: 128 }).ok,
    ).toBe(false);
  });

  it('檔案大小必須大於 0 且不超過 20 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(20 * 1024 * 1024);
    expect(
      classifyUploadFile({ originalFilename: 'a.jpg', mimeType: 'image/jpeg', size: 0 }).ok,
    ).toBe(false);
    expect(
      classifyUploadFile({ originalFilename: 'a.jpg', mimeType: 'image/jpeg', size: 1 }).ok,
    ).toBe(true);
    expect(
      classifyUploadFile({
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        size: MAX_FILE_SIZE_BYTES,
      }).ok,
    ).toBe(true);
    const oversized = classifyUploadFile({
      originalFilename: 'huge.png',
      mimeType: 'image/png',
      size: MAX_FILE_SIZE_BYTES + 1,
    });
    if (!oversized.ok) {
      expect(oversized.reason).toBe('檔案「huge.png」大小超過 20 MB 上限，已略過匯入');
    }
  });

  it('攔截損毀檔頭，並優先採用 EXIF DateTimeOriginal', async () => {
    const corrupt = await inspectPhotoFile({
      originalname: 'broken.jpg',
      mimetype: 'image/jpeg',
      size: 12,
      buffer: Buffer.from('not-a-jpeg'),
    });
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.reason).toContain('已損毀');

    const exifBuffer = buildExifDateJpeg('2026:10:18 09:30:00');
    const exifDate = readExifDateTimeOriginal(exifBuffer);
    expect(exifDate?.toISOString()).toBe('2026-10-18T09:30:00.000Z');

    const jpeg = await sharp({
      create: { width: 8, height: 6, channels: 3, background: { r: 20, g: 80, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const withExif = Buffer.concat([
      jpeg.subarray(0, 2),
      exifBuffer.subarray(2, exifBuffer.length - 2),
      jpeg.subarray(2),
    ]);
    const inspected = await inspectPhotoFile(
      {
        originalname: 'sunrise.jpg',
        mimetype: 'image/jpeg',
        size: withExif.length,
        buffer: withExif,
      },
      { fileLastModified: Date.parse('2020-01-01T00:00:00.000Z') },
    );
    expect(inspected.ok).toBe(true);
    if (inspected.ok) {
      expect(inspected.takenAt.toISOString()).toBe('2026-10-18T09:30:00.000Z');
      expect(inspected.width).toBe(8);
      expect(inspected.thumbnail.length).toBeGreaterThan(10);
    }
  });

  it('沒有 EXIF 時改用 fileLastModified，再不行才用當下時間', () => {
    const modified = Date.parse('2024-05-02T03:04:05.000Z');
    expect(resolveTakenAt({ exifDate: null, fileLastModified: modified }).toISOString()).toBe(
      '2024-05-02T03:04:05.000Z',
    );
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(resolveTakenAt({ exifDate: null, fileLastModified: null, now })).toBe(now);
    const earliest = earliestTakenAt([
      new Date('2026-10-18T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z'),
    ]);
    expect(toDateOnlyUtc(earliest)).toBe('2026-08-01');
  });
});
