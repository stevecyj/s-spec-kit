import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} title
 * @param {string} albumDate
 */
async function createAlbum(page, title, albumDate) {
  await page.getByTestId('create-album').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('相簿名稱').fill(title);
  await dialog.getByLabel('相簿日期').fill(albumDate);
  await dialog.getByRole('button', { name: '建立相簿' }).click();
  await expect(page.getByRole('heading', { level: 3, name: title })).toBeVisible();
}

test.beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'album-e2e-'));
  fs.writeFileSync(path.join(dir, 'one.png'), tinyPng);
  fs.writeFileSync(path.join(dir, 'two.png'), tinyPng);
  fs.writeFileSync(path.join(dir, 'three.png'), tinyPng);
  fs.writeFileSync(path.join(dir, 'example.bmp'), Buffer.from('BM fake'));
  const huge = path.join(dir, 'huge.jpg');
  const handle = fs.openSync(huge, 'w');
  fs.writeSync(handle, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.ftruncateSync(handle, 20 * 1024 * 1024 + 1);
  fs.closeSync(handle);
  process.env.E2E_FIXTURE_DIR = dir;
});

test('建立相簿、年月分組、格式攔截、平鋪預覽、拖放與重新整理後仍保留', async ({ page }) => {
  const fixtureDir = process.env.E2E_FIXTURE_DIR;
  if (!fixtureDir) throw new Error('缺少測試圖片目錄');

  await page.goto('/');
  await expect(page.getByTestId('empty-library')).toContainText('還沒有任何相簿');
  await expect(page.getByRole('button', { name: '新增子相簿' })).toHaveCount(0);

  await createAlbum(page, '2026 阿里山日出', '2026-10-15');
  await createAlbum(page, '夏日海邊', '2026-08-20');
  const headings = await page.locator('.date-group h2').allTextContents();
  expect(headings).toEqual(['2026 年 10 月', '2026 年 8 月']);
  await expect(
    page.getByTestId('album-card').filter({ hasText: '夏日海邊' }).getByTestId('empty-album'),
  ).toContainText('此相簿還沒有照片');

  await page.getByTestId('import-photos').click();
  const upload = page.getByRole('dialog');
  await upload.getByLabel('歸入既有相簿').check();
  await upload.getByLabel('選擇相簿').selectOption({ label: '2026 阿里山日出' });
  await upload
    .getByLabel('照片檔案')
    .setInputFiles([
      path.join(fixtureDir, 'one.png'),
      path.join(fixtureDir, 'two.png'),
      path.join(fixtureDir, 'three.png'),
      path.join(fixtureDir, 'example.bmp'),
      path.join(fixtureDir, 'huge.jpg'),
    ]);
  await upload.getByRole('button', { name: '開始匯入' }).click();
  await expect(page.getByTestId('toast').last()).toContainText('略過');
  await expect(page.getByTestId('toast').last()).toContainText('格式不支援');
  await expect(page.getByTestId('toast').last()).toContainText('20 MB');

  const sunrise = page.getByTestId('album-card').filter({ hasText: '2026 阿里山日出' });
  await expect(sunrise.getByTestId('photo-tile')).toHaveCount(3);
  const grid = sunrise.getByTestId('photo-grid');
  await expect(grid).toHaveCSS('display', 'grid');

  await sunrise.getByTestId('collapse-toggle').click();
  await expect(sunrise.getByTestId('collapse-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(sunrise).toHaveClass(/album-card--collapsed/);
  await sunrise.getByTestId('collapse-toggle').click();
  await expect(sunrise.getByTestId('collapse-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(sunrise.getByTestId('photo-tile')).toHaveCount(3);

  const before = await sunrise
    .getByTestId('photo-tile')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-photo-id')));
  await sunrise.getByTestId('photo-tile').first().press('ArrowRight');
  await expect
    .poll(async () =>
      sunrise
        .getByTestId('photo-tile')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-photo-id'))),
    )
    .not.toEqual(before);

  const afterKeyboard = await sunrise
    .getByTestId('photo-tile')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-photo-id')));
  await page.reload();
  await expect(page.getByRole('heading', { level: 3, name: '2026 阿里山日出' })).toBeVisible();
  const sunriseAfterReload = page.getByTestId('album-card').filter({ hasText: '2026 阿里山日出' });
  await expect
    .poll(async () =>
      sunriseAfterReload
        .getByTestId('photo-tile')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-photo-id'))),
    )
    .toEqual(afterKeyboard);

  const beach = page.getByTestId('album-card').filter({ hasText: '夏日海邊' });
  await beach.getByTestId('collapse-toggle').click();
  await sunriseAfterReload
    .getByTestId('photo-tile')
    .first()
    .dragTo(beach.getByTestId('album-header'));
  await expect(beach.getByText('共 1 張照片')).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId('album-card').filter({ hasText: '夏日海邊' }).getByText('共 1 張照片'),
  ).toBeVisible();

  const idsBeforeCancel = await page
    .getByTestId('album-card')
    .filter({ hasText: '2026 阿里山日出' })
    .getByTestId('photo-tile')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-photo-id')));
  const source = page
    .getByTestId('album-card')
    .filter({ hasText: '2026 阿里山日出' })
    .getByTestId('photo-tile')
    .first();
  await source.dispatchEvent('dragstart');
  await page.keyboard.press('Escape');
  await source.dispatchEvent('dragend');
  await expect
    .poll(async () =>
      page
        .getByTestId('album-card')
        .filter({ hasText: '2026 阿里山日出' })
        .getByTestId('photo-tile')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-photo-id'))),
    )
    .toEqual(idsBeforeCancel);
});
