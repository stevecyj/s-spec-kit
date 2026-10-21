// @ts-check
import { Router } from 'express';
import { ValidationError, asyncHandler } from './errorHandler.js';

/**
 * @param {unknown} value
 */
function parsePositiveInt(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * @param {ReturnType<import('../services/albumService.js').createAlbumService>} albumService
 * @param {ReturnType<import('../services/photoService.js').createPhotoService>} photoService
 */
export function createAlbumsRouter(albumService, photoService) {
  const router = Router();

  router.get(
    '/grouped',
    asyncHandler(async (_req, res) => {
      const groups = await albumService.listGrouped();
      res.json({ data: { groups } });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const album = await albumService.create(
        /** @type {Record<string, unknown>} */ (req.body ?? {}),
      );
      res.status(201).json({ data: album, message: '相簿已建立' });
    }),
  );

  router.patch(
    '/:albumId',
    asyncHandler(async (req, res) => {
      const albumId = parsePositiveInt(req.params.albumId);
      if (!albumId) throw new ValidationError('相簿編號不正確');
      const album = await albumService.update(
        albumId,
        /** @type {Record<string, unknown>} */ (req.body ?? {}),
      );
      res.json({ data: album, message: '相簿已更新' });
    }),
  );

  router.delete(
    '/:albumId',
    asyncHandler(async (req, res) => {
      const albumId = parsePositiveInt(req.params.albumId);
      if (!albumId) throw new ValidationError('相簿編號不正確');
      const result = await albumService.remove(albumId);
      res.json({
        data: {
          deletedAlbumId: result.deletedAlbumId,
          deletedPhotoCount: result.deletedPhotoCount,
        },
        message: result.message,
      });
    }),
  );

  router.put(
    '/:albumId/photos/reorder',
    asyncHandler(async (req, res) => {
      const albumId = parsePositiveInt(req.params.albumId);
      if (!albumId) throw new ValidationError('相簿編號不正確');
      const body = /** @type {{ photoIds?: unknown }} */ (req.body ?? {});
      const result = await photoService.reorder(albumId, body.photoIds);
      res.json({
        data: { albumId: result.albumId, photoIds: result.photoIds },
        message: '照片排列順序已儲存',
      });
    }),
  );

  return router;
}
