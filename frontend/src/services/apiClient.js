// @ts-check

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorBody = /** @type {{ error?: { message?: string, code?: string } }} */ (payload)
      .error;
    throw new ApiError(errorBody?.message || '操作失敗，請稍後再試', errorBody?.code);
  }
  return payload;
}

export function fetchGrouped() {
  return request('/api/albums/grouped');
}

/** @param {{ title: string, albumDate: string }} body */
export function createAlbum(body) {
  return request('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * @param {number} albumId
 * @param {{ title?: string, albumDate?: string, isCollapsed?: boolean }} body
 */
export function updateAlbum(albumId, body) {
  return request(`/api/albums/${albumId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** @param {number} albumId */
export function deleteAlbum(albumId) {
  return request(`/api/albums/${albumId}`, { method: 'DELETE' });
}

/**
 * @param {{
 *   files: File[],
 *   albumId?: number,
 *   createAlbumTitle?: string,
 *   createAlbumDate?: string
 * }} input
 */
export function uploadPhotos(input) {
  const form = new FormData();
  const timestamps = input.files.map((file) => file.lastModified);
  for (const file of input.files) form.append('photos', file);
  form.append('fileLastModified', JSON.stringify(timestamps));
  if (input.albumId) form.append('albumId', String(input.albumId));
  if (input.createAlbumTitle) form.append('createAlbumTitle', input.createAlbumTitle);
  if (input.createAlbumDate) form.append('createAlbumDate', input.createAlbumDate);
  return request('/api/photos/upload', { method: 'POST', body: form });
}

/** @param {number} photoId */
export function deletePhoto(photoId) {
  return request(`/api/photos/${photoId}`, { method: 'DELETE' });
}

/**
 * @param {number} albumId
 * @param {number[]} photoIds
 */
export function reorderPhotos(albumId, photoIds) {
  return request(`/api/albums/${albumId}/photos/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoIds }),
  });
}

/**
 * @param {number} photoId
 * @param {{ targetAlbumId: number, targetIndex?: number }} body
 */
export function movePhoto(photoId, body) {
  return request(`/api/photos/${photoId}/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
