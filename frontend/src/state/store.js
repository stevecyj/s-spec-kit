// @ts-check

/**
 * @typedef {object} Photo
 * @property {number} id
 * @property {number} albumId
 * @property {string} originalFilename
 * @property {string} thumbnailUrl
 * @property {string} originalUrl
 * @property {string} mimeType
 * @property {number} fileSizeBytes
 * @property {number | null} width
 * @property {number | null} height
 * @property {string} takenAt
 * @property {number} sortOrder
 */

/**
 * @typedef {object} Album
 * @property {number} id
 * @property {string} title
 * @property {string} albumDate
 * @property {boolean} isCollapsed
 * @property {number} photoCount
 * @property {Photo[]} photos
 */

/**
 * @typedef {object} DateGroup
 * @property {string} yearMonth
 * @property {string} label
 * @property {Album[]} albums
 */

/**
 * @typedef {object} AppState
 * @property {DateGroup[]} groups
 */

/** @type {AppState} */
let state = { groups: [] };

/** @type {Set<(state: AppState) => void>} */
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener(state);
}

/** @returns {AppState} */
export function getState() {
  return state;
}

/** @param {(state: AppState) => void} listener */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {DateGroup[]} groups */
export function replaceGroups(groups) {
  state = { groups };
  emit();
}

export function createSnapshot() {
  return structuredClone(state);
}

/** @param {AppState} snapshot */
export function restoreSnapshot(snapshot) {
  state = structuredClone(snapshot);
  emit();
}

export function resetStore() {
  state = { groups: [] };
  emit();
}

/**
 * @param {DateGroup[]} groups
 * @param {number} albumId
 */
export function findAlbum(groups, albumId) {
  for (const group of groups) {
    const album = group.albums.find((item) => item.id === albumId);
    if (album) return album;
  }
  return null;
}

/**
 * @param {DateGroup[]} groups
 * @param {number} albumId
 * @param {(album: Album) => Album} mapper
 * @returns {DateGroup[]}
 */
export function mapAlbum(groups, albumId, mapper) {
  return groups.map((group) => ({
    ...group,
    albums: group.albums.map((album) => (album.id === albumId ? mapper(album) : album)),
  }));
}

/**
 * @param {DateGroup[]} groups
 * @param {number} albumId
 * @param {number[]} photoIds
 */
export function withReorderedPhotos(groups, albumId, photoIds) {
  return mapAlbum(groups, albumId, (album) => {
    const byId = new Map(album.photos.map((photo) => [photo.id, photo]));
    const photos = photoIds.map((id, index) => {
      const photo = byId.get(id);
      if (!photo) throw new Error('找不到要排序的照片');
      return { ...photo, sortOrder: index };
    });
    return { ...album, photos, photoCount: photos.length };
  });
}

/**
 * @param {DateGroup[]} groups
 * @param {{ photoId: number, sourceAlbumId: number, targetAlbumId: number, targetIndex: number }} move
 */
export function withMovedPhoto(groups, move) {
  /** @type {Photo | null} */
  let moving = null;
  const stripped = mapAlbum(groups, move.sourceAlbumId, (album) => {
    moving = album.photos.find((photo) => photo.id === move.photoId) ?? moving;
    const photos = album.photos
      .filter((photo) => photo.id !== move.photoId)
      .map((photo, index) => ({ ...photo, sortOrder: index }));
    return { ...album, photos, photoCount: photos.length };
  });
  if (!moving) return groups;
  const movedPhoto = /** @type {Photo} */ (moving);
  return mapAlbum(stripped, move.targetAlbumId, (album) => {
    const photos = album.photos.slice();
    const index = Math.max(0, Math.min(move.targetIndex, photos.length));
    photos.splice(index, 0, { ...movedPhoto, albumId: move.targetAlbumId });
    return {
      ...album,
      photos: photos.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
      photoCount: photos.length,
    };
  });
}
