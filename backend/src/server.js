// @ts-check
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAlbumRepository } from './models/albumRepository.js';
import { createPhotoRepository } from './models/photoRepository.js';
import { createAlbumService } from './services/albumService.js';
import { createPhotoService } from './services/photoService.js';
import { createAlbumsRouter } from './api/albumsRouter.js';
import { createPhotosRouter } from './api/photosRouter.js';
import { errorHandler } from './api/errorHandler.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveUploadPaths() {
  const configured = process.env.UPLOAD_DIR || './uploads';
  const root = path.resolve(backendRoot, configured);
  return {
    root,
    originals: path.join(root, 'originals'),
    thumbnails: path.join(root, 'thumbnails'),
  };
}

export async function createApp() {
  const paths = resolveUploadPaths();
  await mkdir(paths.originals, { recursive: true });
  await mkdir(paths.thumbnails, { recursive: true });

  const albums = createAlbumRepository();
  const photos = createPhotoRepository();
  const albumService = createAlbumService(resolveUploadPaths, albums, photos);
  const photoService = createPhotoService(resolveUploadPaths, albums, photos);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/uploads/thumbnails',
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      next();
    },
    express.static(paths.thumbnails, { index: false, dotfiles: 'deny' }),
  );
  app.use(
    '/uploads/originals',
    express.static(paths.originals, { index: false, dotfiles: 'deny' }),
  );

  app.use('/api/albums', createAlbumsRouter(albumService, photoService));
  app.use('/api/photos', createPhotosRouter(photoService));
  app.use(errorHandler);
  return app;
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const app = await createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`照片相簿服務已啟動於 http://localhost:${port}`);
  });
}
