import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAlbumCard } from '../../src/components/AlbumCard.js';

/**
 * @param {ParentNode} root
 * @param {string} selector
 */
function htmlIn(root, selector) {
  const node = root.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error(`找不到 ${selector}`);
  return node;
}

/**
 * @param {import('../../src/state/store.js').Photo[]} photos
 * @returns {import('../../src/state/store.js').Album}
 */
function albumWith(photos) {
  return {
    id: 7,
    title: '太魯閣秋日健行',
    albumDate: '2026-10-18',
    isCollapsed: false,
    photoCount: photos.length,
    photos,
  };
}

const photo = {
  id: 101,
  albumId: 7,
  originalFilename: 'IMG_0001.JPG',
  thumbnailUrl: '/uploads/thumbnails/example.webp',
  originalUrl: '/uploads/originals/example.jpg',
  mimeType: 'image/jpeg',
  fileSizeBytes: 1200,
  width: 400,
  height: 400,
  takenAt: '2026-10-18T09:30:00.000Z',
  sortOrder: 0,
};

describe('平鋪式照片預覽', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="dialog-root"></div>';
  });

  it('空白相簿顯示繁體中文提示與新增照片按鈕', () => {
    const view = renderAlbumCard(albumWith([]), {
      onToggleCollapse: vi.fn(),
      onDelete: vi.fn(),
      onUpdate: vi.fn(),
      onAddPhotos: vi.fn(),
      onRemovePhoto: vi.fn(),
    });
    expect(view.textContent).toContain('此相簿還沒有照片');
    expect(htmlIn(view, '[data-testid="empty-album"]').hidden).toBe(false);
    expect(htmlIn(view, '[data-testid="photo-grid"]').hidden).toBe(true);
    expect(view.querySelector('[data-testid="add-photos"]')?.textContent).toBe('新增照片');
  });

  it('展開時渲染縮圖，收合時隱藏網格並切換狀態', () => {
    const onToggleCollapse = vi.fn();
    const expanded = renderAlbumCard(albumWith([photo]), {
      onToggleCollapse,
      onDelete: vi.fn(),
      onUpdate: vi.fn(),
      onAddPhotos: vi.fn(),
      onRemovePhoto: vi.fn(),
    });
    const image = expanded.querySelector('img');
    expect(image?.getAttribute('src')).toBe(photo.thumbnailUrl);
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
    expect(htmlIn(expanded, '[data-testid="photo-grid"]').hidden).toBe(false);
    expanded
      .querySelector('[data-testid="collapse-toggle"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onToggleCollapse).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), true);

    const collapsed = renderAlbumCard(
      { ...albumWith([photo]), isCollapsed: true },
      {
        onToggleCollapse: vi.fn(),
        onDelete: vi.fn(),
        onUpdate: vi.fn(),
        onAddPhotos: vi.fn(),
        onRemovePhoto: vi.fn(),
      },
    );
    expect(collapsed.classList.contains('album-card--collapsed')).toBe(true);
    expect(
      collapsed.querySelector('[data-testid="collapse-toggle"]')?.getAttribute('aria-expanded'),
    ).toBe('false');
    expect(htmlIn(collapsed, '[data-testid="photo-grid"]').hidden).toBe(true);
    expect(htmlIn(collapsed, '[data-testid="empty-album"]').hidden).toBe(true);
  });
});
