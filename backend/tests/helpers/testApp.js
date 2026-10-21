import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { closePool, getPool, initDatabase } from '../../src/config/db.js';
import { createApp } from '../../src/server.js';

/** @type {import('express').Express | null} */
let app = null;

export async function setupApp() {
  process.env.UPLOAD_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'photo-album-'));
  await initDatabase();
  app = await createApp();
  return app;
}

export function getApp() {
  if (!app) throw new Error('測試應用程式尚未啟動');
  return app;
}

export async function resetTables() {
  const pool = getPool();
  await pool.query('DELETE FROM photos');
  await pool.query('DELETE FROM albums');
}

export async function shutdownApp() {
  await closePool();
  app = null;
}

/**
 * @param {'jpeg' | 'png' | 'webp' | 'gif' | 'avif'} format
 */
export async function imageBuffer(format) {
  const pipeline = sharp({
    create: { width: 12, height: 10, channels: 3, background: { r: 180, g: 40, b: 20 } },
  });
  if (format === 'jpeg') return pipeline.jpeg().toBuffer();
  if (format === 'png') return pipeline.png().toBuffer();
  if (format === 'webp') return pipeline.webp().toBuffer();
  if (format === 'gif') return pipeline.gif().toBuffer();
  return pipeline.avif().toBuffer();
}
