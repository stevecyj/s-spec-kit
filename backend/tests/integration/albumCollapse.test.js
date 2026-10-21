import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp, resetTables, setupApp, shutdownApp } from '../helpers/testApp.js';

beforeAll(async () => {
  await setupApp();
});

afterAll(async () => {
  await shutdownApp();
});

beforeEach(async () => {
  await resetTables();
});

describe('相簿收合狀態', () => {
  it('把 isCollapsed 存進 is_collapsed，重新查詢後仍然保留', async () => {
    const created = await request(getApp())
      .post('/api/albums')
      .send({ title: '收合測試', albumDate: '2026-10-01' });
    expect(created.body.data.isCollapsed).toBe(false);

    const collapsed = await request(getApp())
      .patch(`/api/albums/${created.body.data.id}`)
      .send({ isCollapsed: true });
    expect(collapsed.status).toBe(200);
    expect(collapsed.body.data.isCollapsed).toBe(true);

    const grouped = await request(getApp()).get('/api/albums/grouped');
    expect(grouped.body.data.groups[0].albums[0].isCollapsed).toBe(true);

    const expanded = await request(getApp())
      .patch(`/api/albums/${created.body.data.id}`)
      .send({ isCollapsed: false });
    expect(expanded.body.data.isCollapsed).toBe(false);
  });
});
