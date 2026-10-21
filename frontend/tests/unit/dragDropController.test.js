import { beforeEach, describe, expect, it } from 'vitest';
import {
  isPointerOnLeftHalf,
  planDrop,
  reorderPhotoIds,
  shouldRestoreSnapshot,
} from '../../src/controllers/dragDropController.js';
import {
  createSnapshot,
  replaceGroups,
  resetStore,
  restoreSnapshot,
  withMovedPhoto,
  withReorderedPhotos,
} from '../../src/state/store.js';

const sourcePhotos = [
  {
    id: 10,
    albumId: 1,
    originalFilename: 'a.jpg',
    thumbnailUrl: '/a',
    originalUrl: '/a',
    mimeType: 'image/jpeg',
    fileSizeBytes: 1,
    width: 1,
    height: 1,
    takenAt: '2026-10-01T00:00:00.000Z',
    sortOrder: 0,
  },
  {
    id: 11,
    albumId: 1,
    originalFilename: 'b.jpg',
    thumbnailUrl: '/b',
    originalUrl: '/b',
    mimeType: 'image/jpeg',
    fileSizeBytes: 1,
    width: 1,
    height: 1,
    takenAt: '2026-10-01T00:00:00.000Z',
    sortOrder: 1,
  },
  {
    id: 12,
    albumId: 1,
    originalFilename: 'c.jpg',
    thumbnailUrl: '/c',
    originalUrl: '/c',
    mimeType: 'image/jpeg',
    fileSizeBytes: 1,
    width: 1,
    height: 1,
    takenAt: '2026-10-01T00:00:00.000Z',
    sortOrder: 2,
  },
  {
    id: 13,
    albumId: 1,
    originalFilename: 'd.jpg',
    thumbnailUrl: '/d',
    originalUrl: '/d',
    mimeType: 'image/jpeg',
    fileSizeBytes: 1,
    width: 1,
    height: 1,
    takenAt: '2026-10-01T00:00:00.000Z',
    sortOrder: 3,
  },
];

describe('拖放順序計算', () => {
  beforeEach(() => {
    resetStore();
  });

  it('計算同相簿插入後的最終順序', () => {
    expect(reorderPhotoIds([10, 11, 12, 13], 0, 2)).toEqual([11, 12, 10, 13]);
    const plan = planDrop({
      photoId: 10,
      sourceAlbumId: 1,
      sourcePhotoIds: [10, 11, 12, 13],
      targetAlbumId: 1,
      targetPhotoIds: [10, 11, 12, 13],
      targetCollapsed: false,
      overPhotoIndex: 2,
      pointerOnLeftHalf: true,
    });
    expect(plan).toEqual({ type: 'reorder', albumId: 1, photoIds: [11, 10, 12, 13] });
    expect(isPointerOnLeftHalf(10, 0, 100)).toBe(true);
    expect(isPointerOnLeftHalf(80, 0, 100)).toBe(false);
  });

  it('計算跨相簿插入位置，收合相簿則加到末尾', () => {
    const inserted = planDrop({
      photoId: 10,
      sourceAlbumId: 1,
      sourcePhotoIds: [10, 11],
      targetAlbumId: 2,
      targetPhotoIds: [20, 21],
      targetCollapsed: false,
      overPhotoIndex: 0,
      pointerOnLeftHalf: false,
    });
    expect(inserted).toMatchObject({ type: 'move', targetIndex: 1 });

    const collapsed = planDrop({
      photoId: 10,
      sourceAlbumId: 1,
      sourcePhotoIds: [10],
      targetAlbumId: 2,
      targetPhotoIds: [20, 21],
      targetCollapsed: true,
      overPhotoIndex: 0,
      pointerOnLeftHalf: true,
    });
    expect(collapsed).toMatchObject({ type: 'move', targetIndex: 2 });
  });

  it('按 Esc 或放在無效區域時還原快照', () => {
    expect(shouldRestoreSnapshot({ cancelled: true, dropped: false })).toBe(true);
    expect(shouldRestoreSnapshot({ cancelled: false, dropped: false })).toBe(true);
    expect(shouldRestoreSnapshot({ cancelled: false, dropped: true })).toBe(false);

    replaceGroups([
      {
        yearMonth: '2026-10',
        label: '2026 年 10 月',
        albums: [
          {
            id: 1,
            title: '來源',
            albumDate: '2026-10-02',
            isCollapsed: false,
            photoCount: 4,
            photos: sourcePhotos,
          },
          {
            id: 2,
            title: '目標',
            albumDate: '2026-10-01',
            isCollapsed: true,
            photoCount: 0,
            photos: [],
          },
        ],
      },
    ]);
    const snapshot = createSnapshot();
    replaceGroups(withReorderedPhotos(snapshot.groups, 1, [13, 12, 11, 10]));
    expect(snapshot.groups[0].albums[0].photos.map((photo) => photo.id)).toEqual([10, 11, 12, 13]);
    restoreSnapshot(snapshot);
    const moved = withMovedPhoto(snapshot.groups, {
      photoId: 10,
      sourceAlbumId: 1,
      targetAlbumId: 2,
      targetIndex: 0,
    });
    expect(moved[0].albums[1].photos.map((photo) => photo.id)).toEqual([10]);
    expect(moved[0].albums[0].photoCount).toBe(3);
    restoreSnapshot(snapshot);
    expect(snapshot.groups[0].albums[0].photoCount).toBe(4);
  });

  it('200 張照片的順序計算低於 100 毫秒', () => {
    const ids = Array.from({ length: 200 }, (_, index) => index + 1);
    const started = performance.now();
    const next = reorderPhotoIds(ids, 0, 199);
    expect(performance.now() - started).toBeLessThan(100);
    expect(next[199]).toBe(1);
    expect(next).toHaveLength(200);
  });
});
