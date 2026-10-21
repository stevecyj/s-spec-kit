// @ts-check

/** @typedef {import('../state/store.js').Photo} Photo */

/**
 * @param {Photo} photo
 */
function openLightbox(photo) {
  const root = document.getElementById('dialog-root') ?? document.body;
  const dialog = document.createElement('dialog');
  dialog.className = 'modal lightbox';
  const body = document.createElement('div');
  body.className = 'modal__body';
  const title = document.createElement('h2');
  title.textContent = photo.originalFilename;
  const image = document.createElement('img');
  image.src = photo.originalUrl;
  image.alt = photo.originalFilename;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '關閉';
  close.addEventListener('click', () => {
    dialog.close();
    dialog.remove();
  });
  dialog.addEventListener('cancel', () => dialog.remove());
  body.append(title, image, close);
  dialog.append(body);
  root.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/**
 * @param {Photo} photo
 * @param {{ onRemove: (photo: Photo) => void }} handlers
 */
export function renderPhotoTile(photo, handlers) {
  const tile = document.createElement('article');
  tile.className = 'photo-tile';
  tile.draggable = true;
  tile.dataset.testid = 'photo-tile';
  tile.dataset.photoId = String(photo.id);
  tile.dataset.albumId = String(photo.albumId);
  tile.tabIndex = 0;
  tile.setAttribute('aria-grabbed', 'false');
  tile.setAttribute('aria-label', `照片 ${photo.originalFilename}，可用左右方向鍵調整順序`);

  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'photo-tile__frame';
  preview.setAttribute('aria-label', `檢視照片 ${photo.originalFilename}`);
  const image = document.createElement('img');
  image.src = photo.thumbnailUrl;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.width = 400;
  image.height = 400;
  preview.append(image);
  preview.addEventListener('click', () => openLightbox(photo));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'photo-tile__remove';
  remove.dataset.noDrag = 'true';
  remove.dataset.testid = 'remove-photo';
  remove.setAttribute('aria-label', `移除照片 ${photo.originalFilename}`);
  remove.textContent = '移除';
  remove.addEventListener('click', () => handlers.onRemove(photo));

  tile.append(preview, remove);
  return tile;
}
