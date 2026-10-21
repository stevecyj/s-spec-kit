// @ts-check

/**
 * @param {HTMLElement} dialog
 */
export function retainDialogFocus(dialog) {
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button, input, select, textarea, a[href]')];
    if (focusable.length === 0) return;
    const first = /** @type {HTMLElement} */ (focusable[0]);
    const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

/**
 * @param {{ message: string, title?: string, confirmLabel?: string, cancelLabel?: string }} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog(options) {
  const root = document.getElementById('dialog-root') ?? document.body;
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  const body = document.createElement('div');
  body.className = 'modal__body';
  const title = document.createElement('h2');
  title.id = 'confirm-dialog-title';
  title.textContent = options.title ?? '請確認';
  const message = document.createElement('p');
  message.textContent = options.message;
  const actions = document.createElement('div');
  actions.className = 'modal__actions';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = options.cancelLabel ?? '取消';
  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'button-danger';
  confirmButton.textContent = options.confirmLabel ?? '確定刪除';
  actions.append(cancelButton, confirmButton);
  body.append(title, message, actions);
  dialog.append(body);
  dialog.setAttribute('aria-labelledby', title.id);
  root.append(dialog);
  retainDialogFocus(dialog);

  return new Promise((resolve) => {
    let settled = false;
    /** @param {boolean} value */
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancelButton.addEventListener('click', () => finish(false));
    confirmButton.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    confirmButton.focus();
  });
}
