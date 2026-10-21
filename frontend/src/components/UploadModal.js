// @ts-check
import { retainDialogFocus } from './ConfirmDialog.js';

/**
 * @typedef {object} UploadAlbumOption
 * @property {number} id
 * @property {string} title
 */

/**
 * @typedef {object} UploadRequest
 * @property {File[]} files
 * @property {number} [albumId]
 * @property {string} [createAlbumTitle]
 * @property {string} [createAlbumDate]
 */

/**
 * @param {number} timestamp
 */
function formatLocalDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @param {FileList | File[]} files
 */
export function earliestFileDate(files) {
  const stamps = [...files].map((file) => file.lastModified).filter((value) => value > 0);
  if (stamps.length === 0) return formatLocalDate(Date.now());
  return formatLocalDate(Math.min(...stamps));
}

/**
 * @param {{ albums: UploadAlbumOption[], presetAlbumId?: number }} options
 * @returns {Promise<UploadRequest | null>}
 */
export function openUploadModal(options) {
  const root = document.getElementById('dialog-root') ?? document.body;
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  const body = document.createElement('form');
  body.className = 'modal__body';
  const title = document.createElement('h2');
  title.id = 'upload-dialog-title';
  title.textContent = '匯入照片';
  dialog.setAttribute('aria-labelledby', title.id);

  const fileLabel = document.createElement('label');
  fileLabel.textContent = '照片檔案';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.name = 'photos';
  fileInput.required = true;
  fileInput.multiple = true;
  fileInput.accept =
    'image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif';
  fileLabel.append(fileInput);

  const modeRow = document.createElement('div');
  modeRow.className = 'choice-row';
  const existingLabel = document.createElement('label');
  const existingRadio = document.createElement('input');
  existingRadio.type = 'radio';
  existingRadio.name = 'mode';
  existingRadio.value = 'existing';
  existingRadio.checked = options.albums.length > 0;
  existingLabel.append(existingRadio, document.createTextNode('歸入既有相簿'));
  const createLabel = document.createElement('label');
  const createRadio = document.createElement('input');
  createRadio.type = 'radio';
  createRadio.name = 'mode';
  createRadio.value = 'create';
  createRadio.checked = options.albums.length === 0;
  createLabel.append(createRadio, document.createTextNode('建立新相簿'));
  modeRow.append(existingLabel, createLabel);

  const albumLabel = document.createElement('label');
  albumLabel.textContent = '選擇相簿';
  const albumSelect = document.createElement('select');
  albumSelect.name = 'albumId';
  for (const album of options.albums) {
    const option = document.createElement('option');
    option.value = String(album.id);
    option.textContent = album.title;
    if (album.id === options.presetAlbumId) option.selected = true;
    albumSelect.append(option);
  }
  albumLabel.append(albumSelect);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = '新相簿名稱';
  const nameInput = document.createElement('input');
  nameInput.name = 'createAlbumTitle';
  nameInput.maxLength = 120;
  nameLabel.append(nameInput);

  const dateLabel = document.createElement('label');
  dateLabel.textContent = '相簿日期';
  const dateInput = document.createElement('input');
  dateInput.name = 'createAlbumDate';
  dateInput.type = 'date';
  dateInput.value = earliestFileDate([]);
  dateLabel.append(dateInput);

  const error = document.createElement('p');
  error.dataset.testid = 'upload-error';
  error.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'modal__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = '開始匯入';
  actions.append(cancel, submit);
  body.append(title, fileLabel, modeRow, albumLabel, nameLabel, dateLabel, error, actions);
  dialog.append(body);
  root.append(dialog);
  retainDialogFocus(dialog);

  const syncMode = () => {
    const creating = createRadio.checked;
    albumLabel.hidden = creating || options.albums.length === 0;
    nameLabel.hidden = !creating;
    dateLabel.hidden = !creating;
  };
  existingRadio.addEventListener('change', syncMode);
  createRadio.addEventListener('change', syncMode);
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      dateInput.value = earliestFileDate(fileInput.files);
    }
  });
  syncMode();

  return new Promise((resolve) => {
    let settled = false;
    /** @param {UploadRequest | null} value */
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
    body.addEventListener('submit', (event) => {
      event.preventDefault();
      const files = [...(fileInput.files ?? [])];
      if (files.length === 0) {
        error.hidden = false;
        error.textContent = '請選擇至少一張照片';
        return;
      }
      if (createRadio.checked) {
        const createAlbumTitle = nameInput.value.trim();
        if (!createAlbumTitle) {
          error.hidden = false;
          error.textContent = '請輸入相簿名稱';
          return;
        }
        finish({
          files,
          createAlbumTitle,
          createAlbumDate: dateInput.value || undefined,
        });
        return;
      }
      if (!albumSelect.value) {
        error.hidden = false;
        error.textContent = '請先建立或選擇一個相簿';
        return;
      }
      finish({ files, albumId: Number(albumSelect.value) });
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    fileInput.focus();
  });
}
