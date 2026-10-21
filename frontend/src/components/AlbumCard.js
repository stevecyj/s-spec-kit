// @ts-check
import { confirmDialog } from './ConfirmDialog.js';
import { renderPhotoTile } from './PhotoTile.js';

/**
 * @typedef {import('../state/store.js').Album} Album
 * @typedef {import('../state/store.js').Photo} Photo
 * @typedef {object} AlbumHandlers
 * @property {(album: Album, collapsed: boolean) => void} onToggleCollapse
 * @property {(album: Album) => void} onDelete
 * @property {(album: Album, fields: { title: string, albumDate: string }) => void} onUpdate
 * @property {(album: Album) => void} onAddPhotos
 * @property {(photo: Photo) => void} onRemovePhoto
 */

/**
 * @param {string} isoDate
 */
function formatAlbumDate(isoDate) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!matched) return isoDate;
  return `${matched[1]} 年 ${Number(matched[2])} 月 ${Number(matched[3])} 日`;
}

/**
 * @param {Album} album
 * @param {AlbumHandlers} handlers
 */
export function renderAlbumCard(album, handlers) {
  const card = document.createElement('article');
  card.className = album.isCollapsed ? 'album-card album-card--collapsed' : 'album-card';
  card.dataset.testid = 'album-card';
  card.dataset.albumId = String(album.id);
  card.dataset.albumTitle = album.title;

  const header = document.createElement('div');
  header.className = 'album-card__header';
  header.dataset.testid = 'album-header';

  const headingWrap = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'album-card__title';
  title.textContent = album.title;
  const meta = document.createElement('p');
  meta.className = 'album-card__meta';
  meta.textContent = `${formatAlbumDate(album.albumDate)} · 共 ${album.photoCount} 張照片`;
  headingWrap.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'album-card__actions';
  const collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.dataset.testid = 'collapse-toggle';
  collapse.setAttribute('aria-expanded', album.isCollapsed ? 'false' : 'true');
  collapse.textContent = album.isCollapsed ? '展開' : '收合';
  collapse.setAttribute('aria-label', `${album.isCollapsed ? '展開' : '收合'}相簿 ${album.title}`);
  collapse.addEventListener('click', () => handlers.onToggleCollapse(album, !album.isCollapsed));

  const add = document.createElement('button');
  add.type = 'button';
  add.dataset.testid = 'add-photos';
  add.textContent = '新增照片';
  add.addEventListener('click', () => handlers.onAddPhotos(album));

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = '編輯';
  edit.setAttribute('aria-label', `編輯相簿 ${album.title}`);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button-danger';
  remove.textContent = '刪除相簿';
  remove.setAttribute('aria-label', `刪除相簿 ${album.title}`);
  remove.addEventListener('click', async () => {
    if (album.photoCount > 0) {
      const confirmed = await confirmDialog({
        message: `此相簿包含 ${album.photoCount} 張照片，刪除後照片將一併移除且無法復原，確定要刪除嗎？`,
      });
      if (!confirmed) return;
    }
    handlers.onDelete(album);
  });
  actions.append(collapse, add, edit, remove);
  header.append(headingWrap, actions);

  const body = document.createElement('div');
  body.className = 'album-card__body';

  const form = document.createElement('form');
  form.className = 'inline-form';
  form.dataset.testid = 'edit-album-form';
  form.hidden = true;
  const titleLabel = document.createElement('label');
  titleLabel.textContent = '相簿名稱';
  const titleInput = document.createElement('input');
  titleInput.name = 'title';
  titleInput.required = true;
  titleInput.maxLength = 120;
  titleInput.value = album.title;
  titleLabel.append(titleInput);
  const dateLabel = document.createElement('label');
  dateLabel.textContent = '相簿日期';
  const dateInput = document.createElement('input');
  dateInput.name = 'albumDate';
  dateInput.type = 'date';
  dateInput.required = true;
  dateInput.value = album.albumDate.slice(0, 10);
  dateLabel.append(dateInput);
  const formActions = document.createElement('div');
  formActions.className = 'inline-form__actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = '儲存';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => {
    form.hidden = true;
  });
  formActions.append(save, cancel);
  form.append(titleLabel, dateLabel, formActions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.onUpdate(album, { title: titleInput.value, albumDate: dateInput.value });
  });
  edit.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) titleInput.focus();
  });

  const grid = document.createElement('div');
  grid.className = 'photo-grid';
  grid.dataset.testid = 'photo-grid';
  grid.hidden = album.photos.length === 0 || album.isCollapsed;
  for (const photo of album.photos) {
    grid.append(renderPhotoTile(photo, { onRemove: handlers.onRemovePhoto }));
  }

  const empty = document.createElement('div');
  empty.className = 'empty-album';
  empty.dataset.testid = 'empty-album';
  empty.hidden = album.photos.length > 0 || album.isCollapsed;
  const emptyText = document.createElement('p');
  emptyText.textContent = '此相簿還沒有照片。';
  const emptyAdd = document.createElement('button');
  emptyAdd.type = 'button';
  emptyAdd.textContent = '新增照片';
  emptyAdd.addEventListener('click', () => handlers.onAddPhotos(album));
  empty.append(emptyText, emptyAdd);

  body.append(form, empty, grid);
  card.append(header, body);
  return card;
}
