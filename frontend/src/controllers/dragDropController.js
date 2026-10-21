// @ts-check
import {
  createSnapshot,
  findAlbum,
  getState,
  replaceGroups,
  restoreSnapshot,
  withMovedPhoto,
  withReorderedPhotos,
} from '../state/store.js';
import { movePhoto, reorderPhotos } from '../services/apiClient.js';

/**
 * 把照片從 fromIndex 移到最終位置 toIndex。
 * @param {number[]} photoIds
 * @param {number} fromIndex
 * @param {number} toIndex
 */
export function reorderPhotoIds(photoIds, fromIndex, toIndex) {
  const next = photoIds.slice();
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return photoIds.slice();
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * @param {number} clientX
 * @param {number} left
 * @param {number} width
 */
export function isPointerOnLeftHalf(clientX, left, width) {
  return clientX < left + width / 2;
}

/**
 * @param {{ cancelled: boolean, dropped: boolean }} outcome
 */
export function shouldRestoreSnapshot(outcome) {
  return outcome.cancelled || !outcome.dropped;
}

/**
 * @param {{
 *   photoId: number,
 *   sourceAlbumId: number,
 *   sourcePhotoIds: number[],
 *   targetAlbumId: number,
 *   targetPhotoIds: number[],
 *   targetCollapsed: boolean,
 *   overPhotoIndex: number | null,
 *   pointerOnLeftHalf: boolean
 * }} input
 * @returns {null | { type: 'reorder', albumId: number, photoIds: number[] } | { type: 'move', photoId: number, sourceAlbumId: number, targetAlbumId: number, targetIndex: number }}
 */
export function planDrop(input) {
  if (input.sourceAlbumId === input.targetAlbumId) {
    const fromIndex = input.sourcePhotoIds.indexOf(input.photoId);
    if (fromIndex < 0) return null;
    let finalIndex;
    if (input.targetCollapsed || input.overPhotoIndex == null) {
      finalIndex = input.sourcePhotoIds.length - 1;
    } else {
      let insertGap = input.pointerOnLeftHalf ? input.overPhotoIndex : input.overPhotoIndex + 1;
      if (fromIndex < insertGap) insertGap -= 1;
      finalIndex = insertGap;
    }
    if (finalIndex === fromIndex) return null;
    return {
      type: 'reorder',
      albumId: input.sourceAlbumId,
      photoIds: reorderPhotoIds(input.sourcePhotoIds, fromIndex, finalIndex),
    };
  }

  const targetIndex =
    input.targetCollapsed || input.overPhotoIndex == null
      ? input.targetPhotoIds.length
      : input.pointerOnLeftHalf
        ? input.overPhotoIndex
        : input.overPhotoIndex + 1;
  return {
    type: 'move',
    photoId: input.photoId,
    sourceAlbumId: input.sourceAlbumId,
    targetAlbumId: input.targetAlbumId,
    targetIndex,
  };
}

/**
 * @typedef {object} DragSession
 * @property {number} photoId
 * @property {number} albumId
 * @property {import('../state/store.js').AppState} snapshot
 * @property {boolean} cancelled
 * @property {boolean} dropped
 * @property {number} raf
 * @property {{ clientX: number, target: Element | null }} pending
 */

/**
 * @param {EventTarget | null | undefined} target
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestHtml(target, selector) {
  if (!(target instanceof Element)) return null;
  const found = target.closest(selector);
  return found instanceof HTMLElement ? found : null;
}

/** @type {DragSession | null} */
let session = null;
/** @type {((message: string) => void) | null} */
let reportError = null;

/**
 * @param {ParentNode} root
 */
function clearIndicators(root) {
  for (const node of root.querySelectorAll(
    '.photo-tile--dragging, .photo-tile--drop-before, .photo-tile--drop-after, .album-card--drop-target',
  )) {
    node.classList.remove(
      'photo-tile--dragging',
      'photo-tile--drop-before',
      'photo-tile--drop-after',
      'album-card--drop-target',
    );
  }
}

/**
 * @param {ParentNode} root
 * @param {{ clientX: number, target: Element | null }} pointer
 * @param {DragSession} active
 */
function paintIndicator(root, pointer, active) {
  clearIndicators(root);
  const tile = root.querySelector(`[data-photo-id="${active.photoId}"]`);
  tile?.classList.add('photo-tile--dragging');
  const card = pointer.target?.closest('.album-card');
  if (!card) return;
  card.classList.add('album-card--drop-target');
  const overTile = pointer.target?.closest('.photo-tile');
  if (!overTile || card.classList.contains('album-card--collapsed')) return;
  const rect = overTile.getBoundingClientRect();
  const onLeft = isPointerOnLeftHalf(pointer.clientX, rect.left, rect.width);
  overTile.classList.add(onLeft ? 'photo-tile--drop-before' : 'photo-tile--drop-after');
}

/**
 * @param {DragEvent | PointerEvent} event
 * @param {DragSession} active
 */
function buildPlan(event, active) {
  const card = closestHtml(event.target, '.album-card');
  if (!card?.dataset.albumId) return null;
  const targetAlbumId = Number(card.dataset.albumId);
  const targetAlbum = findAlbum(getState().groups, targetAlbumId);
  const sourceAlbum = findAlbum(getState().groups, active.albumId);
  if (!targetAlbum || !sourceAlbum) return null;
  const overTile = closestHtml(event.target, '.photo-tile');
  const tiles = [...card.querySelectorAll('.photo-tile')];
  const overPhotoIndex = overTile ? tiles.indexOf(overTile) : null;
  const rect = overTile?.getBoundingClientRect();
  const clientX = 'clientX' in event ? event.clientX : 0;
  return planDrop({
    photoId: active.photoId,
    sourceAlbumId: active.albumId,
    sourcePhotoIds: sourceAlbum.photos.map((photo) => photo.id),
    targetAlbumId,
    targetPhotoIds: targetAlbum.photos.map((photo) => photo.id),
    targetCollapsed: targetAlbum.isCollapsed || card.classList.contains('album-card--collapsed'),
    overPhotoIndex: overPhotoIndex == null || overPhotoIndex < 0 ? null : overPhotoIndex,
    pointerOnLeftHalf: rect ? isPointerOnLeftHalf(clientX, rect.left, rect.width) : true,
  });
}

/**
 * @param {{ type: 'reorder', albumId: number, photoIds: number[] } | { type: 'move', photoId: number, sourceAlbumId: number, targetAlbumId: number, targetIndex: number } | null} plan
 * @param {import('../state/store.js').AppState} snapshot
 */
function commitPlan(plan, snapshot) {
  if (!plan) return;
  if (plan.type === 'reorder') {
    replaceGroups(withReorderedPhotos(getState().groups, plan.albumId, plan.photoIds));
    reorderPhotos(plan.albumId, plan.photoIds).catch(() => {
      restoreSnapshot(snapshot);
      reportError?.('無法儲存照片順序，已還原剛才的排列');
    });
    return;
  }
  replaceGroups(
    withMovedPhoto(getState().groups, {
      photoId: plan.photoId,
      sourceAlbumId: plan.sourceAlbumId,
      targetAlbumId: plan.targetAlbumId,
      targetIndex: plan.targetIndex,
    }),
  );
  movePhoto(plan.photoId, {
    targetAlbumId: plan.targetAlbumId,
    targetIndex: plan.targetIndex,
  }).catch(() => {
    restoreSnapshot(snapshot);
    reportError?.('無法移動照片，已還原到原來的相簿');
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ onError: (message: string) => void }} hooks
 */
export function bindDragAndDrop(root, hooks) {
  reportError = hooks.onError;

  root.addEventListener('dragstart', (event) => {
    if (closestHtml(event.target, '[data-no-drag]')) {
      event.preventDefault();
      return;
    }
    const tile = closestHtml(event.target, '.photo-tile');
    if (!tile?.dataset.photoId || !tile.dataset.albumId) return;
    session = {
      photoId: Number(tile.dataset.photoId),
      albumId: Number(tile.dataset.albumId),
      snapshot: createSnapshot(),
      cancelled: false,
      dropped: false,
      raf: 0,
      pending: { clientX: event.clientX, target: tile },
    };
    tile.setAttribute('aria-grabbed', 'true');
    event.dataTransfer?.setData('text/plain', tile.dataset.photoId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });

  root.addEventListener('dragover', (event) => {
    if (!session || session.cancelled) return;
    if (!closestHtml(event.target, '.album-card')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    session.pending = { clientX: event.clientX, target: closestHtml(event.target, '*') };
    if (session.raf) return;
    const active = session;
    active.raf = requestAnimationFrame(() => {
      if (!session) return;
      session.raf = 0;
      paintIndicator(root, active.pending, active);
    });
  });

  root.addEventListener('drop', (event) => {
    if (!session || session.cancelled) return;
    event.preventDefault();
    const plan = buildPlan(event, session);
    session.dropped = Boolean(plan);
    commitPlan(plan, session.snapshot);
  });

  root.addEventListener('dragend', () => {
    const active = session;
    clearIndicators(root);
    if (active && shouldRestoreSnapshot(active)) {
      restoreSnapshot(active.snapshot);
    }
    session = null;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && session) {
      session.cancelled = true;
      clearIndicators(root);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const tile = closestHtml(event.target, '.photo-tile');
    if (!tile?.dataset.albumId || !tile.dataset.photoId) return;
    const album = findAlbum(getState().groups, Number(tile.dataset.albumId));
    if (!album) return;
    const ids = album.photos.map((photo) => photo.id);
    const fromIndex = ids.indexOf(Number(tile.dataset.photoId));
    const toIndex = event.key === 'ArrowLeft' ? fromIndex - 1 : fromIndex + 1;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length) return;
    event.preventDefault();
    const snapshot = createSnapshot();
    commitPlan(
      {
        type: /** @type {'reorder'} */ ('reorder'),
        albumId: album.id,
        photoIds: reorderPhotoIds(ids, fromIndex, toIndex),
      },
      snapshot,
    );
  });

  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    if (closestHtml(event.target, '[data-no-drag]')) return;
    const tile = closestHtml(event.target, '.photo-tile');
    if (!tile?.dataset.photoId || !tile.dataset.albumId) return;
    tile.setPointerCapture(event.pointerId);
    session = {
      photoId: Number(tile.dataset.photoId),
      albumId: Number(tile.dataset.albumId),
      snapshot: createSnapshot(),
      cancelled: false,
      dropped: false,
      raf: 0,
      pending: { clientX: event.clientX, target: tile },
    };
  });

  root.addEventListener('pointermove', (event) => {
    if (!session || event.pointerType === 'mouse') return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    session.pending = { clientX: event.clientX, target: hit };
    if (session.raf) return;
    const active = session;
    active.raf = requestAnimationFrame(() => {
      if (!session) return;
      session.raf = 0;
      paintIndicator(root, active.pending, active);
    });
  });

  root.addEventListener('pointerup', (event) => {
    if (!session || event.pointerType === 'mouse') return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const synthetic = new PointerEvent('pointerup', {
      clientX: event.clientX,
      clientY: event.clientY,
    });
    Object.defineProperty(synthetic, 'target', { value: hit });
    const plan = buildPlan(synthetic, session);
    session.dropped = Boolean(plan);
    commitPlan(plan, session.snapshot);
    clearIndicators(root);
    if (shouldRestoreSnapshot(session)) restoreSnapshot(session.snapshot);
    session = null;
  });
}
