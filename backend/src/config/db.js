// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: path.join(backendRoot, '.env') });

/** @typedef {import('mysql2/promise').Pool} Pool */
/** @typedef {import('mysql2/promise').PoolConnection} PoolConnection */

/**
 * @typedef {object} DbConfig
 * @property {string} host
 * @property {number} port
 * @property {string} user
 * @property {string} password
 * @property {string} database
 */

/** @type {Pool | null} */
let pool = null;

/** @returns {DbConfig} */
export function getDbConfig() {
  const database = process.env.DB_NAME || 'photo_album_organizer';
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('DB_NAME 僅能包含英數與底線');
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database,
  };
}

/** @returns {Pool} */
export function getPool() {
  if (!pool) {
    const config = getDbConfig();
    pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: 'Z',
      dateStrings: true,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * @template T
 * @param {(connection: PoolConnection) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withTransaction(work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function initDatabase() {
  const config = getDbConfig();
  const admin = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.end();
  }

  const sql = await fs.readFile(new URL('../models/schema.sql', import.meta.url), 'utf8');
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const activePool = getPool();
  for (const statement of statements) {
    await activePool.query(statement);
  }
}

const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun && process.argv.includes('--init')) {
  try {
    await initDatabase();
    console.log(`資料表已初始化：${getDbConfig().database}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
