// @ts-check
import './styles/variables.css';
import './styles/layout.css';
import './styles/photo-grid.css';
import { renderAlbumCard } from './components/AlbumCard.js';
import { renderDateGroupSection, renderEmptyLibrary } from './components/DateGroupSection.js';
import { retainDialogFocus } from './components/ConfirmDialog.js';
import { showToast } from './components/Toast.js';
import { openUploadModal } from './components/UploadModal.js';
import { bindDragAndDrop } from './controllers/dragDropController.js';
import {
  createAlbum,
  deleteAlbum,
  deletePhoto,
  fetchGrouped,
  updateAlbum,
  uploadPhotos,
} from './services/apiClient.js';
import { getState, replaceGroups, subscribe } from './state/store.js';

/**
 * @returns {HTMLElement}
 */
function requireGroupsRoot() {
  const root = document.querySelector('#date-groups');
  if (!(root instanceof HTMLElement)) throw new Error('找不到相簿主區域');
  return root;
}

function render() {
  const root = requireGroupsRoot();
  root.setAttribute('aria-busy', 'false');
  const groups = getState().groups;
  root.replaceChildren();
  if (groups.length === 0) {
    root.append(renderEmptyLibrary());
    return;
  }
  for (const group of groups) {
    const cards = group.albums.map((album) =>
      renderAlbumCard(album, {
        onToggleCollapse: (current, collapsed) => {
          void persist(
            () => updateAlbum(current.id, { isCollapsed: collapsed }),
            '無法更新收合狀態',
          );
        },
        onDelete: (current) => {
          void persist(() => deleteAlbum(current.id), '無法刪除相簿');
        },
        onUpdate: (current, fields) => {
          void persist(() => updateAlbum(current.id, fields), '無法更新相簿');
        },
        onAddPhotos: (current) => {
          void importPhotos(current.id);
        },
        onRemovePhoto: (photo) => {
          void persist(() => deletePhoto(photo.id), '無法刪除照片');
        },
      }),
    );
    root.append(renderDateGroupSection(group, cards));
  }
}

async function reload() {
  const payload = await fetchGrouped();
  const groups = /** @type {{ data: { groups: import('./state/store.js').DateGroup[] } }} */ (
    payload
  ).data.groups;
  replaceGroups(groups);
}

/**
 * @param {() => Promise<unknown>} action
 * @param {string} fallback
 */
async function persist(action, fallback) {
  try {
    const result = await action();
    await reload();
    const message = /** @type {{ message?: string }} */ (result).message;
    if (message) showToast(message);
  } catch (error) {
    showToast(error instanceof Error ? error.message : fallback, { type: 'error' });
  }
}

/** @param {number} [presetAlbumId] */
async function importPhotos(presetAlbumId) {
  const albums = getState().groups.flatMap((group) =>
    group.albums.map((album) => ({ id: album.id, title: album.title })),
  );
  const request = await openUploadModal({ albums, presetAlbumId });
  if (!request) return;
  try {
    const result = /** @type {{
      message?: string,
      data?: { skippedFiles?: Array<{ reason: string }> }
    }} */ (await uploadPhotos(request));
    await reload();
    showToast(result.message || '照片已匯入', {
      details: (result.data?.skippedFiles ?? []).map((file) => file.reason),
      type: (result.data?.skippedFiles?.length ?? 0) > 0 ? 'error' : 'success',
    });
  } catch (error) {
    showToast(error instanceof Error ? error.message : '無法匯入照片', { type: 'error' });
  }
}

/** @returns {Promise<{ title: string, albumDate: string } | null>} */
function openCreateAlbumDialog() {
  const root = document.getElementById('dialog-root') ?? document.body;
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  const form = document.createElement('form');
  form.className = 'modal__body';
  const title = document.createElement('h2');
  title.id = 'create-album-title';
  title.textContent = '新增相簿';
  dialog.setAttribute('aria-labelledby', title.id);
  const nameLabel = document.createElement('label');
  nameLabel.textContent = '相簿名稱';
  const nameInput = document.createElement('input');
  nameInput.name = 'title';
  nameInput.required = true;
  nameInput.maxLength = 120;
  nameLabel.append(nameInput);
  const dateLabel = document.createElement('label');
  dateLabel.textContent = '相簿日期';
  const dateInput = document.createElement('input');
  dateInput.name = 'albumDate';
  dateInput.type = 'date';
  dateInput.required = true;
  dateInput.value = new Date().toISOString().slice(0, 10);
  dateLabel.append(dateInput);
  const error = document.createElement('p');
  error.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'modal__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = '建立相簿';
  actions.append(cancel, submit);
  form.append(title, nameLabel, dateLabel, error, actions);
  dialog.append(form);
  root.append(dialog);
  retainDialogFocus(dialog);

  return new Promise((resolve) => {
    let settled = false;
    /** @param {{ title: string, albumDate: string } | null} value */
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const albumTitle = nameInput.value.trim();
      if (!albumTitle) {
        error.hidden = false;
        error.textContent = '請輸入相簿名稱';
        return;
      }
      finish({ title: albumTitle, albumDate: dateInput.value });
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    nameInput.focus();
  });
}

async function boot() {
  const root = requireGroupsRoot();
  bindDragAndDrop(root, {
    onError: (message) => showToast(message, { type: 'error' }),
  });
  subscribe(render);
  document.getElementById('create-album-button')?.addEventListener('click', async () => {
    const draft = await openCreateAlbumDialog();
    if (!draft) return;
    await persist(() => createAlbum(draft), '無法建立相簿');
  });
  document.getElementById('import-photos-button')?.addEventListener('click', () => {
    void importPhotos();
  });
  root.setAttribute('aria-busy', 'true');
  root.textContent = '正在載入相簿…';
  try {
    await reload();
  } catch (error) {
    root.replaceChildren(renderEmptyLibrary());
    showToast(error instanceof Error ? error.message : '無法載入相簿，請稍後再試', {
      type: 'error',
    });
  }
}

void boot();
