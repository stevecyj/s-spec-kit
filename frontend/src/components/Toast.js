// @ts-check

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'error', details?: string[] }} [options]
 */
export function showToast(message, options = {}) {
  const region = document.getElementById('toast-region') ?? document.body;
  const toast = document.createElement('div');
  toast.className = options.type === 'error' ? 'toast toast--error' : 'toast';
  toast.dataset.testid = 'toast';
  toast.setAttribute('role', options.type === 'error' ? 'alert' : 'status');
  const text = document.createElement('p');
  text.textContent = message;
  toast.append(text);
  if (options.details && options.details.length > 0) {
    const list = document.createElement('ul');
    for (const detail of options.details) {
      const item = document.createElement('li');
      item.textContent = detail;
      list.append(item);
    }
    toast.append(list);
  }
  region.append(toast);
  window.setTimeout(() => toast.remove(), 6000);
}
