// @ts-check
import { Router } from 'express';
import multer from 'multer';
import { ValidationError, asyncHandler } from './errorHandler.js';

const MAX_FILES = 30;
const MULTER_FILE_LIMIT = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_FILES, fileSize: MULTER_FILE_LIMIT },
});

/**
 * @param {unknown} value
 */
function parsePositiveInt(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * @param {ReturnType<import('../services/photoService.js').createPhotoService>} photoService
 */
export function createPhotosRouter(photoService) {
  const router = Router();

  router.post(
    '/upload',
    upload.array('photos', MAX_FILES),
    asyncHandler(async (req, res) => {
      const files = /** @type {import('../services/photoService.js').UploadFile[]} */ (
        req.files ?? []
      );
      const result = await photoService.upload({
        files,
        body: /** @type {Record<string, unknown>} */ (req.body ?? {}),
      });
      res.status(result.statusCode).json(result.body);
    }),
  );

  router.patch(
    '/:photoId/move',
    asyncHandler(async (req, res) => {
      const photoId = parsePositiveInt(req.params.photoId);
      if (!photoId) throw new ValidationError('照片編號不正確');
      const result = await photoService.move(
        photoId,
        /** @type {Record<string, unknown>} */ (req.body ?? {}),
      );
      res.json({ data: result, message: '照片已移動至目標相簿' });
    }),
  );

  router.delete(
    '/:photoId',
    asyncHandler(async (req, res) => {
      const photoId = parsePositiveInt(req.params.photoId);
      if (!photoId) throw new ValidationError('照片編號不正確');
      const result = await photoService.remove(photoId);
      res.json({ data: result, message: '照片已刪除' });
    }),
  );

  return router;
}
